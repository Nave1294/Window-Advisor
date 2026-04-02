"use client";
import { useEffect, useRef } from "react";
import type { OpenPeriod } from "@/lib/recommendation";
import type { AiringWindow } from "@/lib/airing";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlotData  { hour:number; tempF:number; precipProb:number; }
interface BpSlot    { hour:number; balancePt:number; }

export interface DayTimelineProps {
  slots:         SlotData[];
  openPeriods:   OpenPeriod[];
  airingWindows: AiringWindow[];
  bpSlots:       BpSlot[];
  today:         string;
  nowHour:       number;
  co2IntervalMins?: number;  // from airing engine — room-specific CO2 rise rate
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHr(s: string): number {
  const m = s.replace(":00","").trim().match(/^(\d+)(?::(\d+))?\s*(AM|PM|a|p)$/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const p = m[3].toUpperCase();
  if ((p==="PM"||p==="P") && h!==12) h+=12;
  if ((p==="AM"||p==="A") && h===12) h=0;
  return h;
}

function isOpen(hour:number, openPeriods:OpenPeriod[], today:string): boolean {
  for (const p of openPeriods) {
    if (p.startDate && p.startDate!==today) continue;
    const f=parseHr(p.from), t=parseHr(p.to);
    if (t<=f){ if(hour>=f||hour<t) return true; }
    else     { if(hour>=f&&hour<t) return true; }
  }
  return false;
}

function fmt(h:number): string {
  if(h===0||h===24) return "12a";
  if(h===12) return "12p";
  return h<12?`${h}a`:`${h-12}p`;
}

// Temp bar color: below BP → sky blue, near BP → sage green, above → amber→red
function tempBarColor(tempF:number, bp:number): string {
  const delta = tempF - bp;            // negative = cool, positive = warm
  if (delta <= -8)  return "#93C5FD";  // very cool — sky blue
  if (delta <= -2)  return "#6EE7B7";  // cool — teal green
  if (delta <=  2)  return "#A7F3D0";  // near BP — light sage
  if (delta <=  8)  return "#FCD34D";  // warm — amber
  if (delta <= 14)  return "#FB923C";  // hot — orange
  return "#F87171";                    // very hot — red
}

// CO₂ bar color based on accumulated ppm above baseline
function co2Color(ppm:number): string {
  const t = Math.min(1, ppm / 700);
  if (t < 0.4) return `hsl(${Math.round(142-t*100)},60%,72%)`;  // green → yellow-green
  if (t < 0.7) return `hsl(${Math.round(60-(t-0.4)*120)},75%,65%)`; // yellow → orange
  return `hsl(${Math.round(18-(t-0.7)*60)},80%,58%)`;            // orange → red
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CW  = 42;   // cell width px
const BH  = 22;   // bar height px
const LH  = 26;   // label row height px

// ── Component ─────────────────────────────────────────────────────────────────

export function DayTimeline({ slots, openPeriods, airingWindows, bpSlots, today, nowHour, co2IntervalMins }: DayTimelineProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollLeft = Math.max(0, (nowHour - 4) * CW);
    }
  }, [nowHour]);

  const hours = Array.from({length:24},(_,i)=>i);

  // BP by hour (nearest 3h slot)
  const bpByHour: Record<number,number> = {};
  for (let h=0; h<24; h++) {
    const n = bpSlots.length
      ? bpSlots.reduce((b,s)=>Math.abs(s.hour-h)<Math.abs(b.hour-h)?s:b)
      : { balancePt:50 };
    bpByHour[h] = n.balancePt;
  }

  // Temp by hour
  const tempByHour: Record<number,number> = {};
  for (const s of slots) tempByHour[s.hour] = s.tempF;

  // CO₂ accumulation driven by actual room interval from airing engine
  // ppm rise per hour = 600 ppm / intervalMins × 60
  const interval    = co2IntervalMins ?? 120;
  const ppmPerHour  = Math.round((600 / interval) * 60);
  const airingHours = new Set(airingWindows.filter(w=>w.date===today).map(w=>w.hour));
  const co2ByHour: Record<number,number> = {};
  let ppm = 0;
  for (const h of hours) {
    if (airingHours.has(h)) ppm = Math.max(0, ppm - 500);
    co2ByHour[h] = Math.min(800, ppm);
    ppm = Math.min(800, ppm + ppmPerHour);
  }

