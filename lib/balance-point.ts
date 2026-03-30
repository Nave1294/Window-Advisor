/**
 * Balance Point Calculator
 * T_balance = T_setpoint − (Q_internal / UA_envelope)
 *
 * Q_internal now uses a weighted average across the occupancy schedule
 * rather than a flat rate, so unoccupied hours reduce the heat load.
 */

import type { RoomFull, InsulationLevel, GlazingType, WindowSize, Orientation, OccupancySchedule, OccupancyLevel } from "./schema";

const WALL_U: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.10, AT_CODE: 0.065, ABOVE_CODE: 0.040,
};
const ACH: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.50, AT_CODE: 0.35, ABOVE_CODE: 0.20,
};
const WINDOW_U: Record<GlazingType, number> = {
  SINGLE: 0.90, DOUBLE: 0.30, TRIPLE: 0.15,
};
const WINDOW_AREA: Record<WindowSize, number> = {
  SMALL: 4, MEDIUM: 10, LARGE: 20,
};
export const OCCUPANCY_RATE: Record<OccupancyLevel, number> = {
  EMPTY: 1.5, ONE_TWO: 3.5, THREE_FOUR: 5.5,
};
export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL: 0.5, LIGHT_ELECTRONICS: 1.5, HOME_OFFICE: 3.0, KITCHEN_LAUNDRY: 5.0,
};

function wallGrossArea(face: string, lengthFt: number, widthFt: number, ceilingHeightFt: number, orientation: Orientation): number {
  const isLengthFace = orientation === "NS" ? (face === "E" || face === "W") : (face === "N" || face === "S");
  return (isLengthFace ? lengthFt : widthFt) * ceilingHeightFt;
}

/**
 * Compute the average Q_internal rate (BTU/hr·ft²) across a week
 * based on the occupancy schedule. Hours not covered by the schedule
 * default to EMPTY (1.5 BTU/hr·ft²).
 */
export function averageOccupancyRate(schedule: OccupancySchedule): number {
  let totalHours = 0;
  let weightedRate = 0;

  for (let day = 0; day < 7; day++) {
    const period = schedule[day];
    if (!period || !period.occupied) {
      // Unoccupied all day
      weightedRate += OCCUPANCY_RATE["EMPTY"] * 24;
      totalHours += 24;
    } else {
      const occupiedHours = Math.max(0, period.endHour - period.startHour);
      const unoccupiedHours = 24 - occupiedHours;
      weightedRate += OCCUPANCY_RATE[period.level] * occupiedHours;
      weightedRate += OCCUPANCY_RATE["EMPTY"] * unoccupiedHours;
      totalHours += 24;
    }
  }

  return totalHours > 0 ? weightedRate / totalHours : OCCUPANCY_RATE["ONE_TWO"];
}

/**
 * Returns the occupancy rate for a specific hour on a specific day of week.
 * Used by the recommendation engine for per-slot scoring.
 */
export function occupancyRateForSlot(schedule: OccupancySchedule, dayOfWeek: number, hour: number): number {
  const period = schedule[dayOfWeek];
  if (!period || !period.occupied) return OCCUPANCY_RATE["EMPTY"];
  if (hour >= period.startHour && hour < period.endHour) return OCCUPANCY_RATE[period.level];
  return OCCUPANCY_RATE["EMPTY"];
}

export interface BalancePointResult {
  balancePoint:   number;
  qInternal:      number;
  uaWalls:        number;
  uaWindows:      number;
  uaInfiltration: number;
  uaTotal:        number;
  floorArea:      number;
  volume:         number;
}

export function calculateBalancePoint(room: RoomFull): BalancePointResult {
  const { lengthFt, widthFt, ceilingHeightFt, orientation, insulationLevel, glazingType,
          heatSourceLevel, floorNumber, isTopFloor, maxTempF, windows: roomWindows, exteriorWalls } = room;

  const floorArea = lengthFt * widthFt;
  const volume    = floorArea * ceilingHeightFt;

  // Parse schedule and compute average occupancy rate
  let schedule: OccupancySchedule = {};
  try { schedule = JSON.parse(room.occupancySchedule || "{}"); } catch { /* use empty */ }

  const avgOccRate   = averageOccupancyRate(schedule);
  const heatRate     = HEAT_SOURCE_RATE[heatSourceLevel] ?? 1.5;
  const floorPenalty = (floorNumber - 1) * 1.5 + (isTopFloor ? 1.5 : 0);
  const totalRate    = avgOccRate + heatRate + floorPenalty;
  const qInternal    = totalRate * floorArea;

  const windowAreaByFace: Partial<Record<string, number>> = {};
  let uaWindows = 0;
  for (const win of roomWindows) {
    const area = WINDOW_AREA[win.size as WindowSize];
    const uVal = WINDOW_U[(win.glazingOverride ?? glazingType) as GlazingType];
    uaWindows += area * uVal;
    windowAreaByFace[win.direction] = (windowAreaByFace[win.direction] ?? 0) + area;
  }

  const wallU = WALL_U[insulationLevel as InsulationLevel];
  let uaWalls = 0;
  for (const wall of exteriorWalls) {
    const gross = wallGrossArea(wall.direction, lengthFt, widthFt, ceilingHeightFt, orientation as Orientation);
    const net   = Math.max(0, gross - (windowAreaByFace[wall.direction] ?? 0));
    uaWalls    += net * wallU;
  }

  const ach            = ACH[insulationLevel as InsulationLevel];
  const uaInfiltration = ach * volume * 0.018;
  const uaTotal        = uaWalls + uaWindows + uaInfiltration;
  const balancePoint   = maxTempF - qInternal / uaTotal;

  return {
    balancePoint:   Math.round(balancePoint * 10) / 10,
    qInternal:      Math.round(qInternal),
    uaWalls:        Math.round(uaWalls * 100) / 100,
    uaWindows:      Math.round(uaWindows * 100) / 100,
    uaInfiltration: Math.round(uaInfiltration * 100) / 100,
    uaTotal:        Math.round(uaTotal * 100) / 100,
    floorArea, volume,
  };
}
