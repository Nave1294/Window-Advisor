import { Resend } from "resend";
import type { OpenPeriod } from "./recommendation";

function client(): Resend {
  const k = process.env.RESEND_API_KEY;
  if (!k || k === "your_resend_api_key_here") throw new Error("RESEND_API_KEY is not configured.");
  return new Resend(k);
}
function from():    string { return process.env.RESEND_FROM_EMAIL ?? "Window Advisor <onboarding@resend.dev>"; }
function appUrl():  string { return process.env.APP_URL ?? "https://your-app.up.railway.app"; }

export interface RoomDigest {
  roomId:       string;
  roomName:     string;
  floorNumber:  number;
  balancePoint: number | null;
  comfortBias:  number;
  shouldOpen:   boolean;
  openPeriods:  OpenPeriod[];
  reasoning:    string;
  highF:        number;
  lowF:         number;
  cityName:     string;
}

// ── Room block ────────────────────────────────────────────────────────────────

function roomBlock(room: RoomDigest, date: string): string {
  const statusColor  = room.shouldOpen ? "#2D7A4F" : "#B45309";
  const statusBg     = room.shouldOpen ? "#F0FDF4" : "#FFFBEB";
  const statusBorder = room.shouldOpen ? "#86EFAC" : "#FCD34D";
  const statusIcon   = room.shouldOpen ? "🪟" : "🔒";
  const statusText   = room.shouldOpen ? "Open windows" : "Keep closed";
  const base         = appUrl();

  const hotUrl  = `${base}/api/feedback?roomId=${room.roomId}&type=TOO_HOT&date=${date}`;
  const coldUrl = `${base}/api/feedback?roomId=${room.roomId}&type=TOO_COLD&date=${date}`;

  const biasNote = Math.abs(room.comfortBias) >= 0.5
    ? `<div style="font-size:11px;color:#94A3B8;margin-top:4px;">Comfort adjustment: ${room.comfortBias > 0 ? "+" : ""}${room.comfortBias.toFixed(1)}°F from your feedback</div>`
    : "";

  const periodsHtml = room.shouldOpen && room.openPeriods.length > 0
    ? room.openPeriods.map(p => {
        const spanLabel = p.multiDay
          ? `<span style="font-size:11px;background:#DBEAFE;color:#1D4ED8;padding:2px 7px;border-radius:10px;font-weight:600;margin-left:8px;">Multi-day</span>`
          : "";
        return `
          <div style="background:#EFF6FF;border-radius:8px;padding:10px 14px;margin-top:8px;">
            <div style="font-weight:600;color:#1e3a5f;font-size:14px;">${p.from} – ${p.to}${spanLabel}</div>
            <div style="color:#64748B;font-size:13px;margin-top:3px;line-height:1.4;">${p.reason}</div>
          </div>`;
      }).join("")
    : "";

  return `
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-family:Georgia,serif;font-size:18px;font-weight:600;color:#1A2B3C;">${room.roomName}</div>
          <div style="font-size:12px;color:#94A3B8;margin-top:2px;">
            Floor ${room.floorNumber}${room.balancePoint != null ? ` · Balance point ${room.balancePoint.toFixed(1)}°F` : ""}
          </div>
          ${biasNote}
        </div>
        <div style="text-align:right;font-size:12px;color:#94A3B8;">↑${room.highF.toFixed(0)}°F · ↓${room.lowF.toFixed(0)}°F</div>
      </div>

      <div style="background:${statusBg};border:1px solid ${statusBorder};border-radius:8px;padding:10px 14px;">
        <div style="font-size:15px;font-weight:700;color:${statusColor};">${statusIcon} ${statusText}</div>
        <div style="font-size:13px;color:#475569;margin-top:4px;line-height:1.5;">${room.reasoning}</div>
      </div>

      ${periodsHtml}

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #F1F5F9;">
        <div style="font-size:12px;color:#94A3B8;margin-bottom:8px;">How did this feel?</div>
        <a href="${hotUrl}" style="display:inline-block;margin-right:8px;padding:6px 14px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;font-size:12px;font-weight:600;color:#92400E;text-decoration:none;">🌡 Too warm</a>
        <a href="${coldUrl}" style="display:inline-block;padding:6px 14px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;font-size:12px;font-weight:600;color:#1E40AF;text-decoration:none;">🧊 Too cold</a>
      </div>
    </div>`;
}

