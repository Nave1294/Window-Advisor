/**
 * Shared utilities
 */

/** Returns YYYY-MM-DD in Eastern time */
export function todayEastern(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Returns current hour 0-23 in Eastern time */
export function nowHourEastern(): number {
  return parseInt(
    new Date().toLocaleString("en-US", { hour:"numeric", hour12:false, timeZone:"America/New_York" })
  );
}

/** Clamps a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Rounds to N decimal places */
export function round(value: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
