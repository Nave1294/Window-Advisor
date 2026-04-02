/**
 * Occupancy & Heat Load Engine (canonical — single source of truth)
 * =================================================================
 * All heat load and CO₂ calculations flow through here.
 *
 * Physics basis:
 * - Equipment heat: BTU/hr·ft² × room area (from HEAT_SOURCE_RATE)
 * - People heat: ASHRAE 55 — 250 BTU/hr sensible per sedentary occupant
 *   applied as total BTU/hr then divided by area inside balance-point.ts
 *   so that a larger room with the same headcount has a LOWER per-ft² rate
 * - Multipliers: time-of-day × day-of-week per room type
 * - All values zero when room is unoccupied
 */

import type { Room, UnoccupiedBlock, OccupancyLevel, HeatSourceLevel } from "./schema";

// ── Base rates ────────────────────────────────────────────────────────────────

/** BTU/hr·ft² from installed equipment, at peak usage */
export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL:           0.5,   // phone charger, a lamp
  LIGHT_ELECTRONICS: 1.5,   // TV, laptop, streaming
  HOME_OFFICE:       3.0,   // desktop + monitors
  KITCHEN_LAUNDRY:   5.0,   // cooking appliances
};

/** Average number of people when the room IS occupied */
export const PEOPLE_COUNT: Record<OccupancyLevel, number> = {
  EMPTY:      0,
  ONE_TWO:    1.5,
  THREE_FOUR: 3.5,
};

/** ASHRAE 55 — sedentary sensible heat per occupant (BTU/hr) */
export const BTU_PER_PERSON = 250;

// ── Room type inference ───────────────────────────────────────────────────────

export type RoomType = "KITCHEN" | "BEDROOM" | "OFFICE" | "LIVING" | "GENERIC";

export function inferRoomType(name: string, heatSource: HeatSourceLevel | string): RoomType {
  const n = name.toLowerCase();
  if (n.match(/kitchen|cook|culinar/) || heatSource === "KITCHEN_LAUNDRY") return "KITCHEN";
  if (n.match(/bed|sleep|master|guest|nursery/))                            return "BEDROOM";
  if (n.match(/office|study|work|desk|library/) || heatSource === "HOME_OFFICE") return "OFFICE";
  if (n.match(/living|lounge|family|den|sitting|great room|front room/))   return "LIVING";
  return "GENERIC";
}

// ── Time-of-day × day-of-week equipment multipliers ──────────────────────────

/**
 * Multiplier applied to the base equipment heat rate.
 * 0 = unoccupied, 1.0 = baseline, >1 = elevated usage.
 * Does NOT include people heat — that is handled separately.
 */
export function equipmentMultiplier(
  roomType:  RoomType,
  dayOfWeek: number,   // 0=Sun, 6=Sat
  hour:      number,   // 0-23
): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isWeekday = !isWeekend;

  switch (roomType) {
    case "KITCHEN":
      if (hour >= 6  && hour < 9)  return isWeekend ? 2.5 : 1.8;  // breakfast
      if (hour >= 11 && hour < 14) return isWeekend ? 1.8 : 1.2;  // lunch
      if (hour >= 17 && hour < 21) return isWeekend ? 3.0 : 2.2;  // dinner
      return 0.6;

    case "BEDROOM":
      if (hour >= 22 || hour < 6)              return 0.3;  // sleeping
      if (hour >= 6  && hour < 9)              return 0.8;  // morning routine
      if (isWeekend && hour >= 9 && hour < 11) return 0.6;  // weekend lie-in
      return 0.4;  // daytime (mostly unoccupied)

    case "OFFICE":
      if (isWeekday && hour >= 9  && hour < 18) return 1.4;  // screens running
      if (isWeekday && hour >= 7  && hour < 9)  return 0.8;  // warming up
      if (isWeekday && hour >= 18 && hour < 20) return 0.6;  // winding down
      if (isWeekend)                             return 0.2;
      return 0.3;

    case "LIVING":
      if (isWeekday && hour >= 18 && hour < 23) return 1.5;  // weekday evening
      if (isWeekday && hour >= 7  && hour < 9)  return 0.8;
      if (isWeekend && hour >= 9  && hour < 23) return 1.6;  // weekend day
      return 0.5;

    default:
      return 1.0;
  }
}

// ── People count multipliers for CO₂ ─────────────────────────────────────────

/**
 * Multiplier on base headcount — kitchen/living draw more people at meal/gather times.
 */
export function peopleMultiplier(
  roomType:  RoomType,
  dayOfWeek: number,
  hour:      number,
): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  switch (roomType) {
    case "KITCHEN":
      if (hour >= 17 && hour < 21) return isWeekend ? 1.6 : 1.3;
      if (hour >= 6  && hour < 9)  return isWeekend ? 1.3 : 1.0;
      return 1.0;
    case "LIVING":
      if (hour >= 18 && hour < 23)                    return isWeekend ? 1.5 : 1.3;
      if (isWeekend && hour >= 10 && hour < 18)       return 1.2;
      return 1.0;
    case "BEDROOM":
      // Full count sleeping, partial when just passing through
      if (hour >= 22 || hour < 7) return 1.0;
      return 0.5;
    case "OFFICE":
      if (!isWeekend && hour >= 9 && hour < 17) return 1.0;
      return 0.3;
    default:
      return 1.0;
  }
}

// ── Core occupancy helpers ────────────────────────────────────────────────────

export function parseBlocks(room: Room): UnoccupiedBlock[] {
  try { return JSON.parse(room.unoccupiedBlocks || "[]"); } catch { return []; }
}

export function isUnoccupied(blocks: UnoccupiedBlock[], dayOfWeek: number, hour: number): boolean {
  return blocks.some(b => b.days.includes(dayOfWeek) && hour >= b.startHour && hour < b.endHour);
}

// ── Per-slot heat calculations ────────────────────────────────────────────────

/**
 * Equipment heat rate (BTU/hr·ft²) for a specific slot.
 * Returns 0 when unoccupied.
 */
export function equipmentHeatRate(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  roomType:  RoomType,
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;
  const baseRate = HEAT_SOURCE_RATE[room.heatSourceLevel] ?? 1.5;
  return baseRate * equipmentMultiplier(roomType, dayOfWeek, hour);
}

/**
 * People count for a specific slot (for CO₂ calculation).
 * Returns 0 when unoccupied.
 */
export function peopleCountForSlot(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  roomType:  RoomType,
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;
  if (room.occupancyLevel === "EMPTY") return 0;
  const base = PEOPLE_COUNT[room.occupancyLevel as OccupancyLevel] ?? 1.5;
  return base * peopleMultiplier(roomType, dayOfWeek, hour);
}

/**
 * People heat contribution (BTU/hr) — absolute, not per ft².
 * Caller divides by floor area to get BTU/hr·ft² if needed.
 */
export function peopleHeatBtu(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  roomType:  RoomType,
  dayOfWeek: number,
  hour:      number,
): number {
  return peopleCountForSlot(room, blocks, roomType, dayOfWeek, hour) * BTU_PER_PERSON;
}

/**
 * Weekly average heat rate (BTU/hr·ft²) including people and equipment.
 * People heat is correctly divided by floor area so room size doesn't inflate it.
 */
export function averageWeeklyHeatRate(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  floorArea: number,
): number {
  const roomType = inferRoomType(room.name, room.heatSourceLevel);
  let total = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const equip  = equipmentHeatRate(room, blocks, roomType, day, hour);
      const people = peopleHeatBtu(room, blocks, roomType, day, hour) / floorArea;
      total += equip + people;
    }
  }
  return total / 168;
}
