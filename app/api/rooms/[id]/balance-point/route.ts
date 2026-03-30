/**
 * POST /api/rooms/[id]/balance-point
 *
 * (Re)calculates the balance point for a room and persists it.
 * Called automatically after setup and whenever room config changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, windows, exteriorWalls } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { calculateBalancePoint } from "@/lib/balance-point";
import type { RoomFull } from "@/lib/schema";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const [roomWindows, roomWalls] = await Promise.all([
    db.select().from(windows).where(eq(windows.roomId, id)),
    db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, id)),
  ]);

  const roomFull: RoomFull = {
    ...room,
    windows:       roomWindows,
    exteriorWalls: roomWalls,
  };

  const result = calculateBalancePoint(roomFull);

  await db.update(rooms)
    .set({ balancePoint: result.balancePoint })
    .where(eq(rooms.id, id));

  return NextResponse.json({ ok: true, ...result });
}
