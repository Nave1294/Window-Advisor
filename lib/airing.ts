/**
 * CO2 Airing Recommendation Engine
 * ==================================
 * Computes how often a room needs fresh air based on occupancy and volume,
 * then finds the least thermally disruptive time slots within occupied
 * waking hours to open the windows briefly for air quality.
 *
 * Temperature-driven recommendations can happen any time.
 * Airing recommendations only during occupied waking hours (7 AM – 10 PM).
 */

import type { Room, OccupancySchedule, OccupancyLevel } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

// ─── Constants ────────────────────────────────────────────────────────────────

const CO2_EXHALED_L_PER_MIN     = 0.24;  // liters of CO2 per person per minute
const FT3_TO_LITERS             = 28.317;
const CO2_PPM_TARGET_RISE       = 600;   // ppm above outdoor baseline before airing needed
const AIRING_DURATION_MIN       = 12;    // minutes a brief open window takes to clear CO2
const WAKING_HOUR_START         = 7;     // 7 AM
const WAKING_HOUR_END           = 22;    // 10 PM
const PRECIP_AIRING_CUTOFF      = 0.50;  // skip airing if >50% rain chance (higher than main threshold)
const MIN_AIRING_INTERVAL_MIN   = 20;    // never recommend more often than this
const MAX_AIRING_INTERVAL_MIN   = 180;   // cap at 3 hours even for large/empty rooms

// ─── People count from occupancy level ───────────────────────────────────────

