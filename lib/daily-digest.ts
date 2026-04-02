import { todayEastern } from "./utils";
import { db } from "./db";
import { users, rooms, windows, exteriorWalls, recommendations } from "./schema";
import { eq } from "drizzle-orm";
import { fetchForecast } from "./weather";
import { generateRecommendation } from "./recommendation";
import { generateAiringRecommendations } from "./airing";
import { sendDailyEmail, type RoomDigest } from "./email";
import type { RoomFull } from "./schema";

export interface DigestResult {
  usersProcessed: number; roomsProcessed: number; emailsSent: number;
  errors: { userId: string; email: string; error: string }[];
}

export async function runDailyDigest(): Promise<DigestResult> {
  const today    = todayEastern();
  const allUsers = await db.select().from(users);
  let roomsProcessed = 0, emailsSent = 0;
  const errors: DigestResult["errors"] = [];

  for (const user of allUsers) {
    try {
      const userRooms = await db.select().from(rooms).where(eq(rooms.userId, user.id));
      if (!userRooms.length) continue;

      let forecast;
      try { forecast = await fetchForecast(user.zipCode); }
      catch (err) { errors.push({ userId: user.id, email: user.email, error: `Weather: ${err}` }); continue; }
      if (!forecast.days.length) { errors.push({ userId: user.id, email: user.email, error: "No forecast." }); continue; }

      const digests: RoomDigest[] = [];
      const recIds:  string[]     = [];

      for (const room of userRooms) {
        const [roomWindows, roomWalls] = await Promise.all([
          db.select().from(windows).where(eq(windows.roomId, room.id)),
          db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, room.id)),
        ]);
        const roomFull: RoomFull = { ...room, windows: roomWindows, exteriorWalls: roomWalls };

        const bias      = Math.max(-5, Math.min(5, room.comfortBias ?? 0));
        const rawBP     = room.balancePoint ?? room.maxTempF - 20;
        const balancePt = Math.round((rawBP - bias) * 10) / 10;

        const result = generateRecommendation(roomFull, forecast.days);
        const airing = generateAiringRecommendations(room, forecast.days, balancePt);

        const existingRecs = await db.select().from(recommendations).where(eq(recommendations.roomId, room.id)).all();
        const todayRec     = existingRecs.find(r => r.date === today);
        const recData      = {
          roomId:      room.id, date: today,
          shouldOpen:  result.shouldOpen,
          openPeriods: JSON.stringify(result.openPeriods),
          reasoning:   result.reasoning,
        };

        let recId: string;
        if (todayRec) {
          await db.update(recommendations).set(recData).where(eq(recommendations.id, todayRec.id));
          recId = todayRec.id;
        } else {
          const [ins] = await db.insert(recommendations).values(recData).returning();
          recId = ins.id;
        }
        recIds.push(recId);

        digests.push({
          roomId:       room.id,
          roomName:     room.name,
          floorNumber:  room.floorNumber,
          balancePoint: room.balancePoint,
          comfortBias:  room.comfortBias ?? 0,
          shouldOpen:   result.shouldOpen,
          openPeriods:  result.openPeriods,
          reasoning:    result.reasoning,
          highF:        forecast.days[0].highF,
          lowF:         forecast.days[0].lowF,
          cityName:     forecast.cityName,
          airing,
        });
        roomsProcessed++;
      }

      const sendResult = await sendDailyEmail({ to: user.email, date: today, rooms: digests });
      if (sendResult.ok) {
        for (const recId of recIds)
          await db.update(recommendations).set({ emailSent: true, emailSentAt: new Date().toISOString() }).where(eq(recommendations.id, recId));
        emailsSent++;
      } else {
        errors.push({ userId: user.id, email: user.email, error: sendResult.error ?? "Send failed." });
      }
    } catch (err) {
      errors.push({ userId: user.id, email: user.email, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { usersProcessed: allUsers.length, roomsProcessed, emailsSent, errors };
}
