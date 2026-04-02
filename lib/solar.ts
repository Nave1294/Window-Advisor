/**
 * Solar Gain Engine
 * =================
 * Calculates solar heat gain through windows, walls, and roof.
 *
 * Physics basis: ASHRAE Fundamentals — Sol-Air Temperature Method
 * ==============================================================
 * For opaque surfaces (walls, roof), absorbed solar energy raises the
 * exterior surface temperature. The fraction that conducts INTO the
 * building is governed by the assembly U-value, NOT a fixed percentage
 * of absorbed energy.
 *
 * Correct formula (sol-air):
 *   Q_surface = U_assembly × Area × (alpha × I × orient / ho)
 *
 * where:
 *   U_assembly = thermal conductance of the wall/ceiling (BTU/hr·ft²·°F)
 *   alpha      = surface absorptivity (0-1)
 *   I          = incident irradiance (BTU/hr·ft²)
 *   orient     = orientation factor (fraction of peak reaching that face)
 *   ho         = exterior film coefficient (BTU/hr·ft²·°F)
 *                  walls: 4.0  (vertical surface, standard wind)
 *                  roofs: 2.5  (horizontal surface, lower convection)
 *
 * This correctly ties solar gain to insulation level — a better-insulated
 * wall admits LESS solar heat for the same absorbed radiation, because
 * its lower U-value resists conduction inward.
 *
 * Window solar gain uses the SHGC (Solar Heat Gain Coefficient), which
 * already accounts for both direct transmission and absorbed-then-re-emitted
 * heat. This is the standard approach and does not change.
 */

import type { SurfaceColor, RoofType, GlazingType, Direction, InsulationLevel } from "./schema";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Peak clear-sky irradiance at noon on a horizontal surface (BTU/hr·ft²) */
const PEAK_IRRADIANCE = 250;

/** SHGC by glazing type — NFRC typical values */
const SHGC: Record<GlazingType, number> = {
  SINGLE: 0.86,   // single clear
  DOUBLE: 0.27,   // double low-e (standard modern)
  TRIPLE: 0.20,   // triple low-e
};

/** Solar absorptivity by surface color */
const ABSORPTIVITY: Record<SurfaceColor, number> = {
  LIGHT:  0.25,
  MEDIUM: 0.55,
  DARK:   0.85,
};

/**
 * Exterior film coefficient (BTU/hr·ft²·°F)
 * Walls (vertical): 4.0 — standard ASHRAE value with moderate wind
 * Roofs (horizontal/low-slope): 2.5 — lower convection on flat surfaces
 */
const HO_WALL = 4.0;
const HO_ROOF = 2.5;

/**
 * Wall U-values (BTU/hr·ft²·°F) — matches balance-point.ts
 * Used to compute sol-air driven conduction correctly.
 */
const WALL_U: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.10,
  AT_CODE:    0.065,
  ABOVE_CODE: 0.040,
};

/**
 * Ceiling U-values (BTU/hr·ft²·°F) — ASHRAE 90.1-2019 CZ4A
 * BELOW_CODE: R-19 → U ≈ 0.052
 * AT_CODE:    R-38 → U ≈ 0.026
 * ABOVE_CODE: R-49+ → U ≈ 0.020
 */
const CEILING_U: Record<InsulationLevel, number> = {
  BELOW_CODE: 0.052,
  AT_CODE:    0.026,
  ABOVE_CODE: 0.020,
};

/**
 * Attic transmittance factors — fraction of absorbed roof solar that
 * reaches the ceiling after attic buffering/ventilation.
 * ATTIC_BUFFERED: well-ventilated attic dissipates ~60% → 40% reaches ceiling
 * FLAT_VAULTED:   no attic buffer → 65% reaches ceiling assembly
 * DIRECT_EXPOSED: minimal insulation/assembly → 90% reaches ceiling
 */
const ATTIC_FACTOR: Record<RoofType, number> = {
  ATTIC_BUFFERED: 0.40,
  FLAT_VAULTED:   0.65,
  DIRECT_EXPOSED: 0.90,
};

// ── Orientation factors ────────────────────────────────────────────────────────

/**
 * Returns the fraction of peak horizontal irradiance incident on each face.
 * Averaged for mid-latitude (40°N), shoulder/ventilation season (Mar–Oct).
 */
const ORIENT_FACTOR: Record<Direction, (hour: number) => number> = {
  S: (h) => Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)),
  N: (_)  => 0.08,
  E: (h)  => Math.max(0, Math.sin(((h - 6) / 6)  * Math.PI)) * 0.85,
  W: (h)  => Math.max(0, Math.sin(((h - 12) / 6) * Math.PI)) * 0.85,
};

