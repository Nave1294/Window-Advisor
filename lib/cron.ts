/**
 * Cron Scheduler
 * ==============
 * Schedules the daily digest at 7:00 AM local server time.
 * Import this once at server startup — Next.js instrumentation hook
 * (instrumentation.ts) is the right place for this.
 *
 * node-cron runs in-process; for production you may prefer an
 * external scheduler (Vercel Cron, Railway cron, system cron)
 * hitting POST /api/cron instead.
 */

import cron from "node-cron";
import { runDailyDigest } from "./daily-digest";

let scheduled = false;

export function startCron() {
  if (scheduled) return; // idempotent — safe in Next.js hot-reload
  scheduled = true;

  // 7:00 AM Eastern — node-cron handles DST automatically via timezone option
  cron.schedule("0 7 * * *", async () => {
    console.log(`[cron] Running daily digest at ${new Date().toISOString()}`);
    try {
      const result = await runDailyDigest();
      console.log(`[cron] Done — ${result.emailsSent} emails sent, ${result.roomsProcessed} rooms processed.`);
      if (result.errors.length > 0) {
        console.error("[cron] Errors:", result.errors);
      }
    } catch (err) {
      console.error("[cron] Digest failed:", err);
    }
  }, { timezone: "America/New_York" });

  console.log("[cron] Daily digest scheduled at 7:00 AM Eastern (DST-aware).");
}
