import { calculateBalancePoint, balancePointForSlot } from "./balance-point";
import type { RoomFull } from "./schema";

const BASE: RoomFull = {
  id:"test",createdAt:"",updatedAt:"",userId:"u1",name:"Test Room",
  floorNumber:1,isTopFloor:false,
  lengthFt:12.5,widthFt:12,ceilingHeightFt:8,orientation:"NS",
  insulationLevel:"AT_CODE",glazingType:"DOUBLE",hasCrossBreeze:false,
  occupancyLevel:"ONE_TWO",unoccupiedBlocks:"[]",
  heatSourceLevel:"LIGHT_ELECTRONICS",
  minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
  balancePoint:null,comfortBias:0,
  notificationsEnabled:false,lastNotifiedOpen:null,lastNotifiedClose:null,
  wallColor:"MEDIUM",roofColor:"MEDIUM",roofType:"ATTIC_BUFFERED",
  exteriorWalls:[{id:"w1",roomId:"test",direction:"S"},{id:"w2",roomId:"test",direction:"W"}],
  windows:[{id:"win1",roomId:"test",size:"MEDIUM",direction:"S",glazingOverride:null}],
};

// T1: balance point in reasonable range for a lightly-occupied room
{const r=calculateBalancePoint(BASE);console.log("T1:",r.balancePoint,"°F",r.balancePoint>45&&r.balancePoint<65?"✅":"❌ expected 45-65");}

// T2: better insulation → lower UA → lower balance point (outdoor needs to be colder to help)
{const r1=calculateBalancePoint({...BASE,insulationLevel:"AT_CODE"});
 const r2=calculateBalancePoint({...BASE,insulationLevel:"ABOVE_CODE"});
 console.log("T2 better insulation lowers BP:",r2.balancePoint<r1.balancePoint?"✅":"❌");}

// T3: top floor adds ceiling UA → raises balance point
{const r1=calculateBalancePoint(BASE);
 const r2=calculateBalancePoint({...BASE,isTopFloor:true});
 console.log("T3 top floor raises BP:",r2.balancePoint>r1.balancePoint?"✅":"❌");}

// T4: dark roof at noon lowers slot BP vs light roof (more solar gain)
{const light=balancePointForSlot({...BASE,isTopFloor:true,roofColor:"LIGHT"} as RoomFull,0,12,0,0.05);
 const dark=balancePointForSlot({...BASE,isTopFloor:true,roofColor:"DARK"} as RoomFull,0,12,0,0.05);
 console.log("T4 dark roof lowers slot BP:",dark<light?"✅":"❌");}

// T5: larger room with same people → higher balance point (people heat diluted over more area)
{const small=calculateBalancePoint({...BASE,lengthFt:10,widthFt:10});
 const large=calculateBalancePoint({...BASE,lengthFt:20,widthFt:20});
 console.log("T5 larger room higher BP (people heat diluted):",large.balancePoint>small.balancePoint?"✅":"❌");}
