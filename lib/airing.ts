/**
 * CO₂ Airing Engine
 * ==================
 * Calculates when and how often to briefly open windows to flush CO₂.
 *
 * Uses occupancy.ts (canonical) for people count per slot.
 * CO₂ rise rate = (people × exhaled_rate) / room_volume
 * Interval = target_rise / rise_rate
 *
 * Physics: ASHRAE 62.1-2022
 *   - Exhaled CO₂: ~0.26 L/min per sedentary adult
 *   - Acceptable indoor CO₂: ≤ 1000 ppm (600 ppm above 400 ppm outdoor)
 */

import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";
import { parseBlocks, isUnoccupied, inferRoomType, peopleCountForSlot } from "./occupancy";

const CO2_EXHALED_L_PER_MIN   = 0.26;   // ASHRAE 62.1 — sedentary adult
const FT3_TO_LITERS            = 28.317;
const CO2_PPM_TARGET_RISE      = 600;    // 400 outdoor → 1000 ppm target
const AIRING_DURATION_MIN      = 12;
const WAKING_HOUR_START        = 7;
const WAKING_HOUR_END          = 22;
const PRECIP_AIRING_CUTOFF     = 0.50;
const MIN_AIRING_INTERVAL_MIN  = 20;
const MAX_AIRING_INTERVAL_MIN  = 180;

export interface AiringWindow {
  date:         string;
  hour:         number;
  label:        string;
  reason:       string;
  disruption:   "low" | "moderate" | "high";
  intervalMins: number;
}

export interface AiringResult {
  intervalMins: number;
  windows:      AiringWindow[];
  summary:      string;
  needsAiring:  boolean;
}

