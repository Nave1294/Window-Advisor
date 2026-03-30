/**
 * Run with: npx tsx lib/recommendation.test.ts
 */
import { generateRecommendation } from "./recommendation";
import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRoom(overrides: Partial<Room & { exteriorWalls: { direction: string }[] }> = {}) {
  return {
    id: "r1", createdAt: "", updatedAt: "", userId: "u1",
    name: "Test Room",
    floorNumber: 1, isTopFloor: false,
    lengthFt: 12, widthFt: 12, ceilingHeightFt: 8,
    orientation: "NS" as const,
    insulationLevel: "AT_CODE" as const,
    glazingType: "DOUBLE" as const,
    hasCrossBreeze: false,
    occupancyLevel: "ONE_TWO" as const,
    heatSourceLevel: "LIGHT_ELECTRONICS" as const,
    minTempF: 68, maxTempF: 74,
    minHumidity: 40, maxHumidity: 55,
    balancePoint: 41,
    exteriorWalls: [{ direction: "S" }],
    ...overrides,
  };
}

function slot(hour: number, overrides: Partial<HourlySlot> = {}): HourlySlot {
  return {
    hour, ts: 0,
    tempF: 62, humidity: 48, dewPointF: 52,
    precipProb: 0.05, windSpeedMph: 5, windDeg: 180,
    description: "clear sky", icon: "01d",
    ...overrides,
  };
}

function makeDay(slots: HourlySlot[]): DayForecast {
  const temps = slots.map(s => s.tempF);
  return {
    date: "2025-06-15",
    slots,
    highF: Math.max(...temps),
    lowF:  Math.min(...temps),
    maxHumidity:   Math.max(...slots.map(s => s.humidity)),
    maxPrecipProb: Math.max(...slots.map(s => s.precipProb)),
    maxWindMph:    Math.max(...slots.map(s => s.windSpeedMph)),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

// T1: Ideal morning open window
{
  const room = makeRoom();
  const day  = makeDay([
    slot(6,  { tempF: 58 }),
    slot(9,  { tempF: 62 }),
    slot(12, { tempF: 76 }), // too hot
    slot(15, { tempF: 80 }),
    slot(18, { tempF: 74 }),
    slot(21, { tempF: 69 }),
  ]);
  const result = generateRecommendation(room, day);
  console.log("── T1: Ideal morning window ──");
  console.log(`  shouldOpen: ${result.shouldOpen}  (expected: true)`);
  console.log(`  periods:    ${result.openPeriods.length}  (expected ≥1)`);
  result.openPeriods.forEach(p => console.log(`    ${p.from} – ${p.to}: ${p.reason}`));
  console.log(`  ${result.shouldOpen && result.openPeriods.length >= 1 ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
}

// T2: Rain all day → keep closed
{
  const room = makeRoom();
  const day  = makeDay([
    slot(6,  { precipProb: 0.75 }),
    slot(9,  { precipProb: 0.80 }),
    slot(12, { precipProb: 0.60 }),
    slot(15, { precipProb: 0.45 }),
    slot(18, { precipProb: 0.55 }),
  ]);
  const result = generateRecommendation(room, day);
  console.log("── T2: Rainy day → closed ──");
  console.log(`  shouldOpen: ${result.shouldOpen}  (expected: false)`);
  console.log(`  reasoning:  ${result.reasoning}`);
  console.log(`  ${!result.shouldOpen ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
}

// T3: Too hot all day → keep closed
{
  const room = makeRoom();
  const day  = makeDay([
    slot(6,  { tempF: 78 }),
    slot(9,  { tempF: 84 }),
    slot(12, { tempF: 91 }),
    slot(15, { tempF: 89 }),
    slot(18, { tempF: 82 }),
    slot(21, { tempF: 79 }),
  ]);
  const result = generateRecommendation(room, day);
  console.log("── T3: Too hot → closed ──");
  console.log(`  shouldOpen: ${result.shouldOpen}  (expected: false)`);
  console.log(`  reasoning:  ${result.reasoning}`);
  console.log(`  ${!result.shouldOpen ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
}

// T4: High dew point → blocked
{
  const room = makeRoom();
  const day  = makeDay([
    slot(6,  { tempF: 68, dewPointF: 67, humidity: 96 }),
    slot(9,  { tempF: 70, dewPointF: 68, humidity: 94 }),
    slot(12, { tempF: 72, dewPointF: 69, humidity: 92 }),
  ]);
  const result = generateRecommendation(room, day);
  console.log("── T4: High dew point → closed ──");
  console.log(`  shouldOpen: ${result.shouldOpen}  (expected: false)`);
  console.log(`  reasoning:  ${result.reasoning}`);
  console.log(`  ${!result.shouldOpen ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
}

// T5: Cross-breeze bonus pushes marginal slots over threshold
{
  const room = makeRoom({
    hasCrossBreeze: true,
    exteriorWalls: [{ direction: "N" }, { direction: "S" }],
  });
  // Slots that would be marginal without cross-breeze
  const day = makeDay([
    slot(6,  { tempF: 71, humidity: 52, windDeg: 180, windSpeedMph: 10 }), // S wind → good cross-breeze
    slot(9,  { tempF: 72, humidity: 54, windDeg: 185, windSpeedMph: 8  }),
  ]);
  const result = generateRecommendation(room, day);
  console.log("── T5: Cross-breeze bonus ──");
  console.log(`  shouldOpen: ${result.shouldOpen}`);
  console.log(`  slot scores: ${result.slotScores.map(s => `h${s.hour}=${s.score}`).join(", ")}`);
  console.log(`  periods: ${result.openPeriods.map(p => `${p.from}–${p.to}`).join(", ") || "none"}`);
  console.log(`  ${result.slotScores.some(s => s.score >= 55) ? "✅ PASS (scores elevated)" : "❌ FAIL"}`);
  console.log();
}

// T6: Two separate open windows in one day
{
  const room = makeRoom();
  const day  = makeDay([
    slot(6,  { tempF: 60 }),   // open
    slot(9,  { tempF: 63 }),   // open
    slot(12, { tempF: 78 }),   // closed — too hot
    slot(15, { tempF: 80 }),   // closed
    slot(18, { tempF: 70 }),   // open
    slot(21, { tempF: 67 }),   // open
  ]);
  const result = generateRecommendation(room, day);
  console.log("── T6: Two open windows ──");
  console.log(`  shouldOpen: ${result.shouldOpen}`);
  console.log(`  periods:    ${result.openPeriods.length}  (expected 2)`);
  result.openPeriods.forEach(p => console.log(`    ${p.from} – ${p.to}`));
  console.log(`  ${result.openPeriods.length === 2 ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
}
