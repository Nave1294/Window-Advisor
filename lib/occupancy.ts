/**
 * Occupancy & Context-Aware Heat Load
 * =====================================
 * Room is occupied by default. UnoccupiedBlocks specify exceptions.
 *
 * Heat load and CO₂ generation now vary by:
 *   1. Occupancy (zero when unoccupied)
 *   2. Room type (inferred from name + heat source level)
 *   3. Time of day
 *   4. Day of week
 */

import type { Room, UnoccupiedBlock, OccupancyLevel } from "./schema";

// ── Base rates ────────────────────────────────────────────────────────────────

export const OCCUPANCY_RATE: Record<OccupancyLevel, number> = {
  EMPTY:      0,
  ONE_TWO:    3.5,
  THREE_FOUR: 5.5,
};

export const PEOPLE_COUNT: Record<OccupancyLevel, number> = {
  EMPTY:      0,
  ONE_TWO:    1.5,
  THREE_FOUR: 3.5,
};

export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL:           0.5,
  LIGHT_ELECTRONICS: 1.5,
  HOME_OFFICE:       3.0,
  KITCHEN_LAUNDRY:   5.0,
};

// ── Room type inference ───────────────────────────────────────────────────────

export type RoomType = "kitchen" | "bedroom" | "office" | "living" | "generic";

export function inferRoomType(name: string, heatSourceLevel: string): RoomType {
  const n = name.toLowerCase();
  if (n.includes("kitchen") || n.includes("cook") || heatSourceLevel === "KITCHEN_LAUNDRY") return "kitchen";
  if (n.includes("bedroom") || n.includes("bed") || n.includes("master") || n.includes("sleep")) return "bedroom";
  if (n.includes("office") || n.includes("study") || n.includes("work") || heatSourceLevel === "HOME_OFFICE") return "office";
  if (n.includes("living") || n.includes("lounge") || n.includes("family") || n.includes("sitting")) return "living";
  return "generic";
}

// ── Time-of-day × day-of-week multipliers ────────────────────────────────────
// Returns a multiplier for the DEVICE heat load (not people).
// People heat load is handled separately via OCCUPANCY_RATE.

export function heatLoadMultiplier(
  roomType:  RoomType,
  hour:      number,   // 0–23
  dayOfWeek: number,   // 0=Sun … 6=Sat
): number {
  const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;
  const isWeekday  = !isWeekend;

  switch (roomType) {
    case "kitchen": {
      // Breakfast
      if (hour >= 6 && hour < 9)  return isWeekend ? 2.5 : 1.8;  // weekend = bigger cook
      // Lunch
      if (hour >= 11 && hour < 14) return isWeekend ? 1.8 : 1.2;
      // Dinner
      if (hour >= 17 && hour < 21) return isWeekend ? 3.0 : 2.2;  // weekend = larger meal
      return 0.6; // off-peak
    }

    case "bedroom": {
      // Sleeping hours — minimal activity
      if (hour >= 22 || hour < 7) return 0.3;
      // Morning routine
      if (hour >= 7 && hour < 9)  return 0.8;
      // Weekend lie-in
      if (isWeekend && hour >= 7 && hour < 11) return 0.6;
      return 0.5; // daytime (usually unoccupied)
    }

    case "office": {
      // Work hours weekdays
      if (isWeekday && hour >= 9 && hour < 18) return 1.4;  // screens running hard
      if (isWeekday && hour >= 7 && hour < 9)  return 0.8;  // warming up
      if (isWeekday && hour >= 18 && hour < 20) return 0.6; // winding down
      if (isWeekend) return 0.2; // minimal — occasional use
      return 0.3;
    }

    case "living": {
      // Weekday evenings — people gather
      if (isWeekday && hour >= 18 && hour < 23) return 1.5;
      if (isWeekday && hour >= 7 && hour < 9)   return 0.8;
      // Weekends — elevated most of the day
      if (isWeekend && hour >= 9 && hour < 23)  return 1.6;
      return 0.5;
    }

    default:
      return 1.0; // generic — no time-of-day adjustment
  }
}

// ── CO₂ people count multiplier ───────────────────────────────────────────────
// Kitchen gatherings and living room evenings draw more people.

export function co2PeopleMultiplier(
  roomType:  RoomType,
  hour:      number,
  dayOfWeek: number,
): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  switch (roomType) {
    case "kitchen": {
      if (hour >= 17 && hour < 21) return isWeekend ? 1.6 : 1.3; // dinner guests/family
      if (hour >= 6  && hour < 9)  return isWeekend ? 1.3 : 1.0;
      return 1.0;
    }
    case "living": {
      if (hour >= 18 && hour < 23) return isWeekend ? 1.5 : 1.3;
      if (isWeekend && hour >= 10 && hour < 18) return 1.2;
      return 1.0;
    }
    default: return 1.0;
  }
}

// ── Core helpers ──────────────────────────────────────────────────────────────

export function parseBlocks(room: Room): UnoccupiedBlock[] {
  try { return JSON.parse(room.unoccupiedBlocks || "[]"); } catch { return []; }
}

export function isUnoccupied(
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): boolean {
  return blocks.some(b => b.days.includes(dayOfWeek) && hour >= b.startHour && hour < b.endHour);
}

/**
 * Context-aware device heat load (BTU/hr·ft²) for a specific slot.
 * Returns 0 when unoccupied.
 */
export function deviceHeatRateForSlot(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;
  const baseRate   = HEAT_SOURCE_RATE[room.heatSourceLevel] ?? 1.5;
  const roomType   = inferRoomType(room.name, room.heatSourceLevel);
  const multiplier = heatLoadMultiplier(roomType, hour, dayOfWeek);
  return baseRate * multiplier;
}

/**
 * Context-aware people heat load (BTU/hr·ft²) for a specific slot.
 */
export function occupancyRateForSlot(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;
  return OCCUPANCY_RATE[room.occupancyLevel as OccupancyLevel] ?? OCCUPANCY_RATE["ONE_TWO"];
}

/**
 * Total heat rate (people + device) for a slot — used by balance point engine.
 */
export function totalHeatRateForSlot(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): number {
  return occupancyRateForSlot(room, blocks, dayOfWeek, hour)
       + deviceHeatRateForSlot(room, blocks, dayOfWeek, hour);
}

/**
 * Context-aware CO₂ people count for a slot — used by airing engine.
 */
export function co2PeopleForSlot(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;
  const base       = PEOPLE_COUNT[room.occupancyLevel as OccupancyLevel] ?? 1.5;
  const roomType   = inferRoomType(room.name, room.heatSourceLevel);
  const multiplier = co2PeopleMultiplier(roomType, hour, dayOfWeek);
  return base * multiplier;
}

/**
 * Weighted average total heat rate across the full week.
 * Used by balance point for the stored scalar value.
 */
export function averageWeeklyHeatRate(
  room:   Room,
  blocks: UnoccupiedBlock[],
): number {
  let total = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      total += totalHeatRateForSlot(room, blocks, day, hour);
    }
  }
  return total / 168;
}

// Keep legacy export name for balance-point.ts compatibility
export const averageWeeklyOccupancyRate = averageWeeklyHeatRate;
