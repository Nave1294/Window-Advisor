"use client";
import type { UnoccupiedBlock } from "@/lib/schema";

const DAYS      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const HOURS_IN_DAY = 24;

function fmt(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h-12} PM`;
}

const BLOCK_COLORS = [
  { bg: "#E5E7EB", border: "#9CA3AF" },
  { bg: "#DBEAFE", border: "#93C5FD" },
  { bg: "#FDE68A", border: "#FCD34D" },
  { bg: "#D1FAE5", border: "#6EE7B7" },
  { bg: "#FCE7F3", border: "#F9A8D4" },
];

export function OccupancyTimeline({ blocks }: { blocks: UnoccupiedBlock[] }) {
  const ticks = ["12 AM","6 AM","12 PM","6 PM","12 AM"];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color:"var(--muted)" }}>
        Occupancy preview — shaded = unoccupied
      </p>
      <div className="space-y-1">
        {DAYS.map((day, dayIdx) => {
          const dayBlocks = blocks
            .map((b, i) => ({ ...b, colorIdx: i % BLOCK_COLORS.length }))
            .filter(b => b.days.includes(dayIdx));

          return (
            <div key={dayIdx} style={{ display:"grid", gridTemplateColumns:"40px 1fr", alignItems:"center" }}>
              <span style={{ fontSize:11, color:"var(--muted)", textAlign:"right", paddingRight:8 }}>{day}</span>
              <div style={{ position:"relative", height:24, background:"var(--sky-light)", borderRadius:5, border:"0.5px solid var(--sky)", overflow:"hidden" }}>
                {/* Occupied base (full width sky-light already) */}
                {dayBlocks.map(b => {
                  const left  = (b.startHour / HOURS_IN_DAY) * 100;
                  const width = ((b.endHour - b.startHour) / HOURS_IN_DAY) * 100;
                  const c     = BLOCK_COLORS[b.colorIdx];
                  return (
                    <div key={b.id} style={{
                      position:"absolute", top:0, height:"100%",
                      left:`${left}%`, width:`${Math.max(width,0.5)}%`,
                      background: c.bg,
                      borderLeft:`2px solid ${c.border}`,
                      borderRight:`2px solid ${c.border}`,
                    }}/>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour ticks */}
      <div style={{ display:"grid", gridTemplateColumns:"40px 1fr", marginTop:3 }}>
        <div/>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          {ticks.map(t => <span key={t} style={{ fontSize:10, color:"var(--muted)" }}>{t}</span>)}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{ width:10, height:10, borderRadius:3, background:"var(--sky-light)", border:"0.5px solid var(--sky)" }}/>
          <span style={{ fontSize:11, color:"var(--muted)" }}>Occupied</span>
        </div>
        {blocks.slice(0,3).map((b, i) => {
          const c = BLOCK_COLORS[i % BLOCK_COLORS.length];
          const dayNames = b.days.map(d=>DAYS[d].slice(0,3)).join(", ");
          return (
            <div key={b.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:10, height:10, borderRadius:3, background:c.bg, border:`1px solid ${c.border}` }}/>
              <span style={{ fontSize:11, color:"var(--muted)" }}>
                {fmt(b.startHour)}–{fmt(b.endHour)} ({dayNames})
              </span>
            </div>
          );
        })}
        {blocks.length > 3 && <span style={{ fontSize:11, color:"var(--muted)" }}>+{blocks.length-3} more</span>}
      </div>
    </div>
  );
}
