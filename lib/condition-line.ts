/**
 * Generates the smart single-line condition summary shown on the dashboard.
 * Time-aware — knows what's happening now vs later.
 */

import type { OpenPeriod } from "./recommendation";

function fmtT(s: string): string {
  return s.replace(":00 ", " ").trim();
}

function parseHour(timeStr: string): number {
  // "5:00 PM" -> 17, "8 AM" -> 8, "2:00 AM" -> 2
  const clean = timeStr.replace(":00", "").trim();
  const match = clean.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (!match) return 0;
  let h = parseInt(match[1]);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h;
}

function dayLabel(dateStr: string, todayStr: string): string {
  const today    = new Date(todayStr + "T12:00:00Z");
  const target   = new Date(dateStr  + "T12:00:00Z");
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return target.toLocaleDateString("en-US", { weekday: "long" });
}

export function conditionLine(
  shouldOpen:  boolean,
  openPeriods: OpenPeriod[],
  today:       string,   // YYYY-MM-DD
  nowHour:     number,   // current local hour 0-23
): string {
  if (!shouldOpen || !openPeriods.length) {
    return "Keep everything closed today.";
  }

  // Separate today's periods from future ones
  const todayPeriods  = openPeriods.filter(p => !p.startDate || p.startDate === today);
  const futurePeriods = openPeriods.filter(p => p.startDate && p.startDate > today);

  // Check if we're currently inside an open period
  const activePeriod = todayPeriods.find(p => {
    const startH = parseHour(p.from);
    const endH   = parseHour(p.to);
    if (endH < startH) return nowHour >= startH || nowHour < endH; // spans midnight
    return nowHour >= startH && nowHour < endH;
  });

  if (activePeriod) {
    const endLabel = fmtT(activePeriod.to);
    if (activePeriod.multiDay) {
      // For multi-day periods, the `to` time already contains the day prefix (e.g. "Fri 2 AM")
      return `Good conditions now — open until ${endLabel}.`;
    }
    return `Good conditions now until ${endLabel}.`;
  }

  // Next upcoming period today
  const nextToday = todayPeriods
    .filter(p => parseHour(p.from) > nowHour)
    .sort((a, b) => parseHour(a.from) - parseHour(b.from))[0];

  if (nextToday) {
    const startH = parseHour(nextToday.from);
    const timeLabel = startH >= 17 ? `tonight from ${fmtT(nextToday.from)}`
                    : startH >= 12 ? `this afternoon from ${fmtT(nextToday.from)}`
                    : `this morning from ${fmtT(nextToday.from)}`;

    if (nextToday.multiDay) {
      return `Good conditions ${timeLabel} through ${fmtT(nextToday.to)}.`;
    }
    return `Good conditions ${timeLabel} until ${fmtT(nextToday.to)}.`;
  }

  // No more periods today — check tomorrow/future
  if (futurePeriods.length) {
    const next = futurePeriods[0];
    const whenLabel = next.startDate ? dayLabel(next.startDate, today) : "later this week";
    return `Nothing useful today — good conditions ${whenLabel} from ${fmtT(next.from)}.`;
  }

  return "No good conditions today.";
}

export function airingLine(
  windows: { date: string; hour: number; label: string }[],
  today:   string,
  nowHour: number,
): string {
  const todayW = windows.filter(w => w.date === today);
  if (!todayW.length) return "";

  // Filter to upcoming slots only (not already passed)
  const upcoming = todayW.filter(w => w.hour >= nowHour);
  const show     = upcoming.length ? upcoming : todayW; // fallback to all if all passed

  const times = show
    .slice(0, 2)
    .map(w => w.label.split("–")[0].replace(":00 ", " ").trim());

  if (times.length === 1) return `Air out briefly at ${times[0]}.`;
  return `Air out briefly at ${times.join(" and ")}.`;
}

export function wholeHouseLine(
  rooms: { name: string; shouldOpen: boolean; openPeriods: OpenPeriod[]; today: string; nowHour: number }[]
): string {
  if (!rooms.length) return "";
  const openRooms   = rooms.filter(r => r.shouldOpen);
  const closedRooms = rooms.filter(r => !r.shouldOpen);

  if (openRooms.length === 0) return "Keep everything closed today.";
  if (closedRooms.length === 0) return "Good conditions across the whole house today.";

  if (rooms.length === 2) {
    const open   = openRooms[0].name;
    const closed = closedRooms[0].name;
    return `Open in the ${open}, keep the ${closed} closed.`;
  }

  return `Good conditions in ${openRooms.length} of ${rooms.length} rooms today.`;
}
