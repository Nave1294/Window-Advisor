export const dynamic = "force-dynamic";

/**
 * GET /api/init
 *
 * Runs DB migrations on first boot (or on demand during development).
 * In production, call this once from your deployment script instead.
 */
import { NextResponse } from "next/server";
import { runMigrations } from "@/lib/migrate";

export async function GET() {
  try {
    await runMigrations();
    return NextResponse.json({ ok: true, message: "Database initialized." });
  } catch (err) {
    console.error("Init failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
