export const dynamic = "force-dynamic";

/**
 * GET /api/feedback?roomId=X&type=TOO_HOT|TOO_COLD&date=YYYY-MM-DD
 *
 * Called when user clicks a feedback link in their daily email.
 * Adjusts comfortBias by ±0.5°F and records the feedback.
 * Returns a simple HTML thank-you page (no app required).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, feedback } from "@/lib/schema";
import { eq } from "drizzle-orm";

const BIAS_STEP = 0.5;
const BIAS_CAP  = 5.0;

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  const type   = req.nextUrl.searchParams.get("type") as "TOO_HOT" | "TOO_COLD" | null;
  const date   = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  if (!roomId || !["TOO_HOT", "TOO_COLD"].includes(type ?? ""))
    return html("Invalid feedback link.", false);

  const room = (await db.select().from(rooms).where(eq(rooms.id, roomId)))[0];
  if (!room) return html("Room not found.", false);

  // Adjust bias: too hot → increase bias (lower effective balance point → open more)
  //              too cold → decrease bias (raise effective balance point → open less)
  const delta   = type === "TOO_HOT" ? BIAS_STEP : -BIAS_STEP;
  const newBias = Math.max(-BIAS_CAP, Math.min(BIAS_CAP, (room.comfortBias ?? 0) + delta));

  await db.update(rooms).set({ comfortBias: newBias }).where(eq(rooms.id, roomId));

  // Record feedback
  await db.insert(feedback).values({ roomId, type: type!, date }).catch(() => {/* ignore dups */});

  const msg = type === "TOO_HOT"
    ? `Got it — we'll recommend opening windows a little more aggressively for ${room.name}.`
    : `Got it — we'll be more conservative about recommending open windows for ${room.name}.`;

  const biasMsg = Math.abs(newBias) >= 0.5
    ? ` Your comfort adjustment is now ${newBias > 0 ? "+" : ""}${newBias.toFixed(1)}°F.`
    : "";

  return html(msg + biasMsg, true);
}

function html(message: string, success: boolean): NextResponse {
  const color  = success ? "#2D7A4F" : "#B45309";
  const icon   = success ? "✓" : "⚠";
  const body   = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Window Advisor Feedback</title>
<style>
  body { font-family: 'Helvetica Neue', sans-serif; background: #F7F3EC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; border-radius: 16px; padding: 40px; max-width: 420px; width: 90%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .icon { font-size: 2.5rem; margin-bottom: 16px; color: ${color}; }
  h2 { font-size: 1.25rem; color: #1A2B3C; margin: 0 0 12px; font-family: Georgia, serif; }
  p { color: #64748B; font-size: 0.95rem; line-height: 1.6; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>Window Advisor</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new NextResponse(body, {
    status: success ? 200 : 400,
    headers: { "Content-Type": "text/html" },
  });
}
