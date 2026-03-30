import { generateAiringRecommendations } from "./airing";
import type { Room } from "./schema";
import type { DayForecast, HourlySlot } from "./weather";

const BASE_TS = new Date("2025-06-16T09:00:00Z").getTime()/1000;

function makeRoom(overrides: Partial<Room>={}): Room {
  return {
    id:"r1",createdAt:"",updatedAt:"",userId:"u1",name:"Room",
    floorNumber:1,isTopFloor:false,
    lengthFt:15,widthFt:12,ceilingHeightFt:8,
    orientation:"NS",insulationLevel:"AT_CODE",glazingType:"DOUBLE",hasCrossBreeze:false,
    occupancyLevel:"ONE_TWO",
    unoccupiedBlocks:JSON.stringify([{id:"n",startHour:22,endHour:24,days:[0,1,2,3,4,5,6]},{id:"m",startHour:0,endHour:7,days:[0,1,2,3,4,5,6]}]),
    heatSourceLevel:"LIGHT_ELECTRONICS",
    minTempF:68,maxTempF:74,minHumidity:40,maxHumidity:55,
    balancePoint:41,comfortBias:0,
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

{const sm=makeRoom({lengthFt:10,widthFt:10,ceilingHeightFt:8});const lg=makeRoom({lengthFt:20,widthFt:20,ceilingHeightFt:9});const d=day("2025-06-16",[slot(0),slot(3),slot(6)]);const rS=generateAiringRecommendations(sm,[d],41);const rL=generateAiringRecommendations(lg,[d],41);console.log("T1 interval scales:",rL.intervalMins>rS.intervalMins?"✅":"❌","(sm:",rS.intervalMins,"lg:",rL.intervalMins,")");}
{const r=makeRoom({unoccupiedBlocks:"[]",occupancyLevel:"EMPTY"});const d=day("2025-06-16",[slot(0)]);const res=generateAiringRecommendations(r,[d],41);console.log("T2 empty→no airing:",!res.needsAiring?"✅":"❌");}
{const r=makeRoom();const d=day("2025-06-16",[slot(0,{precipProb:0.9}),slot(3,{precipProb:0.8}),slot(6,{precipProb:0.7})]);const res=generateAiringRecommendations(r,[d],41);console.log("T3 rain→no windows:",res.windows.length===0?"✅":"❌");}
{const r=makeRoom();const d=day("2025-06-16",[slot(0),slot(3),slot(6)]);const res=generateAiringRecommendations(r,[d],41);const allInWaking=res.windows.every(w=>w.hour>=7&&w.hour<22);console.log("T4 waking+occupied only:",allInWaking?"✅":"❌",res.windows.map(w=>`h${w.hour}`));}
