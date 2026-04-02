import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";
import { degToCardinal } from "./weather";
import { parseBlocks } from "./occupancy";
import { balancePointForSlot } from "./balance-point";

const OPEN_THRESHOLD     = 55;
const PRECIP_HARD_CUTOFF = 0.40;
const DEW_POINT_CEILING  = 65;
const MIN_OPEN_SLOTS     = 2;   // require at least 6h (2×3h slots) of good conditions
const COMFORT_BIAS_CAP   = 5;

export interface OpenPeriod { from: string; to: string; reason: string; multiDay: boolean; startDate: string; }

export interface RecommendationResult {
  shouldOpen:  boolean;
  openPeriods: OpenPeriod[];
  reasoning:   string;
  slotScores:  { date: string; hour: number; score: number; open: boolean }[];
}

const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmt12h(hour: number): string {
  const h = hour % 24;
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function fmtSlotLabel(date: string, hour: number, isMultiDay: boolean): string {
  if (!isMultiDay) return fmt12h(hour);
  const d = new Date(date + "T12:00:00Z");
  return `${DOW_SHORT[d.getUTCDay()]} ${fmt12h(hour)}`;
}

function wallDirs(room: Room & { exteriorWalls: { direction: string }[] }): Set<string> {
  return new Set(room.exteriorWalls.map(w => w.direction));
}

function isCrossBreezeFavourable(windDeg: number, walls: Set<string>): boolean {
  const incoming = degToCardinal(windDeg);
  for (const wall of walls) { if (incoming.includes(wall)) return true; }
  return false;
}

function scoreSlot(
  slot:      HourlySlot,
  room:      Room & { exteriorWalls: { direction: string }[] },
  balancePt: number,
): { score: number; blocked: string | null } {
  const walls = wallDirs(room);
  if (slot.precipProb >= PRECIP_HARD_CUTOFF)
    return { score:0, blocked:`${Math.round(slot.precipProb*100)}% chance of rain` };
  if (slot.dewPointF > DEW_POINT_CEILING)
    return { score:0, blocked:`dew point ${slot.dewPointF.toFixed(0)}°F — too muggy` };
  if (slot.tempF > room.maxTempF)
    return { score:0, blocked:`outdoor temp ${slot.tempF.toFixed(0)}°F exceeds comfort ceiling` };

  let tempScore = slot.tempF <= balancePt ? 40
    : Math.max(0, Math.round(40 * (1 - (slot.tempF - balancePt) / Math.max(room.maxTempF - balancePt, 1))));

  let humidScore = 0;
  if      (slot.humidity >= room.minHumidity && slot.humidity <= room.maxHumidity) humidScore = 30;
  else if (slot.humidity < room.minHumidity)  humidScore = Math.round(30 * (slot.humidity / room.minHumidity));
  else    humidScore = Math.max(0, Math.round(30 * (1 - (slot.humidity - room.maxHumidity) / 30)));

  const dewScore    = Math.min(20, Math.round(Math.max(0, 20 * (1 - (slot.dewPointF - 55) / (DEW_POINT_CEILING - 55)))));
  const precipScore = Math.round(10 * (1 - slot.precipProb / PRECIP_HARD_CUTOFF));
  const windBonus   = (room.hasCrossBreeze && isCrossBreezeFavourable(slot.windDeg, walls)) ? 10 : 0;
  return { score: Math.min(100, tempScore + humidScore + dewScore + precipScore + windBonus), blocked: null };
}

function buildReason(slots: HourlySlot[], room: Room, balancePt: number): string {
  const avgTemp = Math.round(slots.map(s=>s.tempF).reduce((a,b)=>a+b,0)/slots.length);
  const avgHum  = Math.round(slots.map(s=>s.humidity).reduce((a,b)=>a+b,0)/slots.length);
  const maxPop  = Math.max(...slots.map(s=>s.precipProb));
  const hasCB   = room.hasCrossBreeze && slots.some(s=>s.windSpeedMph>5);
  const parts: string[] = [];
  if (avgTemp <= balancePt) parts.push(`avg ${avgTemp}°F — below your balance point of ${balancePt}°F`);
  else                      parts.push(`avg ${avgTemp}°F — within your comfort zone`);
  if (avgHum >= room.minHumidity && avgHum <= room.maxHumidity) parts.push(`humidity avg ${avgHum}% — in range`);
  else if (avgHum < room.minHumidity) parts.push(`humidity low (avg ${avgHum}%)`);
  else                                parts.push(`humidity slightly elevated (avg ${avgHum}%)`);
  if (maxPop > 0.1) parts.push(`${Math.round(maxPop*100)}% rain chance`);
  else              parts.push("no meaningful rain risk");
  if (hasCB) parts.push("good cross-breeze");
  return parts.join("; ") + ".";
}

export function generateRecommendation(
  room: Room & { exteriorWalls: { direction: string }[] },
  days: DayForecast[],
  easternToday?: string,  // YYYY-MM-DD Eastern — pass from server to avoid UTC mismatch
): RecommendationResult {
  // Use provided Eastern date, or fall back to days[0] date (may be UTC-offset)
  const today = easternToday ?? days[0]?.date ?? new Date().toISOString().slice(0,10);
  const bias   = Math.max(-COMFORT_BIAS_CAP, Math.min(COMFORT_BIAS_CAP, room.comfortBias ?? 0));
  const blocks = parseBlocks(room);

  // Score all slots across all days using per-slot balance point
  const allScored: { slot:HourlySlot; date:string; score:number; open:boolean; blocked:string|null; slotBP:number }[] = [];

  for (const day of days) {
    for (const slot of day.slots) {
      const dow    = new Date(slot.ts * 1000).getUTCDay();
      const slotBP = balancePointForSlot(room as never, dow, slot.hour, bias, slot.precipProb);
      const { score, blocked } = scoreSlot(slot, room, slotBP);
      allScored.push({ slot, date: day.date, score, open: score >= OPEN_THRESHOLD, blocked, slotBP });
    }
  }

  allScored.sort((a, b) => a.slot.ts - b.slot.ts);

  // Merge contiguous open runs
  const openPeriods: OpenPeriod[] = [];
  let runStart: typeof allScored[0] | null = null;
  let runSlots: HourlySlot[] = [];
  let runDates: string[]     = [];

  const flush = () => {
    if (!runStart || runSlots.length < MIN_OPEN_SLOTS) { runStart=null; runSlots=[]; runDates=[]; return; }
    const last     = allScored.find(s => s.slot === runSlots[runSlots.length-1])!;
    const spansDays = new Set(runDates).size > 1;
    const endHourRaw = last.slot.hour + 3;
    const endHour    = endHourRaw % 24;
    const endDate    = endHourRaw >= 24
      ? (() => { const d=new Date(last.date+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); })()
      : last.date;
    openPeriods.push({
      from:      fmtSlotLabel(runStart.date, runStart.slot.hour, spansDays),
      to:        fmtSlotLabel(endDate, endHour===0?0:endHour, spansDays),
      reason:    buildReason(runSlots, room, runStart.slotBP),
      multiDay:  spansDays,
      startDate: runStart.date,
    });
    runStart=null; runSlots=[]; runDates=[];
  };

  for (let i = 0; i <= allScored.length; i++) {
    const cur = allScored[i];
    if (cur?.open && !runStart)  { runStart=cur; runSlots=[cur.slot]; runDates=[cur.date]; }
    else if (cur?.open)          { runSlots.push(cur.slot); runDates.push(cur.date); }
    else if (!cur?.open && runStart) { flush(); }
  }
  flush();

  const todayScored = allScored.filter(s => s.date === today);
  const shouldOpen  = todayScored.some(s => s.open);
  const storedBP    = room.balancePoint ?? room.maxTempF - 20;

  const biasNote = Math.abs(bias) >= 0.5
    ? ` (bias adjusted ${bias>0?"down":"up"} ${Math.abs(bias).toFixed(1)}°F)`
    : "";
  const todayHigh = days[0]?.highF;
  const todayLow  = days[0]?.lowF;
  const tempLine  = todayHigh != null ? `Today: high ${todayHigh.toFixed(0)}°F / low ${todayLow?.toFixed(0)}°F. ` : "";

  let reasoning: string;
  if (shouldOpen && openPeriods.length > 0) {
    const multi = openPeriods.filter(p=>p.multiDay).length > 0;
    reasoning = multi
      ? `${tempLine}Good conditions span multiple days. Avg balance point ~${storedBP.toFixed(1)}°F${biasNote}.`
      : `${tempLine}Good conditions available today. Avg balance point ~${storedBP.toFixed(1)}°F${biasNote}.`;
  } else {
    const blocked = todayScored.filter(s=>s.blocked);
    const tooHot  = todayScored.filter(s=>!s.blocked&&s.slot.tempF>room.maxTempF);
    if (blocked.length >= todayScored.length*0.6 && blocked[0])
      reasoning = `Keep closed today. ${blocked[0].blocked!.charAt(0).toUpperCase()+blocked[0].blocked!.slice(1)} for most of the day${biasNote}.`;
    else if (tooHot.length > todayScored.length*0.5)
      reasoning = `Keep closed. Outdoor temps (high ${todayHigh?.toFixed(0)}°F) exceed your comfort ceiling of ${room.maxTempF}°F${biasNote}.`;
    else
      reasoning = `No good conditions today — outdoor conditions don't stay within range long enough${biasNote}.`;
  }

  return {
    shouldOpen, openPeriods, reasoning,
    slotScores: allScored.map(s => ({ date:s.date, hour:s.slot.hour, score:s.score, open:s.open, slotBP:s.slotBP })),
  };
}
