export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }     = await params;
  const { enabled } = await req.json();
  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  await db.update(rooms).set({ notificationsEnabled: !!enabled }).where(eq(rooms.id, id));
  return NextResponse.json({ ok: true, notificationsEnabled: !!enabled });
}
