"use client";
import type { OccupancySchedule } from "@/lib/schema";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const LEVEL_COLOR = { ONE_TWO: "#4A9DC4", THREE_FOUR: "#1A6B8A" };
const LEVEL_TEXT  = { ONE_TWO: "#E6F4FA", THREE_FOUR: "#C8E8F5" };

function fmt(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function OccupancyTimeline({ schedule }: { schedule: OccupancySchedule }) {
  const ticks = ["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
        Weekly schedule preview
      </p>

      {/* Day rows */}
      <div className="space-y-1">
        {DAYS.map((day, idx) => {
          const period    = schedule[idx];
          const occupied  = period?.occupied ?? false;
          const leftPct   = occupied ? (period.startHour / 24) * 100 : 0;
          const widthPct  = occupied ? ((period.endHour - period.startHour) / 24) * 100 : 0;
          const barColor  = occupied ? (LEVEL_COLOR[period.level as keyof typeof LEVEL_COLOR] ?? "#4A9DC4") : null;
          const txtColor  = occupied ? (LEVEL_TEXT[period.level  as keyof typeof LEVEL_TEXT]  ?? "#E6F4FA") : null;
          const showLabel = widthPct > 14;

          return (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "40px 1fr", alignItems: "center", gap: 0 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "right", paddingRight: 8 }}>{day}</span>
              <div style={{
                position: "relative", height: 24,
                background: "var(--cream-dark)",
                borderRadius: 5,
                border: "0.5px solid var(--border)",
                overflow: "hidden",
              }}>
                {occupied && (
                  <div style={{
                    position: "absolute",
                    top: 2, height: 20,
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 1)}%`,
                    background: barColor!,
                    borderRadius: 3,
                    display: "flex", alignItems: "center",
                    padding: "0 5px",
                    overflow: "hidden",
                    minWidth: 4,
                    transition: "left 0.2s, width 0.2s",
                  }}>
                    {showLabel && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: txtColor!, whiteSpace: "nowrap" }}>
                        {fmt(period.startHour)} – {fmt(period.endHour)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour ticks */}
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", marginTop: 3 }}>
        <div />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {ticks.map(t => (
            <span key={t} style={{ fontSize: 10, color: "var(--muted)" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: 14, flexWrap: "wrap",
        marginTop: 10, paddingTop: 10,
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "#4A9DC4" }} />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>1–2 people</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "#1A6B8A" }} />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>3–4 people</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "var(--cream-dark)", border: "0.5px solid var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Unoccupied</span>
        </div>
      </div>
    </div>
  );
}
