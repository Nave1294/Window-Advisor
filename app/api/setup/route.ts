export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, rooms, windows, exteriorWalls } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type { InsulationLevel, Direction, WindowSize, GlazingType, Orientation, OccupancyLevel, HeatSourceLevel, UnoccupiedBlock, RoomFull } from "@/lib/schema";

interface SetupPayload {
  email:string; zipCode:string; roomName:string;
  floorNumber:number; isTopFloor:boolean;
  lengthFt:number; widthFt:number; ceilingHeightFt:number;
  orientation:Orientation; insulationLevel:InsulationLevel;
  glazingType:GlazingType; hasCrossBreeze:boolean;
  occupancyLevel:OccupancyLevel; unoccupiedBlocks:UnoccupiedBlock[];
  heatSourceLevel:HeatSourceLevel;
  windows:{size:WindowSize;direction:Direction;glazingOverride?:GlazingType}[];
  exteriorWalls:Direction[];
  minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number;
}

export async function POST(req: NextRequest) {
  let body: SetupPayload;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error:"Invalid JSON." }, { status:400 }); }

  const {
    email, zipCode, roomName, floorNumber, isTopFloor,
    lengthFt, widthFt, ceilingHeightFt,
    orientation, insulationLevel, glazingType, hasCrossBreeze,
    occupancyLevel, unoccupiedBlocks, heatSourceLevel,
    windows: windowList, exteriorWalls: wallList,
    minTempF, maxTempF, minHumidity, maxHumidity,
  } = body;

  if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
    return NextResponse.json({ error:"Invalid email." }, { status:422 });
  if (!zipCode?.match(/^\d{5}$/))
    return NextResponse.json({ error:"Invalid ZIP." }, { status:422 });
  if (!roomName?.trim())
    return NextResponse.json({ error:"Room name required." }, { status:422 });
  if (!windowList?.length)
    return NextResponse.json({ error:"At least one window required." }, { status:422 });
  if (!wallList?.length)
    return NextResponse.json({ error:"At least one exterior wall required." }, { status:422 });
  if (minTempF >= maxTempF || minHumidity >= maxHumidity)
    return NextResponse.json({ error:"Invalid comfort range." }, { status:422 });

  try {
    // Upsert user
    let user = (await db.select().from(users).where(eq(users.email, email)))[0];
    if (user) {
      await db.update(users).set({ zipCode }).where(eq(users.id, user.id));
    } else {
      const [created] = await db.insert(users).values({ email, zipCode }).returning();
      user = created;
    }

    // Create room
    const [room] = await db.insert(rooms).values({
      userId:user.id, name:roomName.trim(),
      floorNumber:floorNumber??1, isTopFloor:isTopFloor??false,
      lengthFt, widthFt, ceilingHeightFt,
      orientation:orientation??"NS", insulationLevel,
      glazingType:glazingType??"DOUBLE", hasCrossBreeze,
      occupancyLevel:occupancyLevel??"ONE_TWO",
      unoccupiedBlocks:JSON.stringify(unoccupiedBlocks??[]),
      heatSourceLevel:heatSourceLevel??"LIGHT_ELECTRONICS",
      minTempF, maxTempF, minHumidity, maxHumidity,
      balancePoint:null, comfortBias:0,
    }).returning();

    // Insert windows and walls
    await db.insert(windows).values(
      windowList.map(w => ({ roomId:room.id, size:w.size, direction:w.direction, glazingOverride:w.glazingOverride??null }))
    );
    await db.insert(exteriorWalls).values(
      wallList.map(dir => ({ roomId:room.id, direction:dir }))
    );

    // Fire-and-forget background tasks — call functions directly, no HTTP
    void (async () => {
      try {
        // 1. Calculate and persist balance point
        const { calculateBalancePoint } = await import("@/lib/balance-point");
        const roomWindows = await db.select().from(windows).where(eq(windows.roomId, room.id));
        const roomWalls   = await db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, room.id));
        const roomFull: RoomFull = { ...room, windows: roomWindows, exteriorWalls: roomWalls };
        const bp = calculateBalancePoint(roomFull);
        await db.update(rooms).set({ balancePoint: bp.balancePoint }).where(eq(rooms.id, room.id));
        console.log(`[setup] Balance point calculated: ${bp.balancePoint}°F for room ${room.id}`);

        // 2. Send confirmation email with the now-calculated balance point
        const { sendConfirmationEmail } = await import("@/lib/email");
        let cityName = "";
        try {
          const { resolveZip } = await import("@/lib/weather");
          cityName = (await resolveZip(zipCode)).city;
        } catch { /* optional */ }

        const result = await sendConfirmationEmail({
          to: email, roomName: roomName.trim(), floorNumber: floorNumber??1,
          balancePoint: bp.balancePoint,
          minTempF, maxTempF, minHumidity, maxHumidity, cityName,
        });

        if (result.ok) console.log(`[setup] Confirmation email sent to ${email}, id=${result.emailId}`);
        else           console.error(`[setup] Confirmation email failed:`, result.error);

      } catch (err) {
        console.error("[setup] Background tasks failed:", err);
      }
    })();

    return NextResponse.json({ ok:true, userId:user.id, roomId:room.id });

  } catch (err) {
    console.error("[setup] Database error:", err);
    return NextResponse.json({ error:"Database error." }, { status:500 });
  }
}
