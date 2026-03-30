/**
 * Next.js instrumentation hook
 * Runs once when the server starts — used to kick off background tasks.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Run DB migrations on cold start
    const { runMigrations } = await import("./lib/migrate");
    await runMigrations().catch(err => console.error("Startup migration failed:", err));

    // Start the cron scheduler
    const { startCron } = await import("./lib/cron");
    startCron();
  }
}
