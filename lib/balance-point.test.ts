import { calculateBalancePoint } from "./balance-point";
import type { RoomFull } from "./schema";

const BASE: RoomFull = {
  id:"test",createdAt:"",updatedAt:"",userId:"u1",name:"Test",
  floorNumber:1,isTopFloor:false,
  lengthFt:12.5,widthFt:12,ceilingHeightFt:8,orientation:"NS",
  insulationLevel:"AT_CODE",glazingType:"DOUBLE",hasCrossBreeze:false,
  occupancyLevel:"ONE_TWO",
  unoccupiedBlocks:"[]",
  heatSourceLevel:"LIGHT_ELECTRONICS",
  minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
  balancePoint:null,comfortBias:0,
  exteriorWalls:[{id:"w1",roomId:"test",direction:"S"},{id:"w2",roomId:"test",direction:"W"}],
  windows:[{id:"win1",roomId:"test",size:"MEDIUM",direction:"S",glazingOverride:null}],
};

{const r=calculateBalancePoint(BASE);console.log("T1:",r.balancePoint,"°F",Math.abs(r.balancePoint-40.9)<2?"✅":"❌");}
{const r=calculateBalancePoint({...BASE,floorNumber:3,isTopFloor:true});const r1=calculateBalancePoint(BASE);console.log("T2: top floor lower BP:",r.balancePoint<r1.balancePoint?"✅":"❌");}
{const r1=calculateBalancePoint({...BASE,insulationLevel:"AT_CODE"});const r2=calculateBalancePoint({...BASE,insulationLevel:"ABOVE_CODE"});console.log("T3: tighter insulation lower BP:",r2.balancePoint<r1.balancePoint?"✅":"❌");}
{
  const always:RoomFull={...BASE,unoccupiedBlocks:"[]"};
  const never:RoomFull={...BASE,unoccupiedBlocks:JSON.stringify([{id:"x",startHour:0,endHour:24,days:[0,1,2,3,4,5,6]}])};
  const rA=calculateBalancePoint(always);const rN=calculateBalancePoint(never);
  console.log("T4: unoccupied lowers Q:",rA.qInternal>rN.qInternal?"✅":"❌","(always:",rA.qInternal,"never:",rN.qInternal,")");
}
