import { generateAiringRecommendations } from "./airing";
import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

const BASE_TS = new Date("2025-06-16T09:00:00Z").getTime()/1000;

function makeRoom(overrides: Partial<Room>={}): Room {
  return {
    id:"r1",createdAt:"",updatedAt:"",userId:"u1",name:"Living Room",
    floorNumber:1,isTopFloor:false,
    lengthFt:15,widthFt:12,ceilingHeightFt:8,
    orientation:"NS",insulationLevel:"AT_CODE",glazingType:"DOUBLE",hasCrossBreeze:false,
    occupancyLevel:"ONE_TWO",unoccupiedBlocks:"[]",
    heatSourceLevel:"LIGHT_ELECTRONICS",
    minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
    balancePoint:41,comfortBias:0,
    notificationsEnabled:false,lastNotifiedOpen:null,lastNotifiedClose:null,
    wallColor:"MEDIUM" as const,roofColor:"MEDIUM" as const,roofType:"ATTIC_BUFFERED" as const,
    ...overrides,
  };
}

function slot(offsetH:number,ov:Partial<HourlySlot>={}):HourlySlot {
  const ts=BASE_TS+offsetH*3600;const hour=new Date(ts*1000).getUTCHours();
  return {hour,ts,tempF:62,humidity:48,dewPointF:50,precipProb:0.05,windSpeedMph:5,windDeg:180,description:"clear",icon:"01d",...ov};
}

function day(date:string,slots:HourlySlot[]):DayForecast {
  const t=slots.map(s=>s.tempF);
  return {date,slots,highF:Math.max(...t),lowF:Math.min(...t),maxHumidity:50,maxPrecipProb:0.05,maxWindMph:5};
}

// T1: larger room → longer interval (same people, more air)
{const sm=makeRoom({lengthFt:10,widthFt:10});const lg=makeRoom({lengthFt:20,widthFt:20});
 const d=day("2025-06-16",[slot(0),slot(3),slot(6)]);
 const rS=generateAiringRecommendations(sm,[d],41);
 const rL=generateAiringRecommendations(lg,[d],41);
 console.log("T1 larger room longer interval:",rL.intervalMins>rS.intervalMins?"✅":"❌");}

// T2: empty room → no airing windows
{const r=makeRoom({occupancyLevel:"EMPTY"});const d=day("2025-06-16",[slot(0)]);
 const res=generateAiringRecommendations(r,[d],41);
 console.log("T2 empty→no airing:",!res.needsAiring?"✅":"❌");}

// T3: rainy slots → marked high disruption (still included as least-bad)
{const r=makeRoom();const d=day("2025-06-16",[slot(0,{precipProb:0.9}),slot(3,{precipProb:0.8}),slot(6,{precipProb:0.7})]);
 const res=generateAiringRecommendations(r,[d],41);
 console.log("T3 rain→high disruption:",res.windows.every(w=>w.disruption==="high")?"✅":"❌");}

// T4: more people → shorter interval
{const few=makeRoom({occupancyLevel:"ONE_TWO"});
 const many=makeRoom({occupancyLevel:"THREE_FOUR"});
 const d=day("2025-06-16",[slot(0),slot(3),slot(6)]);
 const rF=generateAiringRecommendations(few,[d],41);
 const rM=generateAiringRecommendations(many,[d],41);
 console.log("T4 more people → shorter interval:",rM.intervalMins<rF.intervalMins?"✅":"❌");}
