import cron from "node-cron";
import { db } from "./db";
import { users, rooms, recommendations } from "./schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { todayEastern, nowHourEastern } from "./utils";
import type { OpenPeriod } from "./recommendation";

function client() { return new Resend(process.env.RESEND_API_KEY ?? ""); }
function from()   { return process.env.RESEND_FROM_EMAIL ?? "Window Advisor <onboarding@resend.dev>"; }
function appUrl() { return process.env.APP_URL ?? "https://your-app.up.railway.app"; }

function parseHour(timeStr: string): number {
  const clean = timeStr.replace(":00","").trim();
  const m = clean.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h;
}

async function generateMessage(params: {
  roomName:string; action:"open"|"close"; reasoning:string;
  highF:number; lowF:number; balancePoint:number|null; until?:string;
}): Promise<string> {
  // Call Anthropic directly — no HTTP self-fetch (avoids Railway SSL error)
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return fallbackMessage(params);

    const prompt = `Write a very short, friendly push notification email body (2-3 sentences max) about home ventilation.

Room: ${params.roomName}
Action: ${params.action === "open" ? "Time to open the windows" : "Time to close the windows"}
${params.until ? `Good conditions until: ${params.until}` : ""}
Today: High ${params.highF}°F, Low ${params.lowF}°F${params.balancePoint ? `, balance point ${params.balancePoint.toFixed(1)}°F` : ""}
Reason: ${params.reasoning}

Be warm, specific, brief. No subject line. No greeting. Just the body.
Example open: "Outdoor temps have dropped — good conditions in the ${params.roomName} right now. Worth opening up for the next couple of hours."
Example close: "Conditions outside are shifting — time to close up the ${params.roomName}."

Write only the body.`;

    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-api-key":apiKey, "anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:100, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || fallbackMessage(params);
  } catch {
    return fallbackMessage(params);
  }
}

function fallbackMessage(params: { roomName:string; action:"open"|"close"; until?:string }): string {
  if (params.action === "open") {
    return `Conditions are looking good in the ${params.roomName} right now.${params.until ? ` Good until around ${params.until}.` : ""} A great time to let some fresh air in.`;
  }
  return `Conditions are shifting in the ${params.roomName} — time to close up.${params.until ? ` You may be able to open again ${params.until}.` : ""}`;
}

async function sendNotification(opts: {
  to:string; roomName:string; action:"open"|"close"; body:string; email:string;
}) {
  const subject = opts.action === "open"
    ? `🪟 Good conditions in the ${opts.roomName} now`
    : `🔒 Time to close the ${opts.roomName}`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" style="max-width:480px;">
  <tr><td style="background:#1A2B3C;border-radius:12px 12px 0 0;padding:20px 24px;">
    <div style="font-family:Georgia,serif;font-size:18px;color:#FFFFFF;font-weight:600;">🪟 Window Advisor</div>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:24px;border-radius:0 0 12px 12px;border:1px solid #E2E8F0;border-top:none;">
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#1A2B3C;margin:0 0 14px;">${subject}</h2>
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 20px;">${opts.body}</p>
    <a href="${appUrl()}/dashboard/${encodeURIComponent(opts.email)}"
       style="display:inline-block;padding:10px 20px;background:#0071E3;color:white;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;">
      View dashboard
    </a>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  await client().emails.send({ from:from(), to:[opts.to], subject, html, text:opts.body });
}

export async function runNotificationCheck(): Promise<{ sent:number; checked:number }> {
  const today   = todayEastern();
  const nowHour = nowHourEastern();
  const nowISO  = new Date().toISOString();
  let sent = 0, checked = 0;

  // Only run during waking hours Eastern
  if (nowHour < 7 || nowHour >= 22) return { sent, checked };

  const notifRooms = await db.select().from(rooms).where(eq(rooms.notificationsEnabled, true));

  for (const room of notifRooms) {
    checked++;
    try {
      const user = (await db.select().from(users).where(eq(users.id, room.userId)))[0];
      if (!user) continue;

      const allRecs  = await db.select().from(recommendations).where(eq(recommendations.roomId, room.id)).all();
      const todayRec = allRecs.find(r => r.date === today);
      if (!todayRec) continue;

      const openPeriods: OpenPeriod[] = todayRec.openPeriods ? JSON.parse(todayRec.openPeriods) : [];
      if (!openPeriods.length) continue;

      // Parse forecast data stored with recommendation
      const forecastMeta = todayRec.forecastMeta ? JSON.parse(todayRec.forecastMeta) : null;
      const highF = forecastMeta?.highF ?? 70;
      const lowF  = forecastMeta?.lowF  ?? 55;

      // Don't re-notify within 4 hours
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      const lastOpen  = room.lastNotifiedOpen  ? new Date(room.lastNotifiedOpen).getTime()  : 0;
      const lastClose = room.lastNotifiedClose ? new Date(room.lastNotifiedClose).getTime() : 0;

      // Fire open notification when a window starts in the NEXT hour (advance notice)
      // Only matches nowHour+1 — not nowHour — so each open fires exactly once
      const opening = openPeriods.find(p => parseHour(p.from) === nowHour + 1);

      // Fire close notification when a window ends THIS hour (it's ending now)
      // Only matches nowHour — not nowHour+1 — so each close fires exactly once
      const closing = !opening && openPeriods.find(p => parseHour(p.to) === nowHour);

      if (opening && lastOpen < fourHoursAgo) {
        const body = await generateMessage({
          roomName:room.name, action:"open",
          reasoning:todayRec.reasoning,
          highF, lowF, balancePoint:room.balancePoint,
          until: opening.to,
        });
        await sendNotification({ to:user.email, roomName:room.name, action:"open", body, email:user.email });
        await db.update(rooms).set({ lastNotifiedOpen:nowISO }).where(eq(rooms.id, room.id));
        console.log(`[notify] Open notification sent to ${user.email} for ${room.name}`);
        sent++;
      } else if (closing && lastClose < fourHoursAgo) {
        const nextOpen = openPeriods.find(p => parseHour(p.from) > nowHour);
        const body = await generateMessage({
          roomName:room.name, action:"close",
          reasoning:todayRec.reasoning,
          highF, lowF, balancePoint:room.balancePoint,
          until: nextOpen ? `from ${nextOpen.from}` : undefined,
        });
        await sendNotification({ to:user.email, roomName:room.name, action:"close", body, email:user.email });
        await db.update(rooms).set({ lastNotifiedClose:nowISO }).where(eq(rooms.id, room.id));
        console.log(`[notify] Close notification sent to ${user.email} for ${room.name}`);
        sent++;
      }
    } catch (err) {
      console.error(`[notify] Error for room ${room.id}:`, err);
    }
  }

  return { sent, checked };
}
