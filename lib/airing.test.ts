import { generateAiringRecommendations } from "./airing";
import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

const BASE_TS = new Date("2025-06-16T06:00:00Z").getTime() / 1000; // Mon 6 AM UTC

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id:"r1", createdAt:"", updatedAt:"", userId:"u1", name:"Living Room",
    floorNumber:1, isTopFloor:false,
    lengthFt:15, widthFt:12, ceilingHeightFt:8,
    orientation:"NS", insulationLevel:"AT_CODE", glazingType:"DOUBLE",
    hasCrossBreeze:false, heatSourceLevel:"LIGHT_ELECTRONICS",
    occupancySchedule: JSON.stringify({
      1:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},
      2:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},
      3:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},
      4:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},
      5:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},
    }),
    minTempF:68, maxTempF:74, minHumidity:40, maxHumidity:55,
    balancePoint:41, comfortBias:0,
    ...overrides,
  };
}

function slot(offsetHours: number, overrides: Partial<HourlySlot> = {}): HourlySlot {
  const ts   = BASE_TS + offsetHours * 3600;
  const hour = new Date(ts * 1000).getUTCHours();
  return { hour, ts, tempF:62, humidity:48, dewPointF:50, precipProb:0.05, windSpeedMph:5, windDeg:180, description:"clear", icon:"01d", ...overrides };
}

function makeDay(date: string, slots: HourlySlot[]): DayForecast {
  const temps = slots.map(s => s.tempF);
  return { date, slots, highF:Math.max(...temps), lowF:Math.min(...temps), maxHumidity:50, maxPrecipProb:0.05, maxWindMph:5 };
}

// T1: CO2 interval scales with room size and occupancy
{
  const small = makeRoom({ lengthFt:10, widthFt:10, ceilingHeightFt:8 });
  const large = makeRoom({ lengthFt:20, widthFt:20, ceilingHeightFt:9 });
  const day   = makeDay("2025-06-16", [slot(3,{tempF:60}),slot(6,{tempF:62}),slot(9,{tempF:64})]);

  const rSmall = generateAiringRecommendations(small, [day], 41);
  const rLarge = generateAiringRecommendations(large, [day], 41);

  console.log("── T1: Interval scales with volume ──");
  console.log(`  Small room (800 ft³): ${rSmall.intervalMins} min`);
  console.log(`  Large room (3600 ft³): ${rLarge.intervalMins} min`);
  console.log(`  ${rLarge.intervalMins > rSmall.intervalMins ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T2: Unoccupied room → no airing needed
{
  const room = makeRoom({ occupancySchedule: "{}" });
  const day  = makeDay("2025-06-16", [slot(3),slot(6),slot(9)]);
  const r    = generateAiringRecommendations(room, [day], 41);
  console.log("── T2: Unoccupied → no airing ──");
  console.log(`  needsAiring:${r.needsAiring} windows:${r.windows.length}`);
  console.log(`  ${!r.needsAiring ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T3: Rain blocks airing slots
{
  const room = makeRoom();
  const day  = makeDay("2025-06-16", [
    slot(3, {tempF:62, precipProb:0.8}),
    slot(6, {tempF:62, precipProb:0.7}),
    slot(9, {tempF:62, precipProb:0.9}),
  ]);
  const r = generateAiringRecommendations(room, [day], 41);
  console.log("── T3: Rain → no airing windows ──");
  console.log(`  windows:${r.windows.length}`);
  console.log(`  ${r.windows.length === 0 ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T4: Slots only during waking + occupied hours
{
  const room = makeRoom();
  // Slots at night (2 AM, 4 AM) and morning outside occupied window (7 AM) + in window (10 AM, 2 PM)
  const day = makeDay("2025-06-16", [
    slot(-4, {tempF:58}),  // 2 AM — waking but not occupied
    slot(-2, {tempF:57}),  // 4 AM — not waking
    slot(1,  {tempF:60}),  // 7 AM — waking but not occupied per schedule
    slot(4,  {tempF:62}),  // 10 AM — occupied ✓
    slot(8,  {tempF:64}),  // 2 PM — occupied ✓
  ]);
  const r = generateAiringRecommendations(room, [day], 41);
  const allOccupied = r.windows.every(w => w.hour >= 9 && w.hour < 17);
  console.log("── T4: Only suggests occupied waking hours ──");
  console.log(`  windows:${r.windows.length}`, r.windows.map(w=>`h${w.hour}`).join(","));
  console.log(`  ${allOccupied ? "✅ PASS" : "❌ FAIL"}\n`);
}

// T5: Prefers least disruptive slot
{
  const room = makeRoom();
  const day = makeDay("2025-06-16", [
    slot(3,  {tempF:41, precipProb:0.05}),  // 9 AM exactly at balance point = best
    slot(7,  {tempF:80, precipProb:0.05}),  // 1 PM very hot = worst
  ]);
  const r = generateAiringRecommendations(room, [day], 41);
  console.log("── T5: Prefers low-disruption slot ──");
  r.windows.forEach(w => console.log(`  h${w.hour} disruption:${w.disruption} ${w.label}`));
  const firstWindow = r.windows[0];
  console.log(`  ${firstWindow?.disruption === "low" || firstWindow?.hour === 9 ? "✅ PASS" : "❌ FAIL"}\n`);
}
