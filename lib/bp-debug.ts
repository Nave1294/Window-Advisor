import { calculateBalancePoint } from "./balance-point";
import type { RoomFull } from "./schema";

const room: RoomFull = {
  id:"lair", createdAt:"", updatedAt:"", userId:"u1",
  name:"The Lair",
  floorNumber:3, isTopFloor:true,
  lengthFt:16, widthFt:13, ceilingHeightFt:12,
  orientation:"NS", insulationLevel:"AT_CODE",
  glazingType:"DOUBLE", hasCrossBreeze:false,
  occupancyLevel:"ONE_TWO", unoccupiedBlocks:"[]",
  heatSourceLevel:"HOME_OFFICE",
  minTempF:68, maxTempF:74, minHumidity:40, maxHumidity:55,
  balancePoint:null, comfortBias:0,
  notificationsEnabled:false, lastNotifiedOpen:null, lastNotifiedClose:null,
  wallColor:"MEDIUM", roofColor:"MEDIUM", roofType:"ATTIC_BUFFERED",
  exteriorWalls:[
    {id:"w1", roomId:"lair", direction:"N"},
    {id:"w2", roomId:"lair", direction:"W"},
  ],
  windows:[
    {id:"win1", roomId:"lair", size:"LARGE",  direction:"N", glazingOverride:null},
    {id:"win2", roomId:"lair", size:"MEDIUM", direction:"W", glazingOverride:null},
  ],
};

const r = calculateBalancePoint(room);
console.log(`Balance point: ${r.balancePoint}°F`);
console.log(`Q_internal:    ${r.qInternal} BTU/hr  (${(r.qInternal/r.floorArea).toFixed(2)} BTU/hr·ft²)`);
console.log(`UA walls:      ${r.uaWalls}`);
console.log(`UA windows:    ${r.uaWindows}`);
console.log(`UA ceiling:    ${r.uaCeiling}`);
console.log(`UA infiltration: ${r.uaInfiltration}`);
console.log(`UA total:      ${r.uaTotal}`);
console.log(`Floor area:    ${r.floorArea} ft²`);
console.log(`Volume:        ${r.volume} ft³`);
