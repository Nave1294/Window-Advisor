import { calculateBalancePoint } from "./balance-point";
import type { RoomFull } from "./schema";

const BASE: RoomFull = {
  id:"test",createdAt:"",updatedAt:"",userId:"u1",name:"Test Room",
  floorNumber:1,isTopFloor:false,
  lengthFt:12.5,widthFt:12,ceilingHeightFt:8,orientation:"NS",
  insulationLevel:"AT_CODE",glazingType:"DOUBLE",hasCrossBreeze:false,
  occupancyLevel:"ONE_TWO", unoccupiedBlocks:"[]",
  heatSourceLevel:"LIGHT_ELECTRONICS",
  minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
  balancePoint:null,comfortBias:0,
  notificationsEnabled:false,lastNotifiedOpen:null,lastNotifiedClose:null,
  wallColor:"MEDIUM",roofColor:"MEDIUM",roofType:"ATTIC_BUFFERED",
  exteriorWalls:[{id:"w1",roomId:"test",direction:"S"},{id:"w2",roomId:"test",direction:"W"}],
  windows:[{id:"win1",roomId:"test",size:"MEDIUM",direction:"S",glazingOverride:null}],
};

// T1: balance point should be in a reasonable range
{const r=calculateBalancePoint(BASE);console.log("T1:",r.balancePoint,"°F",Math.abs(r.balancePoint-41)<8?"✅":"❌");}

// T2: top floor adds ceiling UA, which raises UA_total and therefore RAISES the balance point
// (more heat loss path = outdoor air helps less = higher threshold before opening helps)
{const r1=calculateBalancePoint(BASE);const r2=calculateBalancePoint({...BASE,isTopFloor:true});console.log("T2 top floor raises BP (more ceiling UA):",r2.balancePoint>r1.balancePoint?"✅":"❌");}

// T3: tighter insulation (lower UA) means lower BP — outdoor needs to be colder to help
{const r1=calculateBalancePoint({...BASE,insulationLevel:"AT_CODE"});const r2=calculateBalancePoint({...BASE,insulationLevel:"ABOVE_CODE"});console.log("T3 better insulation lowers BP:",r2.balancePoint<r1.balancePoint?"✅":"❌");}

// T4: dark roof lowers per-slot BP at noon on a sunny day (solar gain increases Q_internal)
import { balancePointForSlot } from "./balance-point";
{const lightRoof=calculateBalancePoint({...BASE,isTopFloor:true,roofColor:"LIGHT"});
 const darkSlot=balancePointForSlot({...BASE,isTopFloor:true,roofColor:"DARK"} as RoomFull,0,12,0,0.05); // noon, low rain
 const lightSlot=balancePointForSlot({...BASE,isTopFloor:true,roofColor:"LIGHT"} as RoomFull,0,12,0,0.05);
 console.log("T4 dark roof lowers slot BP vs light at noon:",darkSlot<lightSlot?"✅":"❌");}
