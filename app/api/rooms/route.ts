export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, rooms, windows, exteriorWalls } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required." }, { status: 400 });

  const user = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (!user)  return NextResponse.json({ rooms: [] });

  const userRooms = await db.select().from(rooms).where(eq(rooms.userId, user.id));

  const roomsWithRelations = await Promise.all(
    userRooms.map(async room => {
      const [roomWindows, roomWalls] = await Promise.all([
        db.select().from(windows).where(eq(windows.roomId, room.id)),
        db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, room.id)),
      ]);
      return { ...room, windows: roomWindows, exteriorWalls: roomWalls };
    })
  );

  return NextResponse.json({ rooms: roomsWithRelations });
}
