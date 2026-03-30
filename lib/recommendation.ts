/**
 * Recommendation Engine
 * =====================
 * Scores every 3-hour slot across the full forecast (up to 5 days),
 * finds contiguous open runs regardless of day boundaries, and
 * returns the complete window duration even if it spans multiple days.
 */

import type { Room, OccupancySchedule } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";
import { degToCardinal } from "./weather";
import { occupancyRateForSlot, HEAT_SOURCE_RATE } from "./balance-point";

// ─── Thresholds ───────────────────────────────────────────────────────────────
const OPEN_THRESHOLD     = 55;
const PRECIP_HARD_CUTOFF = 0.40;
const DEW_POINT_CEILING  = 65;    // °F
const MIN_OPEN_SLOTS     = 1;     // minimum consecutive open slots to report a window
const COMFORT_BIAS_CAP   = 5;     // ±°F

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenPeriod {
  from:     string;   // "6:00 AM" or "Mon 6:00 AM" for multi-day
  to:       string;
  reason:   string;
  multiDay: boolean;  // true when the window spans a calendar day boundary
}

export interface RecommendationResult {
  shouldOpen:   boolean;
  openPeriods:  OpenPeriod[];
  reasoning:    string;
  slotScores:   { date: string; hour: number; score: number; open: boolean }[];
}

// ─── Flat scored slot (across all days) ──────────────────────────────────────

