/**
 * Email Service
 * =============
 * Sends daily window recommendation emails via Resend.
 * One email per user per day — covers all their rooms in a single digest.
 */

import { Resend } from "resend";
import type { OpenPeriod } from "./recommendation";

function client(): Resend {
  const k = process.env.RESEND_API_KEY;
  if (!k || k === "your_resend_api_key_here")
    throw new Error("RESEND_API_KEY is not configured.");
  return new Resend(k);
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Window Advisor <notifications@resend.dev>";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoomDigest {
  roomName:    string;
  floorNumber: number;
  balancePoint: number | null;
  shouldOpen:  boolean;
  openPeriods: OpenPeriod[];
  reasoning:   string;
  highF:       number;
  lowF:        number;
  cityName:    string;
}

// ─── HTML template ────────────────────────────────────────────────────────────

function renderEmail(email: string, date: string, rooms: RoomDigest[]): string {
  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const anyOpen = rooms.some(r => r.shouldOpen);
  const city    = rooms[0]?.cityName ?? "";

  function roomBlock(room: RoomDigest): string {
    const statusColor  = room.shouldOpen ? "#2D7A4F" : "#B45309";
    const statusBg     = room.shouldOpen ? "#F0FDF4" : "#FFFBEB";
    const statusBorder = room.shouldOpen ? "#86EFAC" : "#FCD34D";
    const statusText   = room.shouldOpen ? "Open windows" : "Keep closed";
    const statusIcon   = room.shouldOpen ? "🪟" : "🔒";

    const periodsHtml = room.shouldOpen && room.openPeriods.length > 0
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
          ${room.openPeriods.map(p => `
            <tr>
              <td style="padding:8px 12px; background:#EFF6FF; border-radius:8px; margin-bottom:6px; display:block;">
                <div style="font-weight:600; color:#1e3a5f; font-size:14px;">
                  ${p.from} – ${p.to}
                </div>
                <div style="color:#64748B; font-size:13px; margin-top:2px; line-height:1.4;">
                  ${p.reason}
                </div>
              </td>
            </tr>
            <tr><td style="height:6px;"></td></tr>
          `).join("")}
        </table>`
      : "";

    return `
      <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:20px; margin-bottom:16px;">
        <!-- Room header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div>
            <div style="font-family:'Georgia',serif; font-size:18px; font-weight:600; color:#1A2B3C;">
              ${room.roomName}
            </div>
            <div style="font-size:12px; color:#94A3B8; margin-top:2px;">
              Floor ${room.floorNumber}
              ${room.balancePoint != null ? ` · Balance point ${room.balancePoint.toFixed(1)}°F` : ""}
            </div>
          </div>
          <div style="text-align:right; font-size:12px; color:#94A3B8;">
            High ${room.highF.toFixed(0)}°F · Low ${room.lowF.toFixed(0)}°F
          </div>
        </div>

        <!-- Status badge -->
        <div style="background:${statusBg}; border:1px solid ${statusBorder}; border-radius:8px; padding:10px 14px;">
          <div style="font-size:15px; font-weight:700; color:${statusColor};">
            ${statusIcon} ${statusText}
          </div>
          <div style="font-size:13px; color:#475569; margin-top:4px; line-height:1.5;">
            ${room.reasoning}
          </div>
        </div>

        ${periodsHtml}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Window Advisor — ${dateLabel}</title>
</head>
<body style="margin:0; padding:0; background:#F7F3EC; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background:#1A2B3C; border-radius:12px 12px 0 0; padding:24px 28px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-family:'Georgia',serif; font-size:20px; color:#FFFFFF; font-weight:600;">
                  🪟 Window Advisor
                </span>
              </div>
              <div style="font-size:13px; color:#7A9DB8; margin-top:6px;">
                ${dateLabel}${city ? ` · ${city}` : ""}
              </div>
            </td>
          </tr>

          <!-- Summary bar -->
          <tr>
            <td style="background:#2D4459; padding:14px 28px;">
              <div style="font-size:13px; color:#C8DCE8;">
                ${anyOpen
                  ? `${rooms.filter(r => r.shouldOpen).length} of ${rooms.length} room${rooms.length > 1 ? "s" : ""} have open windows today.`
                  : `Keep all windows closed today.`}
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#F8FAFC; padding:24px 28px; border-radius:0 0 12px 12px; border:1px solid #E2E8F0; border-top:none;">

              ${rooms.map(roomBlock).join("")}

              <!-- Footer -->
              <div style="margin-top:24px; padding-top:20px; border-top:1px solid #E2E8F0; text-align:center;">
                <p style="font-size:12px; color:#94A3B8; margin:0 0 4px;">
                  You're receiving this because you set up Window Advisor for ${email}.
                </p>
                <p style="font-size:12px; color:#94A3B8; margin:0;">
                  Recommendations are generated each morning based on today's forecast.
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function renderText(email: string, date: string, rooms: RoomDigest[]): string {
  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const lines: string[] = [
    `WINDOW ADVISOR — ${dateLabel}`,
    "=".repeat(40),
    "",
  ];

  for (const room of rooms) {
    lines.push(`${room.roomName} (Floor ${room.floorNumber})`);
    lines.push(`Status: ${room.shouldOpen ? "OPEN WINDOWS" : "KEEP CLOSED"}`);
    lines.push(`Today: High ${room.highF.toFixed(0)}°F / Low ${room.lowF.toFixed(0)}°F`);
    if (room.balancePoint != null)
      lines.push(`Balance point: ${room.balancePoint.toFixed(1)}°F`);
    lines.push(`\n${room.reasoning}`);
    if (room.shouldOpen && room.openPeriods.length > 0) {
      lines.push("\nBest times to open:");
      for (const p of room.openPeriods)
        lines.push(`  ${p.from} – ${p.to}: ${p.reason}`);
    }
    lines.push("\n" + "-".repeat(40) + "\n");
  }

  lines.push(`Sent to: ${email}`);
  return lines.join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SendDailyEmailOptions {
  to:    string;
  date:  string;   // YYYY-MM-DD
  rooms: RoomDigest[];
}

export interface SendResult {
  ok:      boolean;
  emailId?: string;
  error?:  string;
}

export async function sendDailyEmail(opts: SendDailyEmailOptions): Promise<SendResult> {
  const { to, date, rooms } = opts;

  if (rooms.length === 0)
    return { ok: false, error: "No rooms to report on." };

  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const anyOpen   = rooms.some(r => r.shouldOpen);
  const subject   = anyOpen
    ? `🪟 ${rooms.filter(r => r.shouldOpen).length > 1
        ? `${rooms.filter(r => r.shouldOpen).length} rooms good to open`
        : `${rooms.find(r => r.shouldOpen)!.roomName} — good to open`} · ${dateLabel}`
    : `🔒 Keep windows closed today · ${dateLabel}`;

  try {
    const resend = client();
    const { data, error } = await resend.emails.send({
      from:    fromAddress(),
      to:      [to],
      subject,
      html:    renderEmail(to, date, rooms),
      text:    renderText(to, date, rooms),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, emailId: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