  // Transition dots
  const openDotHours:  number[] = [];
  const closeDotHours: number[] = [];
  for (let h=0; h<24; h++) {
    const cur  = isOpen(h,   openPeriods, today);
    const prev = isOpen(h-1, openPeriods, today);
    if (cur&&!prev)  openDotHours.push(h);
    if (!cur&&prev)  closeDotHours.push(h);
  }

  const totalW = CW * 24;

  return (
    <div
      ref={ref}
      style={{
        overflowX:"auto", overflowY:"hidden",
        WebkitOverflowScrolling:"touch",
        scrollbarWidth:"none",
        margin:"0 -20px", padding:"0 20px 2px",
      }}
    >
      <div style={{ position:"relative", width:totalW, height: BH + LH + BH + 12 }}>

        {/* ── Temp bar ── */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:BH, display:"flex", borderRadius:8, overflow:"hidden" }}>
          {hours.map(h => {
            const hasData = h in tempByHour;
            const temp = tempByHour[h] ?? null;
            const bp   = bpByHour[h];
            const bg   = hasData && temp !== null ? tempBarColor(temp, bp) : "var(--border)";
            return (
              <div key={h} style={{ width:CW, height:BH, background:bg, position:"relative", flexShrink:0, opacity: hasData ? 1 : 0.35 }}>
                {/* Open dot */}
                {openDotHours.includes(h) && (
                  <div style={{
                    position:"absolute", bottom:3, left:"50%", transform:"translateX(-50%)",
                    width:8, height:8, borderRadius:"50%",
                    background:"#16A34A", border:"1.5px solid white",
                    boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
                  }}/>
                )}
                {/* Close dot */}
                {closeDotHours.includes(h) && (
                  <div style={{
                    position:"absolute", bottom:3, left:"50%", transform:"translateX(-50%)",
                    width:8, height:8, borderRadius:"50%",
                    background:"#DC2626", border:"1.5px solid white",
                    boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
                  }}/>
                )}
                {/* Now indicator */}
                {h===nowHour && (
                  <div style={{
                    position:"absolute", top:0, bottom:0, left:"50%",
                    width:2, background:"rgba(0,0,0,0.35)",
                    borderRadius:1,
                  }}/>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Hour labels ── */}
        <div style={{ position:"absolute", top:BH+2, left:0, right:0, height:LH, display:"flex" }}>
          {hours.map(h => (
            <div key={h} style={{
              width:CW, height:LH, flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <span style={{
                fontSize: h===nowHour ? 11 : 10,
                fontWeight: h===nowHour ? 700 : 400,
                color: h===nowHour ? "var(--navy)" : "var(--muted-light)",
                background: h===nowHour ? "var(--sky-light)" : "transparent",
                borderRadius: 4,
                padding: "1px 4px",
                lineHeight: "16px",
              }}>
                {fmt(h)}
              </span>
            </div>
          ))}
        </div>

        {/* ── CO₂ bar ── */}
        <div style={{ position:"absolute", top:BH+LH+4, left:0, right:0, height:BH, display:"flex", borderRadius:8, overflow:"hidden" }}>
          {hours.map(h => (
            <div key={h} style={{ width:CW, height:BH, background:co2Color(co2ByHour[h]??0), position:"relative", flexShrink:0 }}>
              {/* Airing dot */}
              {airingHours.has(h) && (
                <div style={{
                  position:"absolute", top:3, left:"50%", transform:"translateX(-50%)",
                  width:8, height:8, borderRadius:"50%",
                  background:"#1D4ED8", border:"1.5px solid white",
                  boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
                }}/>
              )}
              {h===nowHour && (
                <div style={{
                  position:"absolute", top:0, bottom:0, left:"50%",
                  width:2, background:"rgba(0,0,0,0.35)",
                  borderRadius:1,
                }}/>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
