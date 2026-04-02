/**
 * Balance Point Engine
 * ====================
 * T_balance = T_setpoint − Q_internal / UA_total
 *
 * All heat load calculations use occupancy.ts as the single source of truth.
 * People heat is treated as absolute BTU/hr (ASHRAE 250/person) divided by
 * floor area — so room size correctly reduces the per-ft² rate.
 *
 * Physics references:
 *   Wall U: ASHRAE 90.1-2019 Table A2.3 (CZ 4A)
 *   Ceiling U: ASHRAE 90.1-2019 Table A5 — R-38 code (U=0.026), below-code R-19 (U=0.052)
 *   Window U/SHGC: NFRC typical values
 *   ACH: Building Science Corporation, natural infiltration estimates
 */

import type { RoomFull, InsulationLevel, GlazingType, WindowSize, Orientation } from "./schema";
import {
  parseBlocks, inferRoomType,
  equipmentHeatRate, peopleHeatBtu,
  averageWeeklyHeatRate,
} from "./occupancy";
import {
  windowSolarGain, wallSolarGain, roofSolarGain, ceilingUA,
  type WindowInput, type WallInput,
} from "./solar";

// ── U-values and constants ────────────────────────────────────────────────────

export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL: 0.5, LIGHT_ELECTRONICS: 1.5, HOME_OFFICE: 3.0, KITCHEN_LAUNDRY: 5.0,
};

/** Wall U-values (BTU/hr·ft²·°F) — ASHRAE 90.1-2019 CZ4A */
const WALL_U: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.10,   // 2×4 stud, R-11 batt ≈ R-13 eff → U~0.10
  AT_CODE:    0.065,  // 2×6 stud, R-21 batt ≈ R-15 eff → U~0.065
  ABOVE_CODE: 0.040,  // dense-pack + continuous → R-25+ → U~0.040
};

/** Natural infiltration ACH — Building Science Corp residential estimates */
const ACH: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.60,   // pre-1980 / minimal sealing
  AT_CODE:    0.35,   // standard code construction
  ABOVE_CODE: 0.20,   // tight / blower-door tested
};

/**
 * Window U-values (BTU/hr·ft²·°F) — NFRC typical
 * SHGC corrected: modern double low-e ≈ 0.27, not 0.40
 */
const WINDOW_U: Record<GlazingType, number> = {
  SINGLE: 0.90,   // single clear
  DOUBLE: 0.30,   // double low-e (standard modern)
  TRIPLE: 0.15,   // triple low-e
};

const WINDOW_AREA: Record<WindowSize, number> = {
  SMALL: 4, MEDIUM: 10, LARGE: 20,
};

