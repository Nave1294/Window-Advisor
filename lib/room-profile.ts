/**
 * Room Profile Engine
 * ===================
 * Infers room type from name + heat source and returns time/day-adjusted
 * heat load multipliers and occupancy counts for any given slot.
 *
 * Used by both balance-point (heat load) and airing (CO2 interval) engines.
 */

import type { Room, HeatSourceLevel } from "./schema";
import type { UnoccupiedBlock } from "./schema";
import { isUnoccupied } from "./occupancy";

export type RoomType = "KITCHEN" | "BEDROOM" | "OFFICE" | "LIVING" | "GENERIC";

// ── Room type inference ────────────────────────────────────────────────────────

export function inferRoomType(name: string, heatSource: HeatSourceLevel): RoomType {
  const n = name.toLowerCase();
  if (n.match(/kitchen|cook|culinar/) || heatSource === "KITCHEN_LAUNDRY") return "KITCHEN";
  if (n.match(/bed|sleep|master|guest|nursery/))                            return "BEDROOM";
  if (n.match(/office|study|work|desk|library/) || heatSource === "HOME_OFFICE") return "OFFICE";
  if (n.match(/living|lounge|family|den|sitting|great room|front room/))   return "LIVING";
  return "GENERIC";
}

// ── Heat load multiplier ───────────────────────────────────────────────────────

/**
 * Returns a multiplier (0–3) applied to the base heat source rate.
 * 0 = room is empty, 1 = baseline, >1 = elevated activity.
 */
export function heatLoadMultiplier(
  roomType:  RoomType,
  dayOfWeek: number,   // 0=Sun, 6=Sat
  hour:      number,   // 0-23
  blocks:    UnoccupiedBlock[],
): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Unoccupied → zero load
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;

  switch (roomType) {
    case "KITCHEN":
      if (!isWeekend) {
        if (hour >= 6  && hour < 9)  return 1.5;  // weekday breakfast
        if (hour >= 17 && hour < 20) return 2.0;  // weekday dinner
      } else {
        if (hour >= 7  && hour < 11) return 2.0;  // weekend brunch
        if (hour >= 16 && hour < 21) return 2.5;  // weekend dinner
      }
      return 1.0;

    case "BEDROOM":
      if (hour >= 22 || hour < 6)  return 0.4;  // sleeping, low activity
      if (hour >= 6  && hour < 9)  return 0.7;  // morning routine
      if (!isWeekend && hour >= 9 && hour < 17) return 0.3; // likely away
      return 0.6;

    case "OFFICE":
      if (!isWeekend && hour >= 9 && hour < 17) return 1.3;  // work hours
      if (isWeekend)                             return 0.3;  // occasional use
      return 0.5;

    case "LIVING":
      if (isWeekend && hour >= 10 && hour < 23) return 1.4;  // weekend day
      if (!isWeekend && hour >= 18 && hour < 23) return 1.4; // weekday evening
      return 0.8;

    default:
      return 1.0;
  }
}

// ── People count for CO2 ───────────────────────────────────────────────────────

/**
 * Returns estimated number of people for CO2 calculation.
 * Uses base occupancy level + room-type/time adjustments.
 */
export function peopleCountForSlot(
  room:      Room,
  roomType:  RoomType,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0;
  if (room.occupancyLevel === "EMPTY") return 0;

  const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;
  const basePeople = room.occupancyLevel === "THREE_FOUR" ? 3.5 : 1.5;

  switch (roomType) {
    case "KITCHEN":
      // More people gather for meals
      if (!isWeekend && (hour >= 17 && hour < 20)) return basePeople * 1.5;
      if (isWeekend  && (hour >= 7  && hour < 11)) return basePeople * 1.5;
      if (isWeekend  && (hour >= 16 && hour < 21)) return basePeople * 2.0;
      return basePeople;

    case "LIVING":
      if (isWeekend  && hour >= 10 && hour < 23)  return basePeople * 1.3;
      if (!isWeekend && hour >= 18 && hour < 23)  return basePeople * 1.3;
      return basePeople * 0.7;

    case "BEDROOM":
      if (hour >= 22 || hour < 7) return basePeople; // sleeping, full count
      return basePeople * 0.5;

    case "OFFICE":
      if (!isWeekend && hour >= 9 && hour < 17) return basePeople;
      return basePeople * 0.3;

    default:
      return basePeople;
  }
}

// ── Slot-level heat rate ───────────────────────────────────────────────────────

/** Returns BTU/hr·ft² for a specific slot, incorporating all context. */
export function slotHeatRate(
  room:      Room,
  roomType:  RoomType,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
  baseRate:  number,  // from HEAT_SOURCE_RATE
): number {
  const mult = heatLoadMultiplier(roomType, dayOfWeek, hour, blocks);
  return baseRate * mult;
}
