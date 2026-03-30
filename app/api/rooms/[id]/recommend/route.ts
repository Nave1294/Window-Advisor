export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/[id]/recommend
 *
 * Generates (or refreshes) today's recommendation for a room.
 * Fetches live weather, runs the engine, persists the result.
 * Called by the daily cron job and on-demand from the dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, windows, exteriorWalls, recommendations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { fetchForecast } from "@/lib/weather";
import { generateRecommendation } from "@/lib/recommendation";
import { users } from "@/lib/schema";
import type { RoomFull } from "@/lib/schema";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Load room with relations
  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const user = (await db.select().from(users).where(eq(users.id, room.userId)))[0];
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [roomWindows, roomWalls] = await Promise.all([
    db.select().from(windows).where(eq(windows.roomId, id)),
    db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, id)),
  ]);

  const roomFull: RoomFull = { ...room, windows: roomWindows, exteriorWalls: roomWalls };

  // Fetch forecast
  let forecast;
  try {
    forecast = await fetchForecast(user.zipCode);
  } catch (err) {
    return NextResponse.json(
      { error: `Weather fetch failed: ${err instanceof Error ? err.message : err}` },
      { status: 502 }
    );
  }

  const today = todayDateStr();
  const dayForecast = forecast.days.find(d => d.date === today) ?? forecast.days[0];
  if (!dayForecast) return NextResponse.json({ error: "No forecast data available." }, { status: 502 });

  // Run recommendation engine
  const result = generateRecommendation(roomFull, dayForecast);

  // Persist — upsert on (roomId, date)
  const existing = await db.select()
    .from(recommendations)
    .where(eq(recommendations.roomId, id))
    .all();
  const todayRec = existing.find(r => r.date === today);

  const recData = {
    roomId:      id,
    date:        today,
    shouldOpen:  result.shouldOpen,
    openPeriods: JSON.stringify(result.openPeriods),
    reasoning:   result.reasoning,
  };

  let rec;
  if (todayRec) {
    const [updated] = await db.update(recommendations)
      .set(recData)
      .where(eq(recommendations.id, todayRec.id))
      .returning();
    rec = updated;
  } else {
    const [inserted] = await db.insert(recommendations)
      .values(recData)
      .returning();
    rec = inserted;
  }

  return NextResponse.json({
    ok: true,
    recommendation: rec,
    slotScores: result.slotScores,
    forecast: {
      cityName:  forecast.cityName,
      date:      today,
      highF:     dayForecast.highF,
      lowF:      dayForecast.lowF,
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const today   = todayDateStr();

  const existing = await db.select()
    .from(recommendations)
    .where(eq(recommendations.roomId, id))
    .all();

  const todayRec = existing.find(r => r.date === today);
  if (!todayRec) return NextResponse.json({ recommendation: null });

  return NextResponse.json({
    recommendation: {
      ...todayRec,
      openPeriods: todayRec.openPeriods ? JSON.parse(todayRec.openPeriods) : [],
    },
  });
}