function fmt12h(h: number): string {
  if (h === 0 || h === 24) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function fmtRange(startHour: number, durationMin: number): string {
  const endTotalMin = startHour * 60 + durationMin;
  const endH = Math.floor(endTotalMin / 60) % 24;
  const endM = endTotalMin % 60;
  const endStr = endM === 0
    ? fmt12h(endH)
    : `${endH === 0 ? 12 : endH > 12 ? endH - 12 : endH}:${String(endM).padStart(2,"0")} ${endH < 12 ? "AM" : "PM"}`;
  return `${fmt12h(startHour)} – ${endStr}`;
}

function disruptionScore(slot: HourlySlot, room: Room, balancePt: number): number {
  const tempDelta    = Math.abs(slot.tempF - balancePt);
  const humidPenalty = slot.humidity > room.maxHumidity ? (slot.humidity - room.maxHumidity) * 0.5 : 0;
  const dewPenalty   = slot.dewPointF > 62 ? (slot.dewPointF - 62) * 1.5 : 0;
  const rainPenalty  = slot.precipProb >= PRECIP_AIRING_CUTOFF ? 50 : 0;
  return tempDelta + humidPenalty + dewPenalty + rainPenalty;
}

function disruptionLabel(score: number): "low" | "moderate" | "high" {
  if (score < 8)  return "low";
  if (score < 20) return "moderate";
  return "high";
}

function slotReason(slot: HourlySlot, score: number, balancePt: number): string {
  const parts: string[] = [];
  if (slot.precipProb >= PRECIP_AIRING_CUTOFF) {
    parts.push(`best available slot despite ${Math.round(slot.precipProb * 100)}% rain — open briefly if rain pauses`);
  } else if (score < 8) {
    parts.push(`outdoor temp (${slot.tempF.toFixed(0)}°F) is close to your balance point`);
  } else if (slot.tempF < balancePt) {
    parts.push(`outdoor air is cool (${slot.tempF.toFixed(0)}°F) — brief open won't disrupt the room`);
  } else {
    parts.push(`least disruptive available slot (${slot.tempF.toFixed(0)}°F outside)`);
  }
  if (slot.precipProb < 0.1)  parts.push("no rain risk");
  if (slot.windSpeedMph > 5)  parts.push("light breeze speeds air exchange");
  return parts.join("; ") + ".";
}

export function generateAiringRecommendations(
  room:      Room,
  days:      DayForecast[],
  balancePt: number,
): AiringResult {
  const blocks   = parseBlocks(room);
  const roomType = inferRoomType(room.name, room.heatSourceLevel);
  const volumeL  = room.lengthFt * room.widthFt * room.ceilingHeightFt * FT3_TO_LITERS;

  const windows: AiringWindow[] = [];

  for (const day of days) {
    const candidates: { slot: HourlySlot; score: number; intervalMins: number }[] = [];

    for (const slot of day.slots) {
      if (slot.hour < WAKING_HOUR_START || slot.hour >= WAKING_HOUR_END) continue;
      const slotDate = new Date(slot.ts * 1000);
      const dow      = slotDate.getUTCDay();
      if (isUnoccupied(blocks, dow, slot.hour)) continue;

      // People count for this slot (canonical occupancy module)
      const people = peopleCountForSlot(room, blocks, roomType, dow, slot.hour);
      if (people === 0) continue;

      // CO₂ interval for this slot
      const riseRate     = (people * CO2_EXHALED_L_PER_MIN / volumeL) * 1_000_000;
      const rawInterval  = CO2_PPM_TARGET_RISE / riseRate;
      const slotInterval = Math.min(MAX_AIRING_INTERVAL_MIN, Math.max(MIN_AIRING_INTERVAL_MIN, Math.round(rawInterval / 5) * 5));

      const score = disruptionScore(slot, room, balancePt);
      candidates.push({ slot, score, intervalMins: slotInterval });
    }

    if (!candidates.length) continue;
    candidates.sort((a, b) => a.score - b.score);

    // Use median interval to decide how many slots to suggest
    const medianInterval = candidates[Math.floor(candidates.length / 2)].intervalMins;
    const occupiedMins   = candidates.length * 180; // 3h per OWM slot
    const suggestCount   = Math.max(1, Math.min(3, Math.floor(occupiedMins / medianInterval)));

    // Pick best non-overlapping slots
    const picked: typeof candidates = [];
    const minGapH = Math.max(1, Math.floor(medianInterval / 60));
    for (const c of candidates) {
      if (picked.length >= suggestCount) break;
      if (!picked.some(p => Math.abs(p.slot.hour - c.slot.hour) < minGapH)) picked.push(c);
    }
    // Fallback — fill remaining if gap constraint left us short
    for (const c of candidates) {
      if (picked.length >= Math.min(suggestCount, 2)) break;
      if (!picked.includes(c)) picked.push(c);
    }

    for (const { slot, score, intervalMins } of picked) {
      windows.push({
        date:         day.date,
        hour:         slot.hour,
        label:        fmtRange(slot.hour, AIRING_DURATION_MIN),
        reason:       slotReason(slot, score, balancePt),
        disruption:   disruptionLabel(score),
        intervalMins,
      });
    }
  }

  const intervals = windows.map(w => w.intervalMins);
  const medInterval = intervals.length
    ? intervals.sort((a,b)=>a-b)[Math.floor(intervals.length/2)]
    : MAX_AIRING_INTERVAL_MIN;

  const occ      = room.occupancyLevel === "THREE_FOUR" ? "3–4 people" : "1–2 people";
  const vol      = Math.round(room.lengthFt * room.widthFt * room.ceilingHeightFt).toLocaleString();
  const intLabel = medInterval < 60 ? `every ${medInterval} min` : medInterval === 60 ? "every hour" : `every ${(medInterval/60).toFixed(1).replace(".0","")} hr`;
  const summary  = `With ${occ} in a ${vol} ft³ room, CO₂ reaches 1,000 ppm ${intLabel}. ${AIRING_DURATION_MIN}-min ventilation is suggested during occupied hours.`;

  return { intervalMins: medInterval, windows, summary, needsAiring: windows.length > 0 };
}