const PEOPLE_COUNT: Record<OccupancyLevel, number> = {
  EMPTY:      0,
  ONE_TWO:    1.5,  // midpoint
  THREE_FOUR: 3.5,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiringWindow {
  date:         string;   // YYYY-MM-DD
  hour:         number;   // suggested start hour (local)
  label:        string;   // "e.g. 9:00 AM – 9:12 AM"
  reason:       string;   // why this slot was chosen
  disruption:   "low" | "moderate" | "high";
  intervalMins: number;   // how often to air (for display)
}

export interface AiringResult {
  intervalMins:    number;       // how often airing is needed
  windows:         AiringWindow[];
  summary:         string;       // one-line summary for email/dashboard
  needsAiring:     boolean;      // false if room is unoccupied or huge
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12h(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
}

function fmtRange(startHour: number, durationMin: number): string {
  const endMin   = startHour * 60 + durationMin;
  const endHour  = Math.floor(endMin / 60) % 24;
  const endMins  = endMin % 60;
  const endStr   = endMins === 0 ? fmt12h(endHour) : `${fmt12h(endHour).replace(":00","")
    .replace(" ","").replace("AM","").replace("PM","")}:${String(endMins).padStart(2,"0")} ${endHour < 12 ? "AM" : "PM"}`;
  return `${fmt12h(startHour)} – ${endStr}`;
}

/** Is this hour during waking hours AND occupied on this day of week? */
function isOccupiedWakingHour(
  hour: number,
  dayOfWeek: number,
  schedule: OccupancySchedule,
): { occupied: boolean; level: OccupancyLevel } {
  if (hour < WAKING_HOUR_START || hour >= WAKING_HOUR_END)
    return { occupied: false, level: "EMPTY" };

  const period = schedule[dayOfWeek];
  if (!period || !period.occupied)
    return { occupied: false, level: "EMPTY" };

  if (hour >= period.startHour && hour < period.endHour)
    return { occupied: true, level: period.level };

  return { occupied: false, level: "EMPTY" };
}

/** Thermal disruption score for a slot — lower is better for airing */
function disruptionScore(
  slot:      HourlySlot,
  room:      Room,
  balancePt: number,
): number {
  // Skip if raining
  if (slot.precipProb >= PRECIP_AIRING_CUTOFF) return 999;

  // Temp disruption: how far is outdoor temp from the balance point?
  const tempDelta = Math.abs(slot.tempF - balancePt);

  // Humidity penalty
  const humidPenalty = slot.humidity > room.maxHumidity
    ? (slot.humidity - room.maxHumidity) * 0.5
    : 0;

  // Dew point penalty
  const dewPenalty = slot.dewPointF > 62 ? (slot.dewPointF - 62) * 1.5 : 0;

  return tempDelta + humidPenalty + dewPenalty;
}

function disruptionLabel(score: number): "low" | "moderate" | "high" {
  if (score < 8)  return "low";
  if (score < 18) return "moderate";
  return "high";
}

function slotReason(slot: HourlySlot, score: number, balancePt: number): string {
  const parts: string[] = [];

  if (score < 8) {
    parts.push(`outdoor temp (${slot.tempF.toFixed(0)}°F) is close to your balance point`);
  } else if (slot.tempF < balancePt) {
    parts.push(`outdoor air is cool (${slot.tempF.toFixed(0)}°F) — brief open won't overheat the room`);
  } else {
    parts.push(`outdoor temp (${slot.tempF.toFixed(0)}°F) — least disruptive available slot`);
  }

  if (slot.precipProb < 0.1) parts.push("no rain risk");
  if (slot.windSpeedMph > 5)  parts.push("light breeze helps flush the room faster");

  return parts.join("; ") + ".";
}

// ─── Main function ────────────────────────────────────────────────────────────

export function generateAiringRecommendations(
  room:      Room,
  days:      DayForecast[],
  balancePt: number,
): AiringResult {
  // Parse schedule
  let schedule: OccupancySchedule = {};
  try { schedule = JSON.parse(room.occupancySchedule || "{}"); } catch { /* empty */ }

  // Find peak occupancy level across the week
  const occupiedPeriods = Object.values(schedule).filter(p => p.occupied);
  if (occupiedPeriods.length === 0) {
    return {
      intervalMins: MAX_AIRING_INTERVAL_MIN,
      windows: [],
      summary: "No airing reminders — room has no occupied hours set.",
      needsAiring: false,
    };
  }

  // Use the most common/highest occupancy level for the interval calculation
  const levelCounts = occupiedPeriods.reduce((acc, p) => {
    acc[p.level] = (acc[p.level] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const peakLevel = (Object.entries(levelCounts).sort((a,b)=>b[1]-a[1])[0][0]) as OccupancyLevel;
  const peopleMid = PEOPLE_COUNT[peakLevel];

  if (peopleMid === 0) {
    return {
      intervalMins: MAX_AIRING_INTERVAL_MIN,
      windows: [],
      summary: "No airing reminders — room is unoccupied.",
      needsAiring: false,
    };
  }

  // ── CO2 interval calculation ─────────────────────────────────────────────
  // rise_rate_ppm_per_min = (people × 0.24 L/min) / (volume_L) × 1,000,000
  const volumeL     = room.lengthFt * room.widthFt * room.ceilingHeightFt * FT3_TO_LITERS;
  const riseRateMin = (peopleMid * CO2_EXHALED_L_PER_MIN / volumeL) * 1_000_000;
  const rawInterval = CO2_PPM_TARGET_RISE / riseRateMin; // minutes until threshold

  const intervalMins = Math.min(
    MAX_AIRING_INTERVAL_MIN,
    Math.max(MIN_AIRING_INTERVAL_MIN, Math.round(rawInterval / 5) * 5) // round to 5 min
  );

  // ── Find airing slots across the forecast ───────────────────────────────
  const windows: AiringWindow[] = [];

  for (const day of days) {
    // Build a map of candidate slots for today — only occupied waking hours
    const candidates: { slot: HourlySlot; score: number; dayOfWeek: number }[] = [];

    for (const slot of day.slots) {
      const slotDate  = new Date(slot.ts * 1000);
      const dow       = slotDate.getUTCDay();
      const { occupied } = isOccupiedWakingHour(slot.hour, dow, schedule);
      if (!occupied) continue;

      const score = disruptionScore(slot, room, balancePt);
      if (score < 999) candidates.push({ slot, score, dayOfWeek: dow });
    }

    if (candidates.length === 0) continue;

    // Sort by disruption score ascending
    candidates.sort((a, b) => a.score - b.score);

    // Determine how many airing windows to suggest for this day
    // Based on how many hours are occupied and the interval
    const dayPeriod = schedule[candidates[0].dayOfWeek];
    const occupiedHours = dayPeriod
      ? Math.max(0, dayPeriod.endHour - dayPeriod.startHour)
      : 0;
    const wakingOccupiedMin = occupiedHours * 60;
    const suggestCount = Math.max(1, Math.floor(wakingOccupiedMin / intervalMins));

    // Pick the best slots spread across the day, not clustered together
    const picked: typeof candidates = [];
    const minGapHours = Math.max(1, Math.floor(intervalMins / 60));

    for (const c of candidates) {
      if (picked.length >= suggestCount) break;
      // Ensure minimum spacing from already-picked slots
      const tooClose = picked.some(p =>
        Math.abs(p.slot.hour - c.slot.hour) < minGapHours
      );
      if (!tooClose) picked.push(c);
    }

    // If we still need more slots, fill from top candidates regardless of spacing
    if (picked.length < Math.min(suggestCount, 2)) {
      for (const c of candidates) {
        if (picked.length >= Math.min(suggestCount, 2)) break;
        if (!picked.includes(c)) picked.push(c);
      }
    }

    for (const { slot, score } of picked) {
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

  // ── Summary line ─────────────────────────────────────────────────────────
  const intervalLabel = intervalMins < 60
    ? `every ${intervalMins} minutes`
    : intervalMins === 60
      ? "every hour"
      : `every ${(intervalMins / 60).toFixed(1).replace(".0","")} hours`;

  const summary = `With ${peakLevel === "THREE_FOUR" ? "3–4 people" : "1–2 people"} in a ` +
    `${Math.round(room.lengthFt * room.widthFt * room.ceilingHeightFt).toLocaleString()} ft³ room, ` +
    `CO2 reaches concerning levels ${intervalLabel}. ` +
    `${AIRING_DURATION_MIN}-minute ventilation windows are suggested during occupied hours.`;

  return { intervalMins, windows, summary, needsAiring: true };
}
