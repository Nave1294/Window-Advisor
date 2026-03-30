/**
 * Recommendation Engine
 * =====================
 * Given a room's balance point + comfort targets and a day's hourly forecast,
 * decides whether to open windows and identifies the best time windows.
 *
 * Decision factors per hourly slot:
 *   1. Temperature — outdoor temp vs balance point and comfort range
 *   2. Humidity    — outdoor RH vs desired indoor range
 *   3. Dew point   — absolute moisture ceiling (>65°F feels muggy regardless of RH)
 *   4. Precip prob — rain risk threshold
 *   5. Wind        — cross-breeze opportunity boosts effective cooling
 *
 * Each slot gets a score 0–100. Slots above OPEN_THRESHOLD are "open" candidates.
 * Contiguous open slots are merged into time windows with a plain-English reason.
 */

import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";
import { degToCardinal } from "./weather";

// ─── Tuneable thresholds ──────────────────────────────────────────────────────

const OPEN_THRESHOLD     = 55;   // minimum slot score to recommend open
const PRECIP_HARD_CUTOFF = 0.40; // ≥40% precip prob → never open
const DEW_POINT_CEILING  = 65;   // °F — above this it's uncomfortably humid regardless of RH
const MIN_OPEN_HOURS     = 1;    // discard windows shorter than this

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenPeriod {
  from:   string;  // "7:00 AM"
  to:     string;  // "11:00 AM"
  reason: string;
}

