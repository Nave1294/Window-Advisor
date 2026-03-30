/**
 * Shared occupancy helpers used by balance-point, airing, and recommendation engines.
 *
 * The model: room is occupied by default.
 * UnoccupiedBlocks specify when it is NOT occupied.
 */

import type { Room, UnoccupiedBlock, OccupancyLevel } from "./schema";

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

export function parseBlocks(room: Room): UnoccupiedBlock[] {
  try { return JSON.parse(room.unoccupiedBlocks || "[]"); } catch { return []; }
}

/** Returns true if the given hour on the given day-of-week falls inside any unoccupied block */
export function isUnoccupied(
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,   // 0=Sun … 6=Sat
  hour:      number,   // 0–23
): boolean {
  return blocks.some(
    b => b.days.includes(dayOfWeek) && hour >= b.startHour && hour < b.endHour
  );
}

/** Returns the occupancy rate (BTU/hr·ft²) for a given slot */
export function occupancyRateForSlot(
  room:      Room,
  blocks:    UnoccupiedBlock[],
  dayOfWeek: number,
  hour:      number,
): number {
  if (isUnoccupied(blocks, dayOfWeek, hour)) return 0; // unoccupied → no people heat
  return OCCUPANCY_RATE[room.occupancyLevel as OccupancyLevel] ?? OCCUPANCY_RATE["ONE_TWO"];
}

/**
 * Compute weighted average occupancy rate across a full week.
 * Used by the balance point calculator for a representative steady-state Q.
 */
export function averageWeeklyOccupancyRate(
  room:   Room,
  blocks: UnoccupiedBlock[],
): number {
  const baseRate = OCCUPANCY_RATE[room.occupancyLevel as OccupancyLevel] ?? OCCUPANCY_RATE["ONE_TWO"];
  let totalSlots = 0, weightedRate = 0;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const rate = isUnoccupied(blocks, day, hour) ? 0 : baseRate;
      weightedRate += rate;
      totalSlots++;
    }
  }

  return totalSlots > 0 ? weightedRate / totalSlots : baseRate;
}

export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL: 0.5, LIGHT_ELECTRONICS: 1.5, HOME_OFFICE: 3.0, KITCHEN_LAUNDRY: 5.0,
};
