import cron from "node-cron";
import { runDailyDigest } from "./daily-digest";
import { runNotificationCheck } from "./notify";

export function startCron() {
  // Daily digest — 7 AM Eastern, DST-aware
  cron.schedule("0 7 * * *", async () => {
    console.log("[cron] Running daily digest…");
    try {
      const result = await runDailyDigest();
      console.log(`[cron] Digest: ${result.emailsSent} emails sent, ${result.roomsProcessed} rooms processed.`);
      if (result.errors.length) console.error("[cron] Digest errors:", result.errors);
    } catch (err) {
      console.error("[cron] Daily digest failed:", err);
    }
  }, { timezone: "America/New_York" });

  // Hourly notification check
  cron.schedule("0 * * * *", async () => {
    console.log("[cron] Running notification check…");
    try {
      const result = await runNotificationCheck();
      if (result.sent > 0) console.log(`[cron] Notifications: ${result.sent} sent, ${result.checked} rooms checked.`);
    } catch (err) {
      console.error("[cron] Notification check failed:", err);
    }
  }, { timezone: "America/New_York" });

  console.log("[cron] Daily digest scheduled at 7:00 AM Eastern (DST-aware).");
  console.log("[cron] Hourly notification check scheduled.");
}
