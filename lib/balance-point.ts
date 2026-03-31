import { inferRoomType, slotHeatRate, peopleCountForSlot } from "./room-profile";
import type { RoomFull, InsulationLevel, GlazingType, WindowSize, Orientation } from "./schema";
import { parseBlocks } from "./occupancy";

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
export const HEAT_SOURCE_RATE: Record<string, number> = {
  MINIMAL: 0.5, LIGHT_ELECTRONICS: 1.5, HOME_OFFICE: 3.0, KITCHEN_LAUNDRY: 5.0,
};

function wallGrossArea(face: string, lengthFt: number, widthFt: number, ceilingHeightFt: number, orientation: Orientation): number {
  const isLengthFace = orientation === "NS" ? (face === "E" || face === "W") : (face === "N" || face === "S");
  return (isLengthFace ? lengthFt : widthFt) * ceilingHeightFt;
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
  const { lengthFt, widthFt, ceilingHeightFt, orientation, insulationLevel,
          glazingType, heatSourceLevel, floorNumber, isTopFloor, maxTempF,
          windows: roomWindows, exteriorWalls } = room;

  const floorArea  = lengthFt * widthFt;
  const volume     = floorArea * ceilingHeightFt;
  const blocks     = parseBlocks(room);
  const baseRate   = HEAT_SOURCE_RATE[heatSourceLevel] ?? 1.5;
  const roomType   = inferRoomType(room.name, heatSourceLevel as import("./schema").HeatSourceLevel);
  const floorPenalty = (floorNumber - 1) * 0.3 + (isTopFloor ? 0.8 : 0);

  // Compute weighted average heat rate across all 168 weekly hour-slots
  // Includes both equipment heat (from heat source level) and people heat (from occupancy)
  // People rates based on ASHRAE ~250 BTU/hr sensible per sedentary occupant
  const BASE_PEOPLE_RATE: Record<string, number> = { EMPTY: 0, ONE_TWO: 2.0, THREE_FOUR: 3.5 };
  const basePeopleRate = BASE_PEOPLE_RATE[room.occupancyLevel] ?? 3.5;

  let totalRate = 0, totalSlots = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const equipRate   = slotHeatRate(room, roomType, blocks, day, hour, baseRate);
      const people      = peopleCountForSlot(room, roomType, blocks, day, hour);
      const basePeople  = room.occupancyLevel === "THREE_FOUR" ? 3.5 : 1.5;
      const peopleRate  = basePeople > 0 ? (people / basePeople) * basePeopleRate : 0;
      totalRate += equipRate + peopleRate;
      totalSlots++;
    }
  }
  const avgHeatRate = totalRate / totalSlots;
  const qInternal   = (avgHeatRate + floorPenalty) * floorArea;

  // Window UA
  const windowAreaByFace: Partial<Record<string, number>> = {};
  let uaWindows = 0;
  for (const win of roomWindows) {
    const area = WINDOW_AREA[win.size as WindowSize];
    const uVal = WINDOW_U[(win.glazingOverride ?? glazingType) as GlazingType];
    uaWindows += area * uVal;
    windowAreaByFace[win.direction] = (windowAreaByFace[win.direction] ?? 0) + area;
  }

  // Wall UA
  const wallU = WALL_U[insulationLevel as InsulationLevel];
  let uaWalls = 0;
  for (const wall of exteriorWalls) {
    const gross = wallGrossArea(wall.direction, lengthFt, widthFt, ceilingHeightFt, orientation as Orientation);
    uaWalls += Math.max(0, gross - (windowAreaByFace[wall.direction] ?? 0)) * wallU;
  }

  const uaInfiltration = ACH[insulationLevel as InsulationLevel] * volume * 0.018;
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

/**
 * Per-slot balance point — adjusts for time-of-day and day-of-week heat load.
 * Used by the recommendation engine to score each forecast slot accurately.
 */
export function balancePointForSlot(
  room:      import("./schema").RoomFull,
  dayOfWeek: number,
  hour:      number,
  bias:      number = 0,
): number {
  const { lengthFt, widthFt, ceilingHeightFt, orientation, insulationLevel,
          glazingType, floorNumber, isTopFloor, maxTempF } = room;

  const roomWindows  = room.windows ?? [];
  const exteriorWalls = room.exteriorWalls ?? [];
  const floorArea    = lengthFt * widthFt;
  const volume       = floorArea * ceilingHeightFt;
  const blocks       = parseBlocks(room);
  const baseRate     = HEAT_SOURCE_RATE[room.heatSourceLevel] ?? 1.5;
  const roomType     = inferRoomType(room.name, room.heatSourceLevel as import("./schema").HeatSourceLevel);
  const floorPenalty = (floorNumber - 1) * 0.3 + (isTopFloor ? 0.8 : 0);

  // Equipment + people heat for this specific slot
  const equipRate  = slotHeatRate(room, roomType, blocks, dayOfWeek, hour, baseRate);
  const people     = peopleCountForSlot(room, roomType, blocks, dayOfWeek, hour);
  const basePeople = room.occupancyLevel === "THREE_FOUR" ? 3.5 : 1.5;
  const BASE_PEOPLE_RATE: Record<string, number> = { EMPTY:0, ONE_TWO:2.0, THREE_FOUR:3.5 };
  const basePRate  = BASE_PEOPLE_RATE[room.occupancyLevel] ?? 3.5;
  const peopleRate = basePeople > 0 ? (people / basePeople) * basePRate : 0;
  const qInternal  = (equipRate + peopleRate + floorPenalty) * floorArea;

  // UA calculation
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
    uaWalls += Math.max(0, gross - (windowAreaByFace[wall.direction] ?? 0)) * wallU;
  }
  const uaInfiltration = ACH[insulationLevel as InsulationLevel] * volume * 0.018;
  const uaTotal        = uaWalls + uaWindows + uaInfiltration;
  if (uaTotal === 0) return maxTempF - bias;
  const rawBP = maxTempF - qInternal / uaTotal;
  return Math.round((rawBP - bias) * 10) / 10;
}
