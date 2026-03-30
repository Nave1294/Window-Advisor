/**
 * Manual test — run with: npx tsx lib/balance-point.test.ts
 * Covers the worked example from the spec + edge cases.
 */
import { calculateBalancePoint } from "./balance-point";
import type { RoomFull } from "./schema";

function makeRoom(overrides: Partial<RoomFull> = {}): RoomFull {
  return {
    id: "test", createdAt: "", updatedAt: "", userId: "u1",
    name: "Test Room",
    floorNumber: 1, isTopFloor: false,
    lengthFt: 12.5, widthFt: 12, ceilingHeightFt: 8,
    orientation: "NS",
    insulationLevel: "AT_CODE",
    glazingType: "DOUBLE",
    hasCrossBreeze: false,
    occupancyLevel: "ONE_TWO",
    heatSourceLevel: "LIGHT_ELECTRONICS",
    minTempF: 68, maxTempF: 74,
    minHumidity: 40, maxHumidity: 55,
    balancePoint: null,
    exteriorWalls: [
      { id: "w1", roomId: "test", direction: "S" },
      { id: "w2", roomId: "test", direction: "W" },
    ],
    windows: [
      { id: "win1", roomId: "test", size: "MEDIUM", direction: "S", glazingOverride: null },
    ],
    ...overrides,
  };
}

// ── Test 1: Spec worked example ───────────────────────────────────────────────
// 150 ft² room (12×12.5), 8ft ceiling, floor 1, AT_CODE, one MEDIUM S window,
// S+W exterior walls, maxTempF=74 → expected ~40.9°F
{
  const room = makeRoom();
  const result = calculateBalancePoint(room);

  console.log("── Test 1: Spec worked example ──");
  console.log(`  Floor area:       ${result.floorArea} ft²`);
  console.log(`  Volume:           ${result.volume} ft³`);
  console.log(`  Q_internal:       ${result.qInternal} BTU/hr`);
  console.log(`  UA_walls:         ${result.uaWalls}`);
  console.log(`  UA_windows:       ${result.uaWindows}`);
  console.log(`  UA_infiltration:  ${result.uaInfiltration}`);
  console.log(`  UA_total:         ${result.uaTotal}`);
  console.log(`  Balance point:    ${result.balancePoint}°F  (expected ~40.9°F)`);

  // Spec says ~40.9°F — allow ±1°F for floating point
  const ok = Math.abs(result.balancePoint - 40.9) < 1;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
}

// ── Test 2: Top-floor penalty ────────────────────────────────────────────────
// More internal heat (Q↑) → Q/UA↑ → T_balance = T_setpoint − Q/UA goes DOWN.
// A top-floor room generates more heat and needs colder outdoor air to cool.
{
  const room = makeRoom({ floorNumber: 3, isTopFloor: true });
  const result = calculateBalancePoint(room);
  console.log("── Test 2: Top floor (floor 3, roof above) ──");
  console.log(`  Balance point: ${result.balancePoint}°F  (should be LOWER than Test 1 — more internal heat)`);
  const ok = result.balancePoint < 40.9;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
}

// ── Test 3: Well-insulated room ──────────────────────────────────────────────
// Better insulation → UA↓ → Q/UA↑ → T_balance goes DOWN.
// A tight envelope holds heat in; needs colder outside air to lose heat.
{
  const room = makeRoom({ insulationLevel: "ABOVE_CODE" });
  const result = calculateBalancePoint(room);
  console.log("── Test 3: Above-code insulation ──");
  console.log(`  Balance point: ${result.balancePoint}°F  (should be LOWER than AT_CODE — tighter envelope retains heat)`);
  const ok = result.balancePoint < 40.9;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
}

// ── Test 4: Kitchen with single-pane windows ─────────────────────────────────
{
  const room = makeRoom({
    occupancyLevel: "THREE_FOUR",
    heatSourceLevel: "KITCHEN_LAUNDRY",
    glazingType: "SINGLE",
    windows: [
      { id: "w1", roomId: "test", size: "LARGE",  direction: "S", glazingOverride: null },
      { id: "w2", roomId: "test", size: "MEDIUM", direction: "W", glazingOverride: null },
    ],
  });
  const result = calculateBalancePoint(room);
  console.log("── Test 4: High-heat kitchen, single-pane ──");
  console.log(`  Q_internal:    ${result.qInternal} BTU/hr`);
  console.log(`  UA_windows:    ${result.uaWindows}  (high from single pane)`);
  console.log(`  Balance point: ${result.balancePoint}°F  (should be low — lots of internal heat + leaky envelope)`);
  const ok = result.balancePoint < 40;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
}

// ── Test 5: Directionality — EW orientation changes wall areas ───────────────
{
  const roomNS = makeRoom({ orientation: "NS", exteriorWalls: [{ id: "e1", roomId: "test", direction: "N" }], windows: [] });
  const roomEW = makeRoom({ orientation: "EW", exteriorWalls: [{ id: "e1", roomId: "test", direction: "N" }], windows: [] });
  const resNS  = calculateBalancePoint(roomNS);
  const resEW  = calculateBalancePoint(roomEW);
  console.log("── Test 5: Orientation affects wall area ──");
  console.log(`  NS orientation, N wall UA_walls: ${resNS.uaWalls}  (N wall width = widthFt = 12)`);
  console.log(`  EW orientation, N wall UA_walls: ${resEW.uaWalls}  (N wall width = lengthFt = 12.5)`);
  const ok = resEW.uaWalls > resNS.uaWalls;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
}

// ── Test 6: Per-window glazing override ──────────────────────────────────────
{
  // Room default = DOUBLE, but one window is SINGLE
  const room = makeRoom({
    glazingType: "DOUBLE",
    windows: [
      { id: "w1", roomId: "test", size: "MEDIUM", direction: "S", glazingOverride: "SINGLE" },
    ],
  });
  const resultOverride = calculateBalancePoint(room);
  const resultDefault  = calculateBalancePoint(makeRoom()); // same but DOUBLE on all
  console.log("── Test 6: Per-window glazing override ──");
  console.log(`  UA_windows (SINGLE override): ${resultOverride.uaWindows}  (expected 10 × 0.90 = 9.0)`);
  console.log(`  UA_windows (DOUBLE default):  ${resultDefault.uaWindows}   (expected 10 × 0.30 = 3.0)`);
  const ok = Math.abs(resultOverride.uaWindows - 9.0) < 0.01 &&
             Math.abs(resultDefault.uaWindows  - 3.0) < 0.01;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
}