export interface RecommendationResult {
  shouldOpen:  boolean;
  openPeriods: OpenPeriod[];
  reasoning:   string;
  /** Slot-level scores for debugging / dashboard sparkline */
  slotScores:  { hour: number; score: number; open: boolean }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12h(hour: number): string {
  if (hour === 0)  return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
}

/** Cardinal direction of room's exterior walls as a Set for quick lookup */
function wallDirections(room: Room & { exteriorWalls: { direction: string }[] }): Set<string> {
  return new Set(room.exteriorWalls.map(w => w.direction));
}

/**
 * Returns true if the wind direction is aligned with the room's
 * cross-breeze axis (i.e. wind is coming from a direction the room has a wall on).
 */
function isCrossBreezeFavourable(windDeg: number, walls: Set<string>): boolean {
  const incoming = degToCardinal(windDeg); // e.g. "SW"
  // Check if any wall direction is within the incoming wind arc
  // Simple approach: the wind cardinal touches any exterior wall
  for (const dir of ["N","NE","E","SE","S","SW","W","NW"]) {
    if (incoming === dir || incoming.includes(dir.charAt(0))) {
      // Check if any exterior wall faces that general quadrant
      for (const wall of walls) {
        if (dir.includes(wall)) return true;
      }
    }
  }
  return false;
}

// ─── Per-slot scoring ─────────────────────────────────────────────────────────

interface ScoreBreakdown {
  total:       number;
  tempScore:   number;
  humidScore:  number;
  dewScore:    number;
  precipScore: number;
  windBonus:   number;
  blocked:     string | null; // reason this slot is hard-blocked
}

function scoreSlot(
  slot:      HourlySlot,
  room:      Room & { exteriorWalls: { direction: string }[] },
  balancePt: number,
): ScoreBreakdown {
  const walls = wallDirections(room);

  // ── Hard blocks ────────────────────────────────────────────────────────────
  if (slot.precipProb >= PRECIP_HARD_CUTOFF)
    return { total: 0, tempScore: 0, humidScore: 0, dewScore: 0, precipScore: 0, windBonus: 0,
             blocked: `${Math.round(slot.precipProb * 100)}% chance of rain` };

  if (slot.dewPointF > DEW_POINT_CEILING)
    return { total: 0, tempScore: 0, humidScore: 0, dewScore: 0, precipScore: 0, windBonus: 0,
             blocked: `dew point ${slot.dewPointF.toFixed(0)}°F — too muggy` };

  // Opening when outdoor temp exceeds the comfort ceiling actively heats the room
  if (slot.tempF > room.maxTempF)
    return { total: 0, tempScore: 0, humidScore: 0, dewScore: 0, precipScore: 0, windBonus: 0,
             blocked: `outdoor temp ${slot.tempF.toFixed(0)}°F exceeds your comfort ceiling of ${room.maxTempF}°F` };

  // ── Temperature score (0–40 pts) ───────────────────────────────────────────
  // Best score when outdoor temp is at or below the balance point.
  // Degrades linearly as temp rises above balance point.
  // Hard zero if outdoor temp exceeds maxTempF (opening would heat the room).
  let tempScore = 0;
  if (slot.tempF > room.maxTempF) {
    tempScore = 0;
  } else if (slot.tempF <= balancePt) {
    tempScore = 40; // ideal — outdoor air will cool the room
  } else {
    // Between balance point and maxTempF: partial credit
    const range = room.maxTempF - balancePt;
    const above = slot.tempF - balancePt;
    tempScore = Math.round(40 * (1 - above / range));
  }

  // ── Humidity score (0–30 pts) ──────────────────────────────────────────────
  // Full score within desired range; degrades outside it.
  let humidScore = 0;
  if (slot.humidity >= room.minHumidity && slot.humidity <= room.maxHumidity) {
    humidScore = 30;
  } else if (slot.humidity < room.minHumidity) {
    // Too dry — partial, still generally fine to open
    humidScore = Math.round(30 * (slot.humidity / room.minHumidity));
  } else {
    // Too humid — degrades more steeply
    const over = slot.humidity - room.maxHumidity;
    humidScore = Math.max(0, Math.round(30 * (1 - over / 30)));
  }

  // ── Dew point score (0–20 pts, capped) ────────────────────────────────────
  // Linear from 20pts at ≤55°F down to 0 at DEW_POINT_CEILING (65°F).
  // Capped at 20 so low dew points don't inflate the total past max.
  const dewScore = Math.min(20, Math.round(
    Math.max(0, 20 * (1 - (slot.dewPointF - 55) / (DEW_POINT_CEILING - 55)))
  ));

  // ── Precipitation penalty (0–10 pts) ──────────────────────────────────────
  // Soft penalty for low-but-nonzero rain probability (already hard-blocked above 40%)
  const precipScore = Math.round(10 * (1 - slot.precipProb / PRECIP_HARD_CUTOFF));

  // ── Cross-breeze wind bonus (+10 pts) ─────────────────────────────────────
  const windBonus = (room.hasCrossBreeze && isCrossBreezeFavourable(slot.windDeg, walls))
    ? 10 : 0;

  const total = Math.min(100, tempScore + humidScore + dewScore + precipScore + windBonus);

  return { total, tempScore, humidScore, dewScore, precipScore, windBonus, blocked: null };
}

// ─── Period reason generator ──────────────────────────────────────────────────

function buildReason(slots: HourlySlot[], room: Room, balancePt: number): string {
  const temps   = slots.map(s => s.tempF);
  const avgTemp = Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);
  const avgHum  = Math.round(slots.map(s => s.humidity).reduce((a, b) => a + b, 0) / slots.length);
  const maxPop  = Math.max(...slots.map(s => s.precipProb));
  const hasCB   = room.hasCrossBreeze && slots.some(s => s.windSpeedMph > 5);

  const parts: string[] = [];

  if (avgTemp <= balancePt) {
    parts.push(`outdoor temp (avg ${avgTemp}°F) is below your balance point of ${balancePt}°F`);
  } else {
    parts.push(`outdoor temp (avg ${avgTemp}°F) is within your comfort zone`);
  }

  if (avgHum >= room.minHumidity && avgHum <= room.maxHumidity) {
    parts.push(`humidity (avg ${avgHum}%) is in your target range`);
  } else if (avgHum < room.minHumidity) {
    parts.push(`humidity is low (avg ${avgHum}%) — will feel dry but not uncomfortable`);
  } else {
    parts.push(`humidity is slightly elevated (avg ${avgHum}%)`);
  }