interface ScoredSlot {
  slot:    HourlySlot;
  date:    string;      // YYYY-MM-DD
  score:   number;
  open:    boolean;
  blocked: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmt12h(hour: number): string {
  const h = hour % 24;
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function fmtSlotLabel(date: string, hour: number, todayDate: string, isMultiDay: boolean): string {
  if (!isMultiDay) return fmt12h(hour);
  const d   = new Date(date + "T12:00:00Z");
  const dow = DOW_SHORT[d.getUTCDay()];
  return `${dow} ${fmt12h(hour)}`;
}

function wallDirs(room: Room & { exteriorWalls: { direction: string }[] }): Set<string> {
  return new Set(room.exteriorWalls.map(w => w.direction));
}

function isCrossBreezeFavourable(windDeg: number, walls: Set<string>): boolean {
  const incoming = degToCardinal(windDeg);
  for (const wall of walls) {
    if (incoming.includes(wall)) return true;
  }
  return false;
}

// ─── Per-slot scoring ─────────────────────────────────────────────────────────

function scoreSlot(
  slot:      HourlySlot,
  room:      Room & { exteriorWalls: { direction: string }[] },
  balancePt: number,
): { score: number; blocked: string | null } {
  const walls = wallDirs(room);

  // Hard blocks
  if (slot.precipProb >= PRECIP_HARD_CUTOFF)
    return { score: 0, blocked: `${Math.round(slot.precipProb * 100)}% chance of rain` };
  if (slot.dewPointF > DEW_POINT_CEILING)
    return { score: 0, blocked: `dew point ${slot.dewPointF.toFixed(0)}°F — too muggy` };
  if (slot.tempF > room.maxTempF)
    return { score: 0, blocked: `outdoor temp ${slot.tempF.toFixed(0)}°F exceeds comfort ceiling` };

  // Temperature score (0–40)
  let tempScore = 0;
  if (slot.tempF <= balancePt) {
    tempScore = 40;
  } else {
    const range = room.maxTempF - balancePt;
    tempScore   = Math.round(40 * (1 - (slot.tempF - balancePt) / Math.max(range, 1)));
  }

  // Humidity score (0–30)
  let humidScore = 0;
  if (slot.humidity >= room.minHumidity && slot.humidity <= room.maxHumidity) {
    humidScore = 30;
  } else if (slot.humidity < room.minHumidity) {
    humidScore = Math.round(30 * (slot.humidity / room.minHumidity));
  } else {
    humidScore = Math.max(0, Math.round(30 * (1 - (slot.humidity - room.maxHumidity) / 30)));
  }

  // Dew point score (0–20, capped)
  const dewScore = Math.min(20, Math.round(
    Math.max(0, 20 * (1 - (slot.dewPointF - 55) / (DEW_POINT_CEILING - 55)))
  ));

  // Precipitation soft penalty (0–10)
  const precipScore = Math.round(10 * (1 - slot.precipProb / PRECIP_HARD_CUTOFF));

  // Cross-breeze bonus (+10)
  const windBonus = (room.hasCrossBreeze && isCrossBreezeFavourable(slot.windDeg, walls)) ? 10 : 0;

  return {
    score:   Math.min(100, tempScore + humidScore + dewScore + precipScore + windBonus),
    blocked: null,
  };
}

// ─── Reason builder for a run of slots ───────────────────────────────────────

function buildReason(slots: HourlySlot[], room: Room, balancePt: number): string {
  const avgTemp = Math.round(slots.map(s => s.tempF).reduce((a, b) => a + b, 0) / slots.length);
  const avgHum  = Math.round(slots.map(s => s.humidity).reduce((a, b) => a + b, 0) / slots.length);
  const maxPop  = Math.max(...slots.map(s => s.precipProb));
  const hasCB   = room.hasCrossBreeze && slots.some(s => s.windSpeedMph > 5);

  const parts: string[] = [];
  if (avgTemp <= balancePt)
    parts.push(`avg ${avgTemp}°F — below your balance point of ${balancePt}°F`);
  else
    parts.push(`avg ${avgTemp}°F — within your comfort zone`);

  if (avgHum >= room.minHumidity && avgHum <= room.maxHumidity)
    parts.push(`humidity avg ${avgHum}% — in range`);
  else if (avgHum < room.minHumidity)
    parts.push(`humidity low (avg ${avgHum}%)`);
  else
    parts.push(`humidity slightly elevated (avg ${avgHum}%)`);

  if (maxPop > 0.1) parts.push(`${Math.round(maxPop * 100)}% rain chance`);
  else              parts.push("no meaningful rain risk");
  if (hasCB)        parts.push("good cross-breeze");

  return parts.join("; ") + ".";
}

// ─── Main function ────────────────────────────────────────────────────────────

export function generateRecommendation(
  room: Room & { exteriorWalls: { direction: string }[] },
  days: DayForecast[],   // full forecast — may be 1–5 days
): RecommendationResult {
  const today = days[0]?.date ?? new Date().toISOString().slice(0, 10);

  // Apply comfort bias
  const bias      = Math.max(-COMFORT_BIAS_CAP, Math.min(COMFORT_BIAS_CAP, room.comfortBias ?? 0));
  const rawBP     = room.balancePoint ?? room.maxTempF - 20;
  const balancePt = Math.round((rawBP - bias) * 10) / 10;

  // Parse occupancy schedule
  let schedule: OccupancySchedule = {};
  try { schedule = JSON.parse(room.occupancySchedule || "{}"); } catch { /* empty */ }
  const heatRate = HEAT_SOURCE_RATE[room.heatSourceLevel] ?? 1.5;

  // ── Flatten all slots across all days into one scored timeline ──────────────
  const allScored: ScoredSlot[] = [];

  for (const day of days) {
    for (const slot of day.slots) {
      // Slot-level balance point adjustment for occupancy
      const slotDate  = new Date(slot.ts * 1000);
      const dow       = slotDate.getUTCDay();
      const occRate   = occupancyRateForSlot(schedule, dow, slot.hour);
      // Unoccupied rooms are slightly easier to cool → raise effective BP modestly
      const slotBP    = balancePt + (occRate < 3.5 ? (3.5 - occRate) * 0.5 : 0);

      const { score, blocked } = scoreSlot(slot, room, slotBP);

      allScored.push({
        slot,
        date:    day.date,
        score,
        open:    score >= OPEN_THRESHOLD,
        blocked,
      });
    }
  }

  // Sort by timestamp to ensure chronological order across days
  allScored.sort((a, b) => a.slot.ts - b.slot.ts);

  // ── Find contiguous open runs across the full timeline ──────────────────────
  const openPeriods: OpenPeriod[] = [];
  let runStart:  ScoredSlot | null = null;
  let runSlots:  HourlySlot[]      = [];
  let runDates:  string[]          = [];

  const flush = () => {
    if (!runStart || runSlots.length < MIN_OPEN_SLOTS) { runStart = null; runSlots = []; runDates = []; return; }

    const lastScored = allScored.find(s => s.slot === runSlots[runSlots.length - 1])!;
    const spansDays  = new Set(runDates).size > 1;

    const endHourRaw = lastScored.slot.hour + 3;
    const endHour    = endHourRaw % 24;
    const endDate    = endHourRaw >= 24
      ? (() => { const d = new Date(lastScored.date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })()
      : lastScored.date;

    openPeriods.push({
      from:     fmtSlotLabel(runStart.date, runStart.slot.hour, today, spansDays),
      to:       fmtSlotLabel(endDate, endHour === 0 ? 0 : endHour, today, spansDays),
      reason:   buildReason(runSlots, room, balancePt),
      multiDay: spansDays,
    });

    runStart = null; runSlots = []; runDates = [];
  };

  for (let i = 0; i <= allScored.length; i++) {
    const cur    = allScored[i];
    const isOpen = cur?.open ?? false;

    if (isOpen && !runStart) {
      runStart = cur;
      runSlots = [cur.slot];
      runDates = [cur.date];
    } else if (isOpen && runStart) {
      runSlots.push(cur.slot);
      runDates.push(cur.date);
    } else if (!isOpen && runStart) {
      flush();
    }
  }
  flush();

  // ── Determine today's status — does the first open period start today? ──────
  const todayScored = allScored.filter(s => s.date === today);
  const shouldOpen  = openPeriods.some(p => {
    // Period is relevant today if any of its slots fall on today
    const runDaySet = new Set(
      allScored
        .filter(s => s.open)
        .filter(s => {
          // Belongs to the same run as this period
          const runSlotTs = allScored.filter(s2 => s2.open).map(s2 => s2.slot.ts);
          return runSlotTs.includes(s.slot.ts);
        })
        .map(s => s.date)
    );
    return runDaySet.has(today);
  }) || todayScored.some(s => s.open);

  // ── Build overall reasoning ─────────────────────────────────────────────────
  const biasNote = Math.abs(bias) >= 0.5
    ? ` (balance point adjusted ${bias > 0 ? "down" : "up"} ${Math.abs(bias).toFixed(1)}°F from feedback)`
    : "";

  const todayHigh = days[0]?.highF;
  const todayLow  = days[0]?.lowF;
  const tempLine  = todayHigh != null
    ? `Today: high ${todayHigh.toFixed(0)}°F / low ${todayLow?.toFixed(0)}°F. `
    : "";

  let reasoning: string;
  if (shouldOpen && openPeriods.length > 0) {
    const multiDayPeriods = openPeriods.filter(p => p.multiDay);
    if (multiDayPeriods.length > 0) {
      reasoning = `${tempLine}Extended open window available — conditions stay favourable across multiple days. ` +
        `Effective balance point ${balancePt}°F${biasNote}.`;
    } else {
      reasoning = `${tempLine}Open during ${openPeriods.length === 1 ? "one period" : `${openPeriods.length} periods`} today. ` +
        `Effective balance point ${balancePt}°F${biasNote}.`;
    }
  } else {
    const blocked = allScored.filter(s => s.date === today && s.blocked);
    const tooHot  = todayScored.filter(s => !s.blocked && s.slot.tempF > room.maxTempF);
    if (blocked.length >= todayScored.length * 0.6 && blocked[0]) {
      const top = blocked[0].blocked!;
      reasoning = `Keep windows closed today. ${top.charAt(0).toUpperCase() + top.slice(1)} for most of the day${biasNote}.`;
    } else if (tooHot.length > todayScored.length * 0.5) {
      reasoning = `Keep windows closed. Outdoor temps (high ${todayHigh?.toFixed(0)}°F) exceed your comfort ceiling of ${room.maxTempF}°F${biasNote}.`;
    } else {
      reasoning = `No sustained open window today — conditions don't stay within range long enough${biasNote}.`;
    }
  }

  return {
    shouldOpen,
    openPeriods,
    reasoning,
    slotScores: allScored.map(s => ({
      date:  s.date,
      hour:  s.slot.hour,
      score: s.score,
      open:  s.open,
    })),
  };
}
