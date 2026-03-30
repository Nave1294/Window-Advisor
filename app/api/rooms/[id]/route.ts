export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, windows, exteriorWalls, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type { InsulationLevel, Direction, WindowSize, GlazingType, Orientation, OccupancyLevel, HeatSourceLevel } from "@/lib/schema";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error:"Room not found." }, { status:404 });
  await db.delete(rooms).where(eq(rooms.id, id));
  return NextResponse.json({ ok:true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error:"Room not found." }, { status:404 });

  let body: {
    roomName:string; floorNumber:number; isTopFloor:boolean;
    lengthFt:number; widthFt:number; ceilingHeightFt:number;
    orientation:Orientation; insulationLevel:InsulationLevel;
    glazingType:GlazingType; hasCrossBreeze:boolean;
    occupancyLevel:OccupancyLevel;
    unoccupiedBlocks:unknown[];
    heatSourceLevel:HeatSourceLevel;
    windows:{size:WindowSize;direction:Direction;glazingOverride?:GlazingType}[];
    exteriorWalls:Direction[];
    minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error:"Invalid JSON." }, { status:400 }); }

  await db.update(rooms).set({
    name:            body.roomName.trim(),
    floorNumber:     body.floorNumber,
    isTopFloor:      body.isTopFloor,
    lengthFt:        body.lengthFt,
    widthFt:         body.widthFt,
    ceilingHeightFt: body.ceilingHeightFt,
    orientation:     body.orientation,
    insulationLevel: body.insulationLevel,
    glazingType:     body.glazingType,
    hasCrossBreeze:  body.hasCrossBreeze,
    occupancyLevel:  body.occupancyLevel,
    unoccupiedBlocks:JSON.stringify(body.unoccupiedBlocks ?? []),
    heatSourceLevel: body.heatSourceLevel,
    minTempF:        body.minTempF,
    maxTempF:        body.maxTempF,
    minHumidity:     body.minHumidity,
    maxHumidity:     body.maxHumidity,
    balancePoint:    null,
    updatedAt:       new Date().toISOString(),
  }).where(eq(rooms.id, id));

  await db.delete(windows).where(eq(windows.roomId, id));
  await db.delete(exteriorWalls).where(eq(exteriorWalls.roomId, id));

  if (body.windows.length)
    await db.insert(windows).values(body.windows.map(w=>({ roomId:id, size:w.size, direction:w.direction, glazingOverride:w.glazingOverride??null })));
  if (body.exteriorWalls.length)
    await db.insert(exteriorWalls).values(body.exteriorWalls.map(dir=>({ roomId:id, direction:dir })));

  const origin = req.nextUrl.origin; void origin; // unused now

  // Recalculate balance point directly — no HTTP self-call
  void (async () => {
    try {
      const { calculateBalancePoint } = await import("@/lib/balance-point");
      const updatedRoom = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
      const roomWindows = await db.select().from(windows).where(eq(windows.roomId, id));
      const roomWalls   = await db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, id));
      const bp = calculateBalancePoint({ ...updatedRoom, windows: roomWindows, exteriorWalls: roomWalls });
      await db.update(rooms).set({ balancePoint: bp.balancePoint }).where(eq(rooms.id, id));
      console.log(`[edit] Balance point updated: ${bp.balancePoint}°F`);
    } catch (err) {
      console.error("[edit] Balance point recalculation failed:", err);
    }
  })();

  return NextResponse.json({ ok:true, roomId:id });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error:"Room not found." }, { status:404 });

  const user = (await db.select().from(users).where(eq(users.id, room.userId)))[0];
  const [roomWindows, roomWalls] = await Promise.all([
    db.select().from(windows).where(eq(windows.roomId, id)),
    db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, id)),
  ]);

  return NextResponse.json({
    room: {
      ...room,
      unoccupiedBlocks: JSON.parse(room.unoccupiedBlocks || "[]"),
      windows: roomWindows,
      exteriorWalls: roomWalls,
    },
    userEmail: user?.email ?? "",
  });
}
