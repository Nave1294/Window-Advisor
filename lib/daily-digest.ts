/**
 * Daily Digest Runner
 * ===================
 * For every user:
 *   1. Fetch today's forecast for their ZIP
 *   2. Run the recommendation engine for each room
 *   3. Persist each recommendation
 *   4. Send one email covering all rooms
 *   5. Mark recommendations as emailed
 *
 * Called by the cron job (lib/cron.ts) and the /api/cron route.
 */

import { db } from "./db";
import { users, rooms, windows, exteriorWalls, recommendations } from "./schema";
import { eq } from "drizzle-orm";
import { fetchForecast } from "./weather";
import { generateRecommendation } from "./recommendation";
import { sendDailyEmail, type RoomDigest } from "./email";
import type { RoomFull } from "./schema";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DigestResult {
  usersProcessed:  number;
  roomsProcessed:  number;
  emailsSent:      number;
  errors:          { userId: string; email: string; error: string }[];
}

export async function runDailyDigest(): Promise<DigestResult> {
  const today   = todayDateStr();
  const allUsers = await db.select().from(users);

  let roomsProcessed = 0;
  let emailsSent     = 0;
  const errors: DigestResult["errors"] = [];

  for (const user of allUsers) {
    try {
      // Load all rooms for this user
      const userRooms = await db.select().from(rooms).where(eq(rooms.userId, user.id));
      if (userRooms.length === 0) continue;

      // Fetch forecast once per user (same ZIP for all rooms)
      let forecast;
      try {
        forecast = await fetchForecast(user.zipCode);
      } catch (err) {
        errors.push({
          userId: user.id, email: user.email,
          error: `Weather fetch failed: ${err instanceof Error ? err.message : err}`,
        });
        continue;
      }

      const dayForecast = forecast.days.find(d => d.date === today) ?? forecast.days[0];
      if (!dayForecast) {
        errors.push({ userId: user.id, email: user.email, error: "No forecast data for today." });
        continue;
      }

      const digests: RoomDigest[] = [];
      const recIds: string[]      = [];

      // Process each room
      for (const room of userRooms) {
        const [roomWindows, roomWalls] = await Promise.all([
          db.select().from(windows).where(eq(windows.roomId, room.id)),
          db.select().from(exteriorWalls).where(eq(exteriorWalls.roomId, room.id)),
        ]);

        const roomFull: RoomFull = { ...room, windows: roomWindows, exteriorWalls: roomWalls };
        const result = generateRecommendation(roomFull, dayForecast);

        // Upsert recommendation
        const existingRecs = await db.select().from(recommendations)
          .where(eq(recommendations.roomId, room.id)).all();
        const todayRec = existingRecs.find(r => r.date === today);

        const recData = {
          roomId:      room.id,
          date:        today,
          shouldOpen:  result.shouldOpen,
          openPeriods: JSON.stringify(result.openPeriods),
          reasoning:   result.reasoning,
        };

        let recId: string;
        if (todayRec) {
          await db.update(recommendations).set(recData)
            .where(eq(recommendations.id, todayRec.id));
          recId = todayRec.id;
        } else {
          const [inserted] = await db.insert(recommendations).values(recData).returning();
          recId = inserted.id;
        }

        recIds.push(recId);
        digests.push({
          roomName:     room.name,
          floorNumber:  room.floorNumber,
          balancePoint: room.balancePoint,
          shouldOpen:   result.shouldOpen,
          openPeriods:  result.openPeriods,
          reasoning:    result.reasoning,
          highF:        dayForecast.highF,
          lowF:         dayForecast.lowF,
          cityName:     forecast.cityName,
        });

        roomsProcessed++;
      }

      // Send one email for all rooms
      const sendResult = await sendDailyEmail({
        to:    user.email,
        date:  today,
        rooms: digests,
      });

      if (sendResult.ok) {
        // Mark all recs as emailed
        for (const recId of recIds) {
          await db.update(recommendations)
            .set({ emailSent: true, emailSentAt: new Date().toISOString() })
            .where(eq(recommendations.id, recId));
        }
        emailsSent++;
      } else {
        errors.push({ userId: user.id, email: user.email, error: sendResult.error ?? "Unknown send error." });
      }

    } catch (err) {
      errors.push({
        userId: user.id, email: user.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { usersProcessed: allUsers.length, roomsProcessed, emailsSent, errors };
}
