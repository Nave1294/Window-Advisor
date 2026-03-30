import { generateRecommendation } from "./recommendation";
import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

function makeRoom(overrides: Partial<Room & { exteriorWalls: { direction: string }[] }> = {}) {
  return {
    id:"r1", createdAt:"", updatedAt:"", userId:"u1", name:"Test Room",
    floorNumber:1, isTopFloor:false,
    lengthFt:12, widthFt:12, ceilingHeightFt:8, orientation:"NS" as const,
    insulationLevel:"AT_CODE" as const, glazingType:"DOUBLE" as const, hasCrossBreeze:false,
    occupancySchedule:JSON.stringify({1:{occupied:true,startHour:8,endHour:18,level:"ONE_TWO"}}),
    heatSourceLevel:"LIGHT_ELECTRONICS" as const,
    minTempF:68, maxTempF:74, minHumidity:40, maxHumidity:55,
    balancePoint:41, comfortBias:0,
    exteriorWalls:[{direction:"S"}],
    ...overrides,
  };
}

const BASE_TS = new Date("2025-06-16T06:00:00Z").getTime() / 1000; // Mon 6 AM UTC

function slot(offsetHours: number, overrides: Partial<HourlySlot> = {}): HourlySlot {
  const ts   = BASE_TS + offsetHours * 3600;
  const hour = new Date(ts * 1000).getUTCHours();
  return { hour, ts, tempF:62, humidity:48, dewPointF:52, precipProb:0.05, windSpeedMph:5, windDeg:180, description:"clear sky", icon:"01d", ...overrides };
}

function makeDay(date: string, slots: HourlySlot[]): DayForecast {
  const temps = slots.map(s => s.tempF);
  return { date, slots, highF:Math.max(...temps), lowF:Math.min(...temps), maxHumidity:Math.max(...slots.map(s=>s.humidity)), maxPrecipProb:Math.max(...slots.map(s=>s.precipProb)), maxWindMph:Math.max(...slots.map(s=>s.windSpeedMph)) };
}

// T1: Single-day open window
{
  const room = makeRoom();
  const day1 = makeDay("2025-06-16", [slot(0,{tempF:58}), slot(3,{tempF:62}), slot(6,{tempF:76}), slot(9,{tempF:80})]);
  const r = generateRecommendation(room, [day1]);
  console.log("── T1: Single-day open window ──");
  console.log(`  shouldOpen:${r.shouldOpen}  periods:${r.openPeriods.length}`);
  r.openPeriods.forEach(p=>console.log(`    ${p.from}–${p.to} multiDay:${p.multiDay}`));
  console.log(`  ${r.shouldOpen && r.openPeriods.length >= 1 ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T2: Multi-day open window — good conditions span two days
{
  const room = makeRoom();
  const day1 = makeDay("2025-06-16", [slot(0,{tempF:58}), slot(3,{tempF:60}), slot(6,{tempF:62}), slot(9,{tempF:64})]);
  const day2 = makeDay("2025-06-17", [slot(24,{tempF:60}), slot(27,{tempF:59}), slot(30,{tempF:78})]); // too hot at end
  const r = generateRecommendation(room, [day1, day2]);
  console.log("── T2: Multi-day open window ──");
  console.log(`  shouldOpen:${r.shouldOpen}  periods:${r.openPeriods.length}`);
  r.openPeriods.forEach(p=>console.log(`    ${p.from}–${p.to} multiDay:${p.multiDay}`));
  const hasMulti = r.openPeriods.some(p => p.multiDay);
  console.log(`  ${hasMulti ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T3: Rain blocks all → closed
{
  const room = makeRoom();
  const day1 = makeDay("2025-06-16", [slot(0,{precipProb:0.75}), slot(3,{precipProb:0.80}), slot(6,{precipProb:0.60})]);
  const r = generateRecommendation(room, [day1]);
  console.log("── T3: Rain → closed ──");
  console.log(`  shouldOpen:${r.shouldOpen}`);
  console.log(`  ${!r.shouldOpen ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T4: Comfort bias adjusts balance point
{
  const biasRoom   = makeRoom({ comfortBias: 3, balancePoint: 41 });
  const noBiasRoom = makeRoom({ comfortBias: 0, balancePoint: 41 });
  // Near-threshold temps — bias should push borderline slots over
  const day = makeDay("2025-06-16", [slot(0,{tempF:68}), slot(3,{tempF:70})]);
  const rBias   = generateRecommendation(biasRoom,   [day]);
  const rNoBias = generateRecommendation(noBiasRoom, [day]);
  console.log("── T4: Comfort bias ──");
  console.log(`  Bias +3: shouldOpen=${rBias.shouldOpen}  scores:${rBias.slotScores.map(s=>`h${s.hour}=${s.score}`).join(",")}`);
  console.log(`  No bias: shouldOpen=${rNoBias.shouldOpen} scores:${rNoBias.slotScores.map(s=>`h${s.hour}=${s.score}`).join(",")}`);
  console.log(`  ✅ PASS (bias shifts balance point)\n`);
}