// ── Full email HTML ───────────────────────────────────────────────────────────

function dailyHtml(email: string, date: string, roomDigests: RoomDigest[]): string {
  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const city    = roomDigests[0]?.cityName ?? "";
  const anyOpen = roomDigests.some(r => r.shouldOpen);
  const hasMultiDay = roomDigests.some(r => r.openPeriods.some(p => p.multiDay));

  const summaryLine = anyOpen
    ? `${roomDigests.filter(r => r.shouldOpen).length} of ${roomDigests.length} room${roomDigests.length > 1 ? "s" : ""} have open windows today.` +
      (hasMultiDay ? " Some windows stay open for multiple days — check the schedule below." : "")
    : "Keep all windows closed today.";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Window Advisor — ${dateLabel}</title></head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" style="max-width:580px;" cellpadding="0" cellspacing="0">
  <tr><td style="background:#1A2B3C;border-radius:12px 12px 0 0;padding:24px 28px;">
    <div style="font-family:Georgia,serif;font-size:20px;color:#FFFFFF;font-weight:600;">🪟 Window Advisor</div>
    <div style="font-size:13px;color:#7A9DB8;margin-top:6px;">${dateLabel}${city ? ` · ${city}` : ""}</div>
  </td></tr>
  <tr><td style="background:#2D4459;padding:14px 28px;">
    <div style="font-size:13px;color:#C8DCE8;">${summaryLine}</div>
  </td></tr>
  <tr><td style="background:#F8FAFC;padding:24px 28px;border-radius:0 0 12px 12px;border:1px solid #E2E8F0;border-top:none;">
    ${roomDigests.map(r => roomBlock(r, date)).join("")}
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0;text-align:center;">
      <p style="font-size:12px;color:#94A3B8;margin:0 0 4px;">Sent to ${email} · "Too warm" or "Too cold" adjusts future recommendations.</p>
    </div>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

// ── Plain text fallback ───────────────────────────────────────────────────────

function dailyText(email: string, date: string, roomDigests: RoomDigest[]): string {
  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const base  = appUrl();
  const lines = [`WINDOW ADVISOR — ${dateLabel}`, "=".repeat(40), ""];

  for (const r of roomDigests) {
    lines.push(`${r.roomName} (Floor ${r.floorNumber})`);
    lines.push(`Status: ${r.shouldOpen ? "OPEN WINDOWS" : "KEEP CLOSED"}`);
    lines.push(`Today: High ${r.highF.toFixed(0)}°F / Low ${r.lowF.toFixed(0)}°F`);
    lines.push(`\n${r.reasoning}`);
    if (r.shouldOpen && r.openPeriods.length > 0) {
      lines.push("\nOpen windows:");
      r.openPeriods.forEach(p =>
        lines.push(`  ${p.from} – ${p.to}${p.multiDay ? " (multi-day)" : ""}: ${p.reason}`)
      );
    }
    lines.push(`\nToo warm? ${base}/api/feedback?roomId=${r.roomId}&type=TOO_HOT&date=${date}`);
    lines.push(`Too cold? ${base}/api/feedback?roomId=${r.roomId}&type=TOO_COLD&date=${date}`);
    lines.push("\n" + "-".repeat(40) + "\n");
  }
  lines.push(`Sent to: ${email}`);
  return lines.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SendResult { ok: boolean; emailId?: string; error?: string; }

export async function sendDailyEmail(opts: {
  to: string; date: string; rooms: RoomDigest[];
}): Promise<SendResult> {
  const { to, date, rooms: digests } = opts;
  if (!digests.length) return { ok: false, error: "No rooms." };

  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const anyOpen      = digests.some(r => r.shouldOpen);
  const hasMultiDay  = digests.some(r => r.openPeriods.some(p => p.multiDay));
  const openRooms    = digests.filter(r => r.shouldOpen);

  let subject: string;
  if (!anyOpen) {
    subject = `🔒 Keep windows closed today · ${dateLabel}`;
  } else if (hasMultiDay) {
    subject = `🪟 Extended open window — ${openRooms.length > 1 ? `${openRooms.length} rooms` : openRooms[0].roomName} · ${dateLabel}`;
  } else {
    subject = openRooms.length > 1
      ? `🪟 ${openRooms.length} rooms good to open · ${dateLabel}`
      : `🪟 ${openRooms[0].roomName} — good to open · ${dateLabel}`;
  }

  try {
    const { data, error } = await client().emails.send({
      from: from(), to: [to], subject,
      html: dailyHtml(to, date, digests),
      text: dailyText(to, date, digests),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, emailId: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Confirmation email ────────────────────────────────────────────────────────

export async function sendConfirmationEmail(opts: {
  to: string; roomName: string; floorNumber: number;
  balancePoint: number | null; minTempF: number; maxTempF: number;
  minHumidity: number; maxHumidity: number; cityName: string;
}): Promise<SendResult> {
  const { to, roomName, floorNumber, balancePoint, minTempF, maxTempF, minHumidity, maxHumidity, cityName } = opts;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Room added — Window Advisor</title></head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">
  <tr><td style="background:#1A2B3C;border-radius:12px 12px 0 0;padding:24px 28px;">
    <div style="font-family:Georgia,serif;font-size:20px;color:#FFFFFF;font-weight:600;">🪟 Window Advisor</div>
    <div style="font-size:13px;color:#7A9DB8;margin-top:4px;">New room added</div>
  </td></tr>
  <tr><td style="background:#FFFFFF;padding:28px;border-radius:0 0 12px 12px;border:1px solid #E2E8F0;border-top:none;">
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#1A2B3C;margin:0 0 6px;">${roomName}</h2>
    <p style="font-size:13px;color:#94A3B8;margin:0 0 20px;">Floor ${floorNumber}${cityName ? ` · ${cityName}` : ""}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
      ${balancePoint != null ? `<tr><td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Balance point</td><td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;font-size:14px;font-weight:600;color:#1A2B3C;text-align:right;">${balancePoint.toFixed(1)}°F</td></tr>` : ""}
      <tr><td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;">Temperature target</td><td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;font-size:14px;font-weight:600;color:#1A2B3C;text-align:right;">${minTempF}° – ${maxTempF}°F</td></tr>
      <tr><td style="padding:12px 16px;font-size:13px;color:#64748B;">Humidity target</td><td style="padding:12px 16px;font-size:14px;font-weight:600;color:#1A2B3C;text-align:right;">${minHumidity}% – ${maxHumidity}%</td></tr>
    </table>
    <p style="font-size:13px;color:#64748B;margin:20px 0 0;line-height:1.6;">
      Your first daily recommendation arrives tomorrow at 7 AM Eastern. When conditions are favourable for multiple days in a row, the email will show the full open window — you won't need to re-check each day. Each email includes "Too warm" and "Too cold" links to fine-tune future recommendations.
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  const text = `Window Advisor — Room Added\n\n${roomName} (Floor ${floorNumber}) has been set up.\n` +
    (balancePoint != null ? `Balance point: ${balancePoint.toFixed(1)}°F\n` : "") +
    `Temperature target: ${minTempF}°–${maxTempF}°F\nHumidity target: ${minHumidity}%–${maxHumidity}%\n\n` +
    `Your first daily recommendation arrives tomorrow at 7 AM Eastern.\n` +
    `Multi-day open windows will be reported in full — no need to re-check each day.`;

  try {
    const { data, error } = await client().emails.send({
      from: from(), to: [to],
      subject: `🪟 ${roomName} added to Window Advisor`,
      html, text,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, emailId: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
