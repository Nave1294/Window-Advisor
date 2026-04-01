/**
 * Solar Gain Engine
 * =================
 * Calculates solar heat gain through windows, walls, and roof for a given
 * hour of the day. Used by balance-point.ts to produce per-slot heat loads.
 *
 * Simplified but physically grounded model:
 * - Solar irradiance varies by hour (sunrise→noon→sunset bell curve)
 * - Orientation factors scale for N/S/E/W surfaces
 * - SHGC by glazing type for windows
 * - Absorptivity by surface color for walls and roof
 * - Roof gain reduced by 60% when attic-buffered
 * - All gains zero at night or on heavily rainy slots
 */

import type { SurfaceColor, RoofType, GlazingType, Direction } from "./schema";

// ── Constants ──────────────────────────────────────────────────────────────────

// Peak clear-sky irradiance at noon (BTU/hr·ft²)
const PEAK_IRRADIANCE = 250;

// SHGC by glazing type (fraction of solar energy transmitted)
const SHGC: Record<GlazingType, number> = {
  SINGLE: 0.86,
  DOUBLE: 0.40,
  TRIPLE: 0.27,
};

// Solar absorptivity by surface color
const ABSORPTIVITY: Record<SurfaceColor, number> = {
  LIGHT:  0.25,
  MEDIUM: 0.55,
  DARK:   0.85,
};

// Orientation multipliers: fraction of peak irradiance reaching each face
// Averaged across summer/shoulder season conditions, 40°N latitude
const ORIENT_FACTOR: Record<Direction, (hour: number) => number> = {
  S: (h) => Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)),           // south: broad midday peak
  N: (_)  => 0.08,                                                       // north: minimal diffuse only
  E: (h)  => Math.max(0, Math.sin(((h - 6) / 6)  * Math.PI)) * 0.85,   // east: morning peak
  W: (h)  => Math.max(0, Math.sin(((h - 12) / 6) * Math.PI)) * 0.85,   // west: afternoon peak
};

// ── Irradiance at a given hour ────────────────────────────────────────────────

/**
 * Returns clear-sky irradiance (BTU/hr·ft²) for the given hour.
 * Uses a simple bell curve from sunrise (6 AM) to sunset (8 PM).
 */
export function hourlyIrradiance(hour: number, precipProb: number): number {
  if (hour < 6 || hour >= 20) return 0;  // nighttime

  // Cloud/rain attenuation
  const cloudFactor = precipProb >= 0.7 ? 0.1
                    : precipProb >= 0.4 ? 0.35
                    : precipProb >= 0.2 ? 0.65
                    : 1.0;

  const solarAngle = Math.sin(((hour - 6) / 14) * Math.PI);
  return PEAK_IRRADIANCE * solarAngle * cloudFactor;
}

// ── Window solar gain ─────────────────────────────────────────────────────────

export interface WindowInput {
  direction:      Direction;
  areaSqFt:       number;
  glazingType:    GlazingType;
}

/**
 * Returns total solar gain through all windows (BTU/hr) for a given hour.
 */
export function windowSolarGain(
  windows:    WindowInput[],
  hour:       number,
  precipProb: number,
): number {
  const irr = hourlyIrradiance(hour, precipProb);
  if (irr === 0) return 0;

  return windows.reduce((sum, w) => {
    const orientFn = ORIENT_FACTOR[w.direction] ?? (() => 0);
    return sum + irr * orientFn(hour) * SHGC[w.glazingType] * w.areaSqFt;
  }, 0);
}

// ── Wall solar gain ───────────────────────────────────────────────────────────

export interface WallInput {
  direction:  Direction;
  areaSqFt:   number;
  color:      SurfaceColor;
}

/**
 * Returns total solar gain through all exterior walls (BTU/hr) for a given hour.
 * Uses sol-air temperature approximation: absorbed solar raises surface temp,
 * some of which conducts through the wall. We use a 15% conduction fraction
 * as a simplified thermal lag approximation.
 */
export function wallSolarGain(
  walls:      WallInput[],
  hour:       number,
  precipProb: number,
): number {
  const irr = hourlyIrradiance(hour, precipProb);
  if (irr === 0) return 0;

  const WALL_CONDUCTION_FRACTION = 0.15;

  return walls.reduce((sum, w) => {
    const orientFn = ORIENT_FACTOR[w.direction] ?? (() => 0);
    const absorbed = irr * orientFn(hour) * ABSORPTIVITY[w.color] * w.areaSqFt;
    return sum + absorbed * WALL_CONDUCTION_FRACTION;
  }, 0);
}

// ── Roof solar gain ───────────────────────────────────────────────────────────

/**
 * Returns solar gain through the roof/ceiling (BTU/hr) for a given hour.
 * Attic-buffered roofs attenuate by 60% due to attic ventilation and mass.
 */
export function roofSolarGain(
  floorAreaSqFt: number,
  roofColor:     SurfaceColor,
  roofType:      RoofType,
  hour:          number,
  precipProb:    number,
): number {
  const irr = hourlyIrradiance(hour, precipProb);
  if (irr === 0) return 0;

  // Roof sees mostly diffuse + direct from directly above — use south factor as proxy
  const roofFactor = ORIENT_FACTOR.S(hour) * 0.9;
  const absorbed   = irr * roofFactor * ABSORPTIVITY[roofColor] * floorAreaSqFt;

  const attenuation = roofType === "ATTIC_BUFFERED"   ? 0.35
                    : roofType === "FLAT_VAULTED"      ? 0.70
                    : /* DIRECT_EXPOSED */               0.90;

  return absorbed * attenuation;
}

// ── Ceiling UA (replaces flat floor penalty) ──────────────────────────────────

const CEILING_U: Record<string, number> = {
  BELOW_CODE: 0.075,
  AT_CODE:    0.045,
  ABOVE_CODE: 0.025,
};

/**
 * Returns ceiling UA (BTU/hr·°F) — heat loss through the ceiling/roof assembly.
 * Only meaningful for top-floor rooms where ceiling faces outdoors or attic.
 */
export function ceilingUA(
  floorAreaSqFt: number,
  insulationLevel: string,
  isTopFloor: boolean,
): number {
  if (!isTopFloor) return 0;
  return floorAreaSqFt * (CEILING_U[insulationLevel] ?? CEILING_U.AT_CODE);
}
