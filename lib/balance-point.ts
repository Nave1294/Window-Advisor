/**
 * Balance Point Calculator
 * ========================
 * T_balance = T_setpoint − (Q_internal / UA_envelope)
 *
 * T_setpoint  = maxTempF (upper comfort limit)
 * Q_internal  = heat generated inside the room (BTU/hr)
 * UA_envelope = sum of (U-value × Area) for walls + windows + infiltration (BTU/hr·°F)
 */

import type { RoomFull, InsulationLevel, GlazingType, WindowSize, Orientation } from "./schema";

// ─── Coefficient tables ───────────────────────────────────────────────────────

/** Opaque wall U-values (BTU/hr·ft²·°F) */
const WALL_U: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.10,
  AT_CODE:    0.065,
  ABOVE_CODE: 0.040,
};

/** Air changes per hour by insulation level */
const ACH: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.50,
  AT_CODE:    0.35,
  ABOVE_CODE: 0.20,
};

/** Window U-values (BTU/hr·ft²·°F) */
const WINDOW_U: Record<GlazingType, number> = {
  SINGLE: 0.90,
  DOUBLE: 0.30,
  TRIPLE: 0.15,
};

/** Representative window areas (ft²) */
const WINDOW_AREA: Record<WindowSize, number> = {
  SMALL:  4,
  MEDIUM: 10,
  LARGE:  20,
};

/** Internal heat gain base rates (BTU/hr·ft²) */
const OCCUPANCY_RATE: Record<string, number> = {
  EMPTY:      1.5,
  ONE_TWO:    3.5,
  THREE_FOUR: 5.5,
};

const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL:           0.5,
  LIGHT_ELECTRONICS: 1.5,
  HOME_OFFICE:       3.0,
  KITCHEN_LAUNDRY:   5.0,
};

// ─── Wall area helper ─────────────────────────────────────────────────────────
/**
 * Returns the gross area (ft²) of a given wall face given room dimensions.
 *
 * orientation = "NS" means the LENGTH axis runs North-South,
 * so N and S walls have width = widthFt, and E and W walls have width = lengthFt.
 *
 * orientation = "EW" means the LENGTH axis runs East-West,
 * so E and W walls have width = widthFt, and N and S walls have width = lengthFt.
 */
function wallGrossArea(
  face: string,
  lengthFt: number,
  widthFt: number,
  ceilingHeightFt: number,
  orientation: Orientation
): number {
  const isLengthFace =
    orientation === "NS"
      ? face === "E" || face === "W"
      : face === "N" || face === "S";

  const wallWidth = isLengthFace ? lengthFt : widthFt;
  return wallWidth * ceilingHeightFt;
}

// ─── Main calculation ─────────────────────────────────────────────────────────

export interface BalancePointResult {
  balancePoint:   number; // °F — rounded to 1 decimal
  // Breakdown for transparency / display
  qInternal:      number; // BTU/hr
  uaWalls:        number; // BTU/hr·°F
  uaWindows:      number; // BTU/hr·°F
  uaInfiltration: number; // BTU/hr·°F
  uaTotal:        number; // BTU/hr·°F
  floorArea:      number; // ft²
  volume:         number; // ft³
}

export function calculateBalancePoint(room: RoomFull): BalancePointResult {
  const {
    lengthFt, widthFt, ceilingHeightFt,
    orientation, insulationLevel, glazingType,
    occupancyLevel, heatSourceLevel,
    floorNumber, isTopFloor,
    maxTempF,
    windows: roomWindows,
    exteriorWalls,
  } = room;

  const floorArea = lengthFt * widthFt;
  const volume    = floorArea * ceilingHeightFt;

  // ── Q_internal ──────────────────────────────────────────────────────────────
  const baseRate     = OCCUPANCY_RATE[occupancyLevel]  ?? 3.5;
  const heatRate     = HEAT_SOURCE_RATE[heatSourceLevel] ?? 1.5;
  // Each floor above ground adds 1.5 BTU/hr·ft²; top floor under a roof adds another 1.5
  const floorPenalty = (floorNumber - 1) * 1.5 + (isTopFloor ? 1.5 : 0);
  const totalRate    = baseRate + heatRate + floorPenalty;
  const qInternal    = totalRate * floorArea;

  // ── UA_windows ──────────────────────────────────────────────────────────────
  // Build a map of total window area per cardinal direction so we can subtract
  // it from the gross wall area for that face.
  const windowAreaByFace: Partial<Record<string, number>> = {};

  let uaWindows = 0;
  for (const win of roomWindows) {
    const area = WINDOW_AREA[win.size as WindowSize];
    const uVal = WINDOW_U[(win.glazingOverride ?? glazingType) as GlazingType];
    uaWindows += area * uVal;

    windowAreaByFace[win.direction] = (windowAreaByFace[win.direction] ?? 0) + area;
  }

  // ── UA_walls ────────────────────────────────────────────────────────────────
  const wallU = WALL_U[insulationLevel as InsulationLevel];
  let uaWalls = 0;

  for (const wall of exteriorWalls) {
    const gross   = wallGrossArea(wall.direction, lengthFt, widthFt, ceilingHeightFt, orientation as Orientation);
    const winArea = windowAreaByFace[wall.direction] ?? 0;
    // Net opaque area cannot go below zero (guard against over-specified windows)
    const net     = Math.max(0, gross - winArea);
    uaWalls      += net * wallU;
  }

  // ── UA_infiltration ─────────────────────────────────────────────────────────
  // UA_inf = ACH × Volume × 0.018  (0.018 = volumetric heat capacity of air, BTU/ft³·°F)
  const ach           = ACH[insulationLevel as InsulationLevel];
  const uaInfiltration = ach * volume * 0.018;

  // ── Balance point ───────────────────────────────────────────────────────────
  const uaTotal      = uaWalls + uaWindows + uaInfiltration;
  const balancePoint = maxTempF - qInternal / uaTotal;

  return {
    balancePoint:   Math.round(balancePoint * 10) / 10,
    qInternal:      Math.round(qInternal),
    uaWalls:        Math.round(uaWalls * 100) / 100,
    uaWindows:      Math.round(uaWindows * 100) / 100,
    uaInfiltration: Math.round(uaInfiltration * 100) / 100,
    uaTotal:        Math.round(uaTotal * 100) / 100,
    floorArea,
    volume,
  };
}
