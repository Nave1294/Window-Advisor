"use client";
import type { DayForecast } from "@/lib/weather";

interface ForecastDay {
  date:    string;
  highF:   number;
  lowF:    number;
}

interface RainPeriod {
  startHour: number;
  endHour:   number;
  maxProb:   number;
}

function fmt12h(h: number): string {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h-12} PM`;
}

function dayLabel(dateStr: string, todayStr: string): string {
  const today  = new Date(todayStr + "T12:00:00Z");
  const target = new Date(dateStr  + "T12:00:00Z");
  const diff   = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return target.toLocaleDateString("en-US", { weekday:"short" });
}

function getRainPeriods(slots: { hour:number; precipProb:number }[]): RainPeriod[] {
  const RAIN_THRESHOLD = 0.4;
  const periods: RainPeriod[] = [];
  let inRain = false;
  let start = 0, maxProb = 0;

  for (const slot of slots) {
    if (slot.precipProb >= RAIN_THRESHOLD) {
      if (!inRain) { inRain = true; start = slot.hour; maxProb = slot.precipProb; }
      else maxProb = Math.max(maxProb, slot.precipProb);
    } else if (inRain) {
      periods.push({ startHour:start, endHour:slot.hour, maxProb });
      inRain = false; maxProb = 0;
    }
  }
  if (inRain) periods.push({ startHour:start, endHour:24, maxProb });
  return periods;
}

interface Props {
  days:  ForecastDay[];
  slots: { date:string; hour:number; precipProb:number; tempF:number }[];
  today: string;
}

export function ForecastStrip({ days, slots, today }: Props) {
  if (!days.length) return null;

  // Today's rain periods
  const todaySlots = slots.filter(s => s.date === today);
  const rainPeriods = getRainPeriods(todaySlots);

  // Today's temp by hour for mini chart
  const tempSlots = todaySlots.filter(s => s.tempF > 0);
  const minTemp = Math.min(...tempSlots.map(s => s.tempF));
  const maxTemp = Math.max(...tempSlots.map(s => s.tempF));
  const tempRange = maxTemp - minTemp || 1;

  return (
    <div className="card-raised" style={{ padding:"16px 20px", marginBottom:16 }}>

      {/* 5-day row */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {days.slice(0, 5).map((d, i) => (
          <div key={d.date} style={{
            flex:1, textAlign:"center", padding:"8px 4px",
            borderRadius:10,
            background: i === 0 ? "var(--sky-light)" : "var(--bg-subtle)",
            border: i === 0 ? "1px solid var(--sky-mid)" : "0.5px solid var(--border)",
          }}>
            <p style={{ fontSize:11, fontWeight:i===0?600:400, color:i===0?"var(--sky)":"var(--muted)", marginBottom:4 }}>
              {dayLabel(d.date, today)}
            </p>
            <p style={{ fontSize:13, fontWeight:600, color:"var(--navy)", marginBottom:1 }}>
              {d.highF.toFixed(0)}°
            </p>
            <p style={{ fontSize:11, color:"var(--muted)" }}>{d.lowF.toFixed(0)}°</p>
          </div>
        ))}
      </div>

      {/* Today's hourly temp bar */}
      {tempSlots.length > 0 && (
        <div style={{ marginBottom: rainPeriods.length ? 12 : 0 }}>
          <p style={{ fontSize:11, color:"var(--muted)", marginBottom:6, fontWeight:500 }}>Today's temperature</p>
          <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:36 }}>
            {tempSlots.map(s => {
              const height = Math.max(4, Math.round(((s.tempF - minTemp) / tempRange) * 32));
              const isRainy = s.precipProb >= 0.4;
              return (
                <div key={s.hour} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <div style={{
                    width:"100%", height, borderRadius:2,
                    background: isRainy ? "#93C5FD" : "var(--sky)",
                    opacity: isRainy ? 0.6 : 0.85,
                  }}/>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
            <span style={{ fontSize:10, color:"var(--muted-light)" }}>12 AM</span>
            <span style={{ fontSize:10, color:"var(--muted-light)" }}>12 PM</span>
            <span style={{ fontSize:10, color:"var(--muted-light)" }}>11 PM</span>
          </div>
        </div>
      )}

      {/* Rain periods — specific hours */}
      {rainPeriods.length > 0 && (
        <div style={{
          padding:"8px 12px", borderRadius:8,
          background:"#EFF6FF", border:"1px solid #BFDBFE",
          display:"flex", alignItems:"center", gap:8,
        }}>
          <span style={{ fontSize:14 }}>🌧</span>
          <div>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--navy)", marginBottom:1 }}>Rain expected today</p>
            <p style={{ fontSize:11, color:"var(--muted)" }}>
              {rainPeriods.map((r, i) => (
                `${fmt12h(r.startHour)}–${fmt12h(r.endHour)} (${Math.round(r.maxProb*100)}% chance)`
              )).join(" · ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