  if (maxPop > 0.1) parts.push(`${Math.round(maxPop * 100)}% rain chance — watch the forecast`);
  else parts.push("no meaningful rain risk");

  if (hasCB) parts.push("good cross-breeze opportunity");

  return parts.join("; ") + ".";
}

// ─── Main function ────────────────────────────────────────────────────────────

export function generateRecommendation(
  room:      Room & { exteriorWalls: { direction: string }[] },
  day:       DayForecast,
): RecommendationResult {
  const balancePt = room.balancePoint ?? room.maxTempF - 20; // fallback if not yet calculated

  // Score every slot
  const scored = day.slots.map(slot => {
    const breakdown = scoreSlot(slot, room, balancePt);
    return { slot, breakdown, score: breakdown.total, open: breakdown.total >= OPEN_THRESHOLD };
  });

  const slotScores = scored.map(s => ({ hour: s.slot.hour, score: s.score, open: s.open }));

  // Find contiguous open runs
  const openPeriods: OpenPeriod[] = [];
  let runStart: number | null = null;
  let runSlots: HourlySlot[]  = [];

  for (let i = 0; i <= scored.length; i++) {
    const current = scored[i];
    const isOpen  = current?.open ?? false;

    if (isOpen && runStart === null) {
      runStart = current.slot.hour;
      runSlots = [current.slot];
    } else if (isOpen && runStart !== null) {
      runSlots.push(current.slot);
    } else if (!isOpen && runStart !== null) {
      // Run ended — check minimum length
      if (runSlots.length >= MIN_OPEN_HOURS) {
        const lastSlot = runSlots[runSlots.length - 1];
        const endHour = Math.min(lastSlot.hour + 3, 24);
        openPeriods.push({
          from:   fmt12h(runStart),
          to:     endHour === 24 ? "12:00 AM" : fmt12h(endHour),
          reason: buildReason(runSlots, room, balancePt),
        });
      }
      runStart = null;
      runSlots = [];
    }
  }

  const shouldOpen = openPeriods.length > 0;

  // ── Overall reasoning ───────────────────────────────────────────────────────
  let reasoning: string;

  if (shouldOpen) {
    const windowCount = openPeriods.length;
    const allTemps    = day.slots.map(s => s.tempF);
    reasoning = `Open during ${windowCount === 1 ? "one window" : `${windowCount} windows`} today. ` +
      `Outdoor high ${day.highF.toFixed(0)}°F / low ${day.lowF.toFixed(0)}°F — ` +
      `your balance point is ${balancePt}°F. ` +
      (day.maxPrecipProb >= PRECIP_HARD_CUTOFF
        ? `Rain risk is high for part of the day — stick to the recommended windows.`
        : `Rain risk is low all day.`);
  } else {
    // Explain the primary reason windows should stay closed
    const allBlocked  = scored.filter(s => s.breakdown.blocked);
    const tooHot      = scored.filter(s => !s.breakdown.blocked && s.slot.tempF > room.maxTempF);
    const tooHumid    = scored.filter(s => !s.breakdown.blocked && s.slot.humidity > room.maxHumidity + 10);

    if (allBlocked.length >= scored.length * 0.6) {
      const topReason = allBlocked[0]?.breakdown.blocked ?? "unfavourable conditions";
      reasoning = `Keep windows closed today. ${topReason.charAt(0).toUpperCase() + topReason.slice(1)} for most of the day.`;
    } else if (tooHot.length > scored.length * 0.5) {
      reasoning = `Keep windows closed. Outdoor temps (high ${day.highF.toFixed(0)}°F) exceed your comfort ceiling of ${room.maxTempF}°F for most of the day — opening would bring heat in.`;
    } else if (tooHumid.length > scored.length * 0.5) {
      reasoning = `Keep windows closed. Outdoor humidity is above your target range for most of the day and would raise indoor moisture levels.`;
    } else {
      reasoning = `Conditions don't favour opening windows today — no sustained period where temperature, humidity, and rain risk are all within range.`;
    }
  }

  return { shouldOpen, openPeriods, reasoning, slotScores };
}