export interface BalancePointResult {
  balancePoint: number; qInternal: number;
  uaWalls: number; uaWindows: number; uaInfiltration: number;
  uaCeiling: number; uaTotal: number; floorArea: number; volume: number;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function wallGrossArea(face: string, len: number, wid: number, ceil: number, orient: Orientation): number {
  const isLengthFace = orient === "NS" ? (face==="E"||face==="W") : (face==="N"||face==="S");
  return (isLengthFace ? len : wid) * ceil;
}

function buildWindowInputs(room: RoomFull): WindowInput[] {
  return (room.windows ?? []).map(w => ({
    direction:   w.direction as import("./schema").Direction,
    areaSqFt:    WINDOW_AREA[w.size as WindowSize],
    glazingType: (w.glazingOverride ?? room.glazingType) as GlazingType,
  }));
}

function buildWallInputs(room: RoomFull): WallInput[] {
  const winAreaByFace: Partial<Record<string, number>> = {};
  for (const w of (room.windows ?? [])) {
    winAreaByFace[w.direction] = (winAreaByFace[w.direction] ?? 0) + WINDOW_AREA[w.size as WindowSize];
  }
  return (room.exteriorWalls ?? []).map(wall => {
    const gross = wallGrossArea(wall.direction, room.lengthFt, room.widthFt, room.ceilingHeightFt, room.orientation as Orientation);
    return {
      direction:       wall.direction as import("./schema").Direction,
      areaSqFt:        Math.max(0, gross - (winAreaByFace[wall.direction] ?? 0)),
      color:           (room.wallColor ?? "MEDIUM") as import("./schema").SurfaceColor,
      insulationLevel: room.insulationLevel as import("./schema").InsulationLevel,
    };
  });
}

function computeUA(room: RoomFull): {
  uaWalls: number; uaWindows: number; uaInfiltration: number;
  uaCeiling: number; uaTotal: number;
} {
  const { insulationLevel, isTopFloor } = room;
  const floorArea = room.lengthFt * room.widthFt;
  const volume    = floorArea * room.ceilingHeightFt;

  const windowInputs = buildWindowInputs(room);
  const uaWindows    = windowInputs.reduce((s, w) => s + w.areaSqFt * WINDOW_U[w.glazingType], 0);

  const wallInputs = buildWallInputs(room);
  const wallU      = WALL_U[insulationLevel as InsulationLevel];
  const uaWalls    = wallInputs.reduce((s, w) => s + w.areaSqFt * wallU, 0);

  const uaInfiltration = ACH[insulationLevel as InsulationLevel] * volume * 0.018;
  const uaCeiling      = ceilingUA(floorArea, insulationLevel, isTopFloor);

  return { uaWalls, uaWindows, uaInfiltration, uaCeiling, uaTotal: uaWalls + uaWindows + uaInfiltration + uaCeiling };
}

// ── Weekly-average balance point (stored scalar) ──────────────────────────────

export function calculateBalancePoint(room: RoomFull): BalancePointResult {
  const floorArea = room.lengthFt * room.widthFt;
  const volume    = floorArea * room.ceilingHeightFt;
  const blocks    = parseBlocks(room);

  // Fixed Issue #1: people heat as absolute BTU/hr ÷ floor area (not flat rate × area)
  const avgHeatRate = averageWeeklyHeatRate(room, blocks, floorArea);
  const qInternal   = avgHeatRate * floorArea;  // total BTU/hr

  const { uaWalls, uaWindows, uaInfiltration, uaCeiling, uaTotal } = computeUA(room);
  if (uaTotal === 0) return { balancePoint: room.maxTempF, qInternal:0, uaWalls:0, uaWindows:0, uaInfiltration:0, uaCeiling:0, uaTotal:0, floorArea, volume };

  const balancePoint = room.maxTempF - qInternal / uaTotal;

  return {
    balancePoint:   Math.round(balancePoint * 10) / 10,
    qInternal:      Math.round(qInternal),
    uaWalls:        Math.round(uaWalls * 100) / 100,
    uaWindows:      Math.round(uaWindows * 100) / 100,
    uaInfiltration: Math.round(uaInfiltration * 100) / 100,
    uaCeiling:      Math.round(uaCeiling * 100) / 100,
    uaTotal:        Math.round(uaTotal * 100) / 100,
    floorArea, volume,
  };
}

// ── Per-slot balance point (used by recommendation engine) ────────────────────

export function balancePointForSlot(
  room:       RoomFull,
  dayOfWeek:  number,
  hour:       number,
  bias:       number = 0,
  precipProb: number = 0,
): number {
  const floorArea = room.lengthFt * room.widthFt;
  const blocks    = parseBlocks(room);
  const roomType  = inferRoomType(room.name, room.heatSourceLevel);

  // Fixed Issue #1: people heat as BTU/hr total, divided by area
  const equip  = equipmentHeatRate(room, blocks, roomType, dayOfWeek, hour);
  const people = peopleHeatBtu(room, blocks, roomType, dayOfWeek, hour) / floorArea;

  // Solar gains
  const windowInputs = buildWindowInputs(room);
  const wallInputs   = buildWallInputs(room);
  const solarW  = windowSolarGain(windowInputs, hour, precipProb);
  const solarWl = wallSolarGain(wallInputs, hour, precipProb);
  const solarR  = roofSolarGain(
    floorArea,
    (room.roofColor  ?? "MEDIUM") as import("./schema").SurfaceColor,
    (room.roofType   ?? "ATTIC_BUFFERED") as import("./schema").RoofType,
    room.insulationLevel as import("./schema").InsulationLevel,
    hour, precipProb,
  );

  // Total heat: equipment + people both per ft², plus solar totals divided by area
  const qInternal = (equip + people) * floorArea + solarW + solarWl + solarR;

  const { uaTotal } = computeUA(room);
  if (uaTotal === 0) return room.maxTempF - bias;

  return Math.round((room.maxTempF - qInternal / uaTotal - bias) * 10) / 10;
}
