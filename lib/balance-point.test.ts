import { calculateBalancePoint } from "./balance-point";
import type { RoomFull } from "./schema";

function makeRoom(overrides: Partial<RoomFull> = {}): RoomFull {
  return {
    id:"test", createdAt:"", updatedAt:"", userId:"u1", name:"Test Room",
    floorNumber:1, isTopFloor:false,
    lengthFt:12.5, widthFt:12, ceilingHeightFt:8, orientation:"NS",
    insulationLevel:"AT_CODE", glazingType:"DOUBLE", hasCrossBreeze:false,
    occupancySchedule:JSON.stringify({1:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},2:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},3:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},4:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"},5:{occupied:true,startHour:9,endHour:17,level:"ONE_TWO"}}),
    heatSourceLevel:"LIGHT_ELECTRONICS",
    minTempF:68, maxTempF:74, minHumidity:40, maxHumidity:55,
    balancePoint:null, comfortBias:0,
    exteriorWalls:[{id:"w1",roomId:"test",direction:"S"},{id:"w2",roomId:"test",direction:"W"}],
    windows:[{id:"win1",roomId:"test",size:"MEDIUM",direction:"S",glazingOverride:null}],
    ...overrides,
  };
}

{
  const result = calculateBalancePoint(makeRoom());
  console.log("── T1: Basic calculation ──");
  console.log(`  Balance point: ${result.balancePoint}°F`);
  console.log(`  Q_internal: ${result.qInternal} BTU/hr`);
  console.log(`  UA_total: ${result.uaTotal}`);
  console.log(`  ${result.balancePoint < 74 && result.balancePoint > 0 ? "✅ PASS" : "❌ FAIL"}\n`);
}
{
  const r1 = calculateBalancePoint(makeRoom({floorNumber:1,isTopFloor:false}));
  const r2 = calculateBalancePoint(makeRoom({floorNumber:3,isTopFloor:true}));
  console.log("── T2: Top floor runs warmer (lower balance point) ──");
  console.log(`  Floor 1: ${r1.balancePoint}°F, Floor 3 top: ${r2.balancePoint}°F`);
  console.log(`  ${r2.balancePoint < r1.balancePoint ? "✅ PASS" : "❌ FAIL"}\n`);
}
{
  const r1 = calculateBalancePoint(makeRoom({insulationLevel:"AT_CODE"}));
  const r2 = calculateBalancePoint(makeRoom({insulationLevel:"ABOVE_CODE"}));
  console.log("── T3: Tighter insulation → lower balance point ──");
  console.log(`  AT_CODE: ${r1.balancePoint}°F, ABOVE_CODE: ${r2.balancePoint}°F`);
  console.log(`  ${r2.balancePoint < r1.balancePoint ? "✅ PASS" : "❌ FAIL"}\n`);
}
{
  const always = makeRoom({occupancySchedule:JSON.stringify(Object.fromEntries(Array.from({length:7},(_,i)=>[i,{occupied:true,startHour:0,endHour:24,level:"THREE_FOUR"}])))});
  const never  = makeRoom({occupancySchedule:"{}"});
  const rA = calculateBalancePoint(always);
  const rN = calculateBalancePoint(never);
  console.log("── T4: Occupancy schedule affects Q_internal ──");
  console.log(`  Always occupied: Q=${rA.qInternal} BTU/hr, BP=${rA.balancePoint}°F`);
  console.log(`  Never occupied:  Q=${rN.qInternal} BTU/hr, BP=${rN.balancePoint}°F`);
  console.log(`  ${rA.qInternal > rN.qInternal && rA.balancePoint < rN.balancePoint ? "✅ PASS" : "❌ FAIL"}\n`);
}
