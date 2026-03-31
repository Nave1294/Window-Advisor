export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, windows, exteriorWalls, recommendations, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { fetchForecast } from "@/lib/weather";
import { generateRecommendation } from "@/lib/recommendation";
import { generateAiringRecommendations } from "@/lib/airing";
import type { RoomFull } from "@/lib/schema";

function todayDateStr() { return new Date().toISOString().slice(0, 10); }

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const room = (await db.select().from(rooms).where(eq(rooms.id, id)))[0];
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const user = (await db.select().from(users).where(eq(users.id, room.userId)))[0];
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [roomWindows, roomWalls] = await Promise.all([
    db.select().from(windows).where(eq(windows.roomId, id)),
    db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, id)),
  ]);

  const roomFull: RoomFull = { ...room, windows: roomWindows, exteriorWalls: roomWalls };

  let forecast;
  try { forecast = await fetchForecast(user.zipCode); }
  catch (err) {
    return NextResponse.json({ error: `Weather fetch failed: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
  if (!forecast.days.length)
    return NextResponse.json({ error: "No forecast data available." }, { status: 502 });

  const bias      = Math.max(-5, Math.min(5, room.comfortBias ?? 0));
  const rawBP     = room.balancePoint ?? room.maxTempF - 20;
  const balancePt = Math.round((rawBP - bias) * 10) / 10;

  const result = generateRecommendation(roomFull, forecast.days);
  const airing = generateAiringRecommendations(room, forecast.days, balancePt);

  // Calculate today's BP range from all forecast slots
  const { balancePointForSlot } = await import("@/lib/balance-point");
  const todaySlots = forecast.days[0]?.slots ?? [];
  const todayBPs   = todaySlots.map(slot => {
    const dow = new Date(slot.ts * 1000).getUTCDay();
    return balancePointForSlot(roomFull, dow, slot.hour, bias);
  }).filter(bp => bp > 0);
  const bpMin = todayBPs.length ? Math.min(...todayBPs) : balancePt;
  const bpMax = todayBPs.length ? Math.max(...todayBPs) : balancePt;
  const bpRange = Math.abs(bpMax - bpMin) < 1
    ? { min: balancePt, max: balancePt, label: `${balancePt.toFixed(1)}°F` }
    : { min: Math.round(bpMin * 10)/10, max: Math.round(bpMax * 10)/10, label: `${Math.round(bpMin)}–${Math.round(bpMax)}°F today` };

  const today   = todayDateStr();
  const existing = await db.select().from(recommendations).where(eq(recommendations.roomId, id)).all();
  const todayRec = existing.find(r => r.date === today);

  const recData = {
    roomId:        id,
    date:          today,
    shouldOpen:    result.shouldOpen,
    openPeriods:   JSON.stringify(result.openPeriods),
    airingWindows: JSON.stringify(airing.windows),
    bpRange:       JSON.stringify(bpRange),
    reasoning:     result.reasoning,
    // Store forecast context so GET cache can return it
    forecastMeta:  JSON.stringify({
      cityName: forecast.cityName,
      highF:    forecast.days[0]?.highF ?? null,
      lowF:     forecast.days[0]?.lowF  ?? null,
    }),
  };

  let rec;
  if (todayRec) {
    const [updated] = await db.update(recommendations).set(recData).where(eq(recommendations.id, todayRec.id)).returning();
    rec = updated;
  } else {
    const [inserted] = await db.insert(recommendations).values(recData).returning();
    rec = inserted;
  }

  return NextResponse.json({
    ok: true,
    recommendation: {
      ...rec,
      openPeriods:   result.openPeriods,
      airingWindows: airing.windows,
    },
    airing: { ...airing, intervalMins: airing.intervalMins, summary: airing.summary, needsAiring: airing.needsAiring },
    bpRange,
    forecast: {
      cityName: forecast.cityName,
      date:     today,
      days:     forecast.days.map(d => ({ date: d.date, highF: d.highF, lowF: d.lowF })),
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id }   = await params;
  const today    = todayDateStr();
  const existing = await db.select().from(recommendations).where(eq(recommendations.roomId, id)).all();
  const todayRec = existing.find(r => r.date === today);
  if (!todayRec) return NextResponse.json({ recommendation: null });

  const openPeriods   = todayRec.openPeriods   ? JSON.parse(todayRec.openPeriods)   : [];
  const airingWindows = todayRec.airingWindows  ? JSON.parse(todayRec.airingWindows) : null;
  const bpRange       = todayRec.bpRange        ? JSON.parse(todayRec.bpRange)       : null;
  const forecastMeta  = todayRec.forecastMeta   ? JSON.parse(todayRec.forecastMeta)  : null;

  return NextResponse.json({
    recommendation: { ...todayRec, openPeriods, airingWindows },
    airing: airingWindows ? { needsAiring:true, windows:airingWindows, intervalMins:0, summary:"" } : null,
    bpRange,
    forecast: forecastMeta ? {
      cityName: forecastMeta.cityName,
      days: [{ date: today, highF: forecastMeta.highF, lowF: forecastMeta.lowF }],
    } : null,
  });
}
