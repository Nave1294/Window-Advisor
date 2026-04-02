"use client";

interface SlotData {
  date:       string;
  hour:       number;   // already local (Eastern) from weather module
  tempF:      number;
  precipProb: number;
  humidity:   number;
  ts?:        number;   // Unix timestamp for sort
}

interface Props {
  slots:   SlotData[];
  today:   string;
  nowHour: number;
}

function fmt12h(h: number): string {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function tempColor(tempF: number): string {
  if (tempF <= 40) return "#93C5FD";
  if (tempF <= 55) return "#6EE7B7";
  if (tempF <= 68) return "#A7F3D0";
  if (tempF <= 78) return "#FDE68A";
  if (tempF <= 88) return "#FCA5A5";
  return "#F87171";
}

export function ForecastStrip({ slots, today, nowHour }: Props) {
  if (!slots.length) return null;

  // Sort chronologically using ts if available, else date+hour
  const sorted = [...slots].sort((a, b) => {
    if (a.ts && b.ts) return a.ts - b.ts;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.hour - b.hour;
  });

  // Find the slot at or just after now
  const nowIdx = sorted.findIndex(s => s.date === today && s.hour >= nowHour);
  const startIdx = nowIdx >= 0 ? nowIdx : 0;

  // Take up to 8 slots from now (covers ~24h at 3h intervals)
  const display = sorted.slice(startIdx, startIdx + 8);
  if (!display.length) return null;

  // Rain detection across displayed slots
  const RAIN_THRESHOLD = 0.4;
  const rainSlots = display.filter(s => s.precipProb >= RAIN_THRESHOLD);
  const hasPrecip = rainSlots.length > 0;

  return (
    <div className="card-raised" style={{ padding:"16px 20px", marginBottom:16 }}>
      <p style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
        Next 24 hours
      </p>

      <div style={{ overflowX:"auto", overflowY:"hidden", WebkitOverflowScrolling:"touch", scrollbarWidth:"none", margin:"0 -20px", padding:"0 20px" }}>
        <div style={{ display:"flex", gap:6, width:"max-content", paddingBottom:4 }}>
          {display.map((s, i) => {
            const isNow = i === 0;
            const isNextDay = s.date !== today;
            return (
              <div key={i} style={{
                width:58, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                padding:"8px 4px", borderRadius:10,
                background: isNow ? "var(--sky-light)" : "var(--bg-subtle)",
                border: isNow ? "1px solid var(--sky-mid)" : "0.5px solid var(--border)",
              }}>
                {/* Hour label — show day prefix if it crosses midnight */}
                <span style={{ fontSize:10, fontWeight:isNow?700:400, color:isNow?"var(--sky)":"var(--muted-light)", textAlign:"center", lineHeight:"1.2" }}>
                  {isNow ? "Now" : (isNextDay && (i===1 || display[i-1]?.date === today) ? `Tmrw\n${fmt12h(s.hour)}` : fmt12h(s.hour))}
                </span>

                {/* Temp chip */}
                <div style={{ width:36, height:22, borderRadius:6, background:tempColor(s.tempF), display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"rgba(0,0,0,0.7)" }}>{s.tempF.toFixed(0)}°</span>
                </div>

                {/* Humidity */}
                <span style={{ fontSize:10, color:"var(--muted)" }}>{s.humidity}%</span>

                {/* Precip */}
                <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                  <span style={{ fontSize:9 }}>{s.precipProb >= 0.4 ? "🌧" : s.precipProb >= 0.2 ? "🌦" : "☀️"}</span>
                  <span style={{ fontSize:10, color: s.precipProb >= 0.4 ? "#1D4ED8" : "var(--muted)" }}>
                    {Math.round(s.precipProb * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hasPrecip && (() => {
        const first = rainSlots[0];
        const last  = rainSlots[rainSlots.length - 1];
        const maxProb = Math.max(...rainSlots.map(s => s.precipProb));
        const firstLabel = first.date !== today ? `tomorrow ${fmt12h(first.hour)}` : fmt12h(first.hour);
        const lastLabel  = last.date  !== today ? `tomorrow ${fmt12h(last.hour)}`  : fmt12h(last.hour);
        return (
          <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, background:"#EFF6FF", border:"1px solid #BFDBFE", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14 }}>🌧</span>
            <p style={{ fontSize:12, color:"#1E3A5F" }}>
              Rain from <strong>{firstLabel}</strong> to <strong>{lastLabel}</strong> — up to <strong>{Math.round(maxProb * 100)}%</strong> chance
            </p>
          </div>
        );
      })()}
    </div>
  );
}
