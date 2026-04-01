import { inferRoomType, slotHeatRate, peopleCountForSlot } from "./room-profile";
import type { RoomFull, InsulationLevel, GlazingType, WindowSize, Orientation } from "./schema";
import { parseBlocks } from "./occupancy";
import {
  windowSolarGain, wallSolarGain, roofSolarGain, ceilingUA,
  type WindowInput, type WallInput,
} from "./solar";

export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL: 0.5, LIGHT_ELECTRONICS: 1.5, HOME_OFFICE: 3.0, KITCHEN_LAUNDRY: 5.0,
};

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

export interface BalancePointResult {
  balancePoint: number; qInternal: number;
  uaWalls: number; uaWindows: number; uaInfiltration: number;
  uaCeiling: number; uaTotal: number; floorArea: number; volume: number;
}

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
  const windowAreaByFace: Partial<Record<string, number>> = {};
  for (const w of (room.windows ?? [])) {
    windowAreaByFace[w.direction] = (windowAreaByFace[w.direction] ?? 0) + WINDOW_AREA[w.size as WindowSize];
  }
  return (room.exteriorWalls ?? []).map(wall => {
    const gross = wallGrossArea(wall.direction, room.lengthFt, room.widthFt, room.ceilingHeightFt, room.orientation as Orientation);
    const net   = Math.max(0, gross - (windowAreaByFace[wall.direction] ?? 0));
    return {
      direction: wall.direction as import("./schema").Direction,
      areaSqFt:  net,
      color:     (room.wallColor ?? "MEDIUM") as import("./schema").SurfaceColor,
    };
  });
}

// ── Slot-level UA (doesn't change hour-to-hour) ──────────────────────────────

function computeUA(room: RoomFull): { uaWalls:number; uaWindows:number; uaInfiltration:number; uaCeiling:number; uaTotal:number } {
  const { lengthFt, widthFt, ceilingHeightFt, insulationLevel, isTopFloor } = room;
  const floorArea = lengthFt * widthFt;
  const volume    = floorArea * ceilingHeightFt;

  const windowInputs = buildWindowInputs(room);
  const uaWindows    = windowInputs.reduce((s, w) => s + w.areaSqFt * WINDOW_U[w.glazingType], 0);

  const wallInputs = buildWallInputs(room);
  const wallU      = WALL_U[insulationLevel as InsulationLevel];
  const uaWalls    = wallInputs.reduce((s, w) => s + w.areaSqFt * wallU, 0);

  const uaInfiltration = ACH[insulationLevel as InsulationLevel] * volume * 0.018;
  const uaCeiling      = ceilingUA(floorArea, insulationLevel, isTopFloor);

  return { uaWalls, uaWindows, uaInfiltration, uaCeiling, uaTotal: uaWalls + uaWindows + uaInfiltration + uaCeiling };
}

// ── Weekly-average balance point ─────────────────────────────────────────────

export function calculateBalancePoint(room: RoomFull): BalancePointResult {
  const floorArea = room.lengthFt * room.widthFt;
  const volume    = floorArea * room.ceilingHeightFt;
  const blocks    = parseBlocks(room);
  const baseRate  = HEAT_SOURCE_RATE[room.heatSourceLevel] ?? 1.5;
  const roomType  = inferRoomType(room.name, room.heatSourceLevel as import("./schema").HeatSourceLevel);

  const BASE_PEOPLE_RATE: Record<string, number> = { EMPTY:0, ONE_TWO:3.5, THREE_FOUR:5.5 };
  const basePeopleRate = BASE_PEOPLE_RATE[room.occupancyLevel] ?? 3.5;

  // Average over all 168 weekly slots (no solar in weekly average — uses solar separately per slot)
  let totalRate = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const equipRate  = slotHeatRate(room, roomType, blocks, day, hour, baseRate);
      const people     = peopleCountForSlot(room, roomType, blocks, day, hour);
      const basePeople = room.occupancyLevel === "THREE_FOUR" ? 3.5 : 1.5;
      const peopleRate = basePeople > 0 ? (people / basePeople) * basePeopleRate : 0;
      totalRate += equipRate + peopleRate;
    }
  }
  const avgHeatRate = totalRate / 168;
  const qInternal   = avgHeatRate * floorArea;

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

// ── Per-slot balance point (used for hourly recommendations) ─────────────────

export function balancePointForSlot(
  room:      RoomFull,
  dayOfWeek: number,
  hour:      number,
  bias:      number = 0,
  precipProb: number = 0,
): number {
  const floorArea = room.lengthFt * room.widthFt;
  const blocks    = parseBlocks(room);
  const baseRate  = HEAT_SOURCE_RATE[room.heatSourceLevel] ?? 1.5;
  const roomType  = inferRoomType(room.name, room.heatSourceLevel as import("./schema").HeatSourceLevel);

  // Equipment + people heat for this slot
  const equipRate  = slotHeatRate(room, roomType, blocks, dayOfWeek, hour, baseRate);
  const people     = peopleCountForSlot(room, roomType, blocks, dayOfWeek, hour);
  const basePeople = room.occupancyLevel === "THREE_FOUR" ? 3.5 : 1.5;
  const BASE_PEOPLE_RATE: Record<string, number> = { EMPTY:0, ONE_TWO:3.5, THREE_FOUR:5.5 };
  const basePRate  = BASE_PEOPLE_RATE[room.occupancyLevel] ?? 3.5;
  const peopleRate = basePeople > 0 ? (people / basePeople) * basePRate : 0;

  // Solar gains this slot
  const windowInputs = buildWindowInputs(room);
  const wallInputs   = buildWallInputs(room);
  const solarW  = windowSolarGain(windowInputs, hour, precipProb);
  const solarWl = wallSolarGain(wallInputs, hour, precipProb);
  const solarR  = roofSolarGain(
    floorArea,
    (room.roofColor  ?? "MEDIUM") as import("./schema").SurfaceColor,
    (room.roofType   ?? "ATTIC_BUFFERED") as import("./schema").RoofType,
    hour, precipProb,
  );

  const qInternal = ((equipRate + peopleRate) * floorArea) + solarW + solarWl + solarR;

  const { uaTotal } = computeUA(room);
  if (uaTotal === 0) return room.maxTempF - bias;

  const rawBP = room.maxTempF - qInternal / uaTotal;
  return Math.round((rawBP - bias) * 10) / 10;
}
