import type { RoomFull, InsulationLevel, GlazingType, WindowSize, Orientation } from "./schema";
import { parseBlocks, averageWeeklyOccupancyRate } from "./occupancy";

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

  const floorArea = lengthFt * widthFt;
  const volume    = floorArea * ceilingHeightFt;

  const blocks       = parseBlocks(room);
  const avgOccRate   = averageWeeklyOccupancyRate(room, blocks);
  const heatRate     = HEAT_SOURCE_RATE[heatSourceLevel] ?? 1.5;
  const floorPenalty = (floorNumber - 1) * 1.5 + (isTopFloor ? 1.5 : 0);
  const qInternal    = (avgOccRate + heatRate + floorPenalty) * floorArea;

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
    uaWalls    += Math.max(0, gross - (windowAreaByFace[wall.direction] ?? 0)) * wallU;
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
