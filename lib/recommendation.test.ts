import { generateRecommendation } from "./recommendation";
import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

const BASE_TS = new Date("2025-06-16T06:00:00Z").getTime()/1000;

function makeRoom(overrides: Partial<Room & { exteriorWalls: { direction: string }[] }> = {}) {
  return {
    id:"r1",createdAt:"",updatedAt:"",userId:"u1",name:"Test Room",
    floorNumber:1,isTopFloor:false,
    lengthFt:12,widthFt:12,ceilingHeightFt:8,orientation:"NS" as const,
    insulationLevel:"AT_CODE" as const,glazingType:"DOUBLE" as const,hasCrossBreeze:false,
    occupancyLevel:"ONE_TWO" as const, unoccupiedBlocks:"[]",
    heatSourceLevel:"LIGHT_ELECTRONICS" as const,
    minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
    balancePoint:41,comfortBias:0,
    notificationsEnabled:false,lastNotifiedOpen:null,lastNotifiedClose:null,wallColor:"MEDIUM" as const,roofColor:"MEDIUM" as const,roofType:"ATTIC_BUFFERED" as const,
    exteriorWalls:[{direction:"S"}],
    ...overrides,
  };
}

function slot(offsetH:number,ov:Partial<HourlySlot>={}):HourlySlot {
  const ts=BASE_TS+offsetH*3600;const hour=new Date(ts*1000).getUTCHours();
  return {hour,ts,tempF:62,humidity:48,dewPointF:52,precipProb:0.05,windSpeedMph:5,windDeg:180,description:"clear",icon:"01d",...ov};
}

function day(date:string,slots:HourlySlot[]):DayForecast {
  const t=slots.map(s=>s.tempF);
  return {date,slots,highF:Math.max(...t),lowF:Math.min(...t),maxHumidity:50,maxPrecipProb:0.05,maxWindMph:5};
}

{const r=makeRoom();const d=day("2025-06-16",[slot(0,{tempF:58}),slot(3,{tempF:62}),slot(6,{tempF:80}),slot(9,{tempF:85})]);const res=generateRecommendation(r,[d]);console.log("T1 morning open:",res.shouldOpen&&res.openPeriods.length>=1?"✅":"❌");}
{const r=makeRoom();const d=day("2025-06-16",[slot(0,{precipProb:0.8}),slot(3,{precipProb:0.7}),slot(6,{precipProb:0.9})]);const res=generateRecommendation(r,[d]);console.log("T2 rain→closed:",!res.shouldOpen?"✅":"❌");}
{const d1=day("2025-06-16",[slot(0,{tempF:58}),slot(3,{tempF:60}),slot(6,{tempF:62}),slot(9,{tempF:63})]);
 const d2=day("2025-06-17",[slot(24,{tempF:61}),slot(27,{tempF:59}),slot(30,{tempF:82})]);
 const res=generateRecommendation(makeRoom(),[d1,d2]);
 console.log("T3 multi-day:",res.openPeriods.some(p=>p.multiDay)?"✅":"❌");}
