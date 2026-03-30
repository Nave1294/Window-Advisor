export const dynamic = "force-dynamic";

/**
 * POST /api/cron
 *
 * HTTP trigger for the daily digest — use this with Vercel Cron,
 * Railway cron, or any external scheduler. Also handy for manual testing.
 *
 * Protect with a secret in production:
 *   Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/daily-digest";

export async function POST(req: NextRequest) {
  // Optional bearer token check
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runDailyDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Cron digest failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