// ── Irradiance at a given hour ────────────────────────────────────────────────

/**
 * Clear-sky horizontal irradiance (BTU/hr·ft²) for the given hour.
 * Bell curve from sunrise (~6 AM) to sunset (~8 PM).
 * Attenuated by cloud cover / precipitation probability.
 */
export function hourlyIrradiance(hour: number, precipProb: number): number {
  if (hour < 6 || hour >= 20) return 0;

  const cloudFactor = precipProb >= 0.7 ? 0.10
                    : precipProb >= 0.4 ? 0.35
                    : precipProb >= 0.2 ? 0.65
                    : 1.0;

  const solarAngle = Math.sin(((hour - 6) / 14) * Math.PI);
  return PEAK_IRRADIANCE * solarAngle * cloudFactor;
}

// ── Window solar gain ──────────────────────────────────────────────────────────

export interface WindowInput {
  direction:   Direction;
  areaSqFt:    number;
  glazingType: GlazingType;
}

/**
 * Solar heat gain through windows (BTU/hr).
 * Uses SHGC — the standard and correct approach for glazing.
 */
export function windowSolarGain(
  windows:    WindowInput[],
  hour:       number,
  precipProb: number,
): number {
  const irr = hourlyIrradiance(hour, precipProb);
  if (irr === 0) return 0;
  return windows.reduce((sum, w) => {
    const orient = ORIENT_FACTOR[w.direction]?.(hour) ?? 0;
    return sum + irr * orient * SHGC[w.glazingType] * w.areaSqFt;
  }, 0);
}

// ── Wall solar gain ────────────────────────────────────────────────────────────

export interface WallInput {
  direction:      Direction;
  areaSqFt:       number;
  color:          SurfaceColor;
  insulationLevel: InsulationLevel;  // needed for sol-air U-value lookup
}

/**
 * Solar heat gain through exterior walls (BTU/hr) — sol-air method.
 *
 *   Q = U_wall × A × (alpha × I × orient / ho_wall)
 *
 * A better-insulated wall (lower U) correctly admits LESS solar heat.
 * A darker wall (higher alpha) correctly admits MORE.
 */
export function wallSolarGain(
  walls:      WallInput[],
  hour:       number,
  precipProb: number,
): number {
  const irr = hourlyIrradiance(hour, precipProb);
  if (irr === 0) return 0;
  return walls.reduce((sum, w) => {
    const orient  = ORIENT_FACTOR[w.direction]?.(hour) ?? 0;
    const uWall   = WALL_U[w.insulationLevel] ?? WALL_U.AT_CODE;
    const solAirDeltaT = ABSORPTIVITY[w.color] * irr * orient / HO_WALL;
    return sum + uWall * w.areaSqFt * solAirDeltaT;
  }, 0);
}

// ── Roof / ceiling solar gain ──────────────────────────────────────────────────

/**
 * Solar heat gain through the roof/ceiling assembly (BTU/hr) — sol-air method.
 *
 *   Q = U_ceiling × A × (alpha × I_horiz × attic_factor / ho_roof)
 *
 * A better-insulated ceiling (lower U) correctly admits less heat.
 * An attic-buffered roof attenuates more (lower attic_factor).
 */
export function roofSolarGain(
  floorAreaSqFt:   number,
  roofColor:       SurfaceColor,
  roofType:        RoofType,
  insulationLevel: InsulationLevel,
  hour:            number,
  precipProb:      number,
): number {
  const irr = hourlyIrradiance(hour, precipProb);
  if (irr === 0) return 0;

  // Roof is roughly horizontal — use south-proxy orientation at 0.9 efficiency
  const roofOrient   = ORIENT_FACTOR.S(hour) * 0.9;
  const uCeiling     = CEILING_U[insulationLevel] ?? CEILING_U.AT_CODE;
  const solAirDeltaT = ABSORPTIVITY[roofColor] * irr * roofOrient * ATTIC_FACTOR[roofType] / HO_ROOF;
  return uCeiling * floorAreaSqFt * solAirDeltaT;
}

// ── Ceiling UA (conductive heat loss, not solar) ───────────────────────────────

/**
 * Ceiling UA (BTU/hr·°F) — steady-state conductive heat loss.
 * Only applies to top-floor rooms.
 */
export function ceilingUA(
  floorAreaSqFt:  number,
  insulationLevel: string,
  isTopFloor:      boolean,
): number {
  if (!isTopFloor) return 0;
  return floorAreaSqFt * (CEILING_U[insulationLevel as InsulationLevel] ?? CEILING_U.AT_CODE);
}
