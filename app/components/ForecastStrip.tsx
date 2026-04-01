"use client";

interface SlotData {
  date:       string;
  hour:       number;
  tempF:      number;
  precipProb: number;
  humidity:   number;
}

interface Props {
  slots:  SlotData[];
  today:  string;
  nowHour: number;
}

function fmt12h(h: number): string {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Get the next 24 hours of slots rolling from nowHour
function getNext24(slots: SlotData[], today: string, nowHour: number): SlotData[] {
  const sorted = [...slots].sort((a, b) => {
    const aTs = a.date === today ? a.hour : a.hour + 24;
    const bTs = b.date === today ? b.hour : b.hour + 24;
    return aTs - bTs;
  });
  // Start from nowHour
  const startIdx = sorted.findIndex(s => s.date === today && s.hour >= nowHour);
  const from = startIdx >= 0 ? sorted.slice(startIdx) : sorted;
  return from.slice(0, 24);
}

function tempColor(tempF: number): string {
  if (tempF <= 40) return "#93C5FD";   // cold — blue
  if (tempF <= 55) return "#6EE7B7";   // cool — teal
  if (tempF <= 68) return "#A7F3D0";   // comfortable — sage
  if (tempF <= 78) return "#FDE68A";   // warm — amber
  if (tempF <= 88) return "#FCA5A5";   // hot — light red
  return "#F87171";                     // very hot — red
}

export function ForecastStrip({ slots, today, nowHour }: Props) {
  const next24 = getNext24(slots, today, nowHour);
  if (!next24.length) return null;

  const maxPrecip = Math.max(...next24.map(s => s.precipProb));
  const hasPrecip = maxPrecip >= 0.3;

  return (
    <div className="card-raised" style={{ padding:"16px 20px", marginBottom:16 }}>
      <p style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
        Next 24 hours
      </p>

      {/* Scrollable hour strip */}
      <div style={{ overflowX:"auto", overflowY:"hidden", WebkitOverflowScrolling:"touch", scrollbarWidth:"none", margin:"0 -20px", padding:"0 20px" }}>
        <div style={{ display:"flex", gap:6, width:"max-content", paddingBottom:4 }}>
          {next24.map((s, i) => {
            const isNow = s.date === today && s.hour === nowHour;
            return (
              <div key={i} style={{
                width:54, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                padding:"8px 4px", borderRadius:10,
                background: isNow ? "var(--sky-light)" : "var(--bg-subtle)",
                border: isNow ? "1px solid var(--sky-mid)" : "0.5px solid var(--border)",
              }}>
                {/* Hour label */}
                <span style={{ fontSize:10, fontWeight:isNow?700:400, color:isNow?"var(--sky)":"var(--muted-light)" }}>
                  {isNow ? "Now" : fmt12h(s.hour)}
                </span>

                {/* Temp chip */}
                <div style={{
                  width:32, height:22, borderRadius:6,
                  background:tempColor(s.tempF),
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"rgba(0,0,0,0.7)" }}>{s.tempF.toFixed(0)}°</span>
                </div>

                {/* Humidity */}
                <span style={{ fontSize:10, color:"var(--muted)" }}>{s.humidity}%</span>

                {/* Precip prob */}
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

      {/* Rain alert if significant precip in next 24h */}
      {hasPrecip && (() => {
        const THRESHOLD = 0.4;
        const rainSlots = next24.filter(s => s.precipProb >= THRESHOLD);
        const firstRain = rainSlots[0];
        const lastRain  = rainSlots[rainSlots.length - 1];
        const maxProb   = Math.max(...rainSlots.map(s => s.precipProb));
        const label = firstRain.date === today
          ? fmt12h(firstRain.hour)
          : `tomorrow ${fmt12h(firstRain.hour)}`;
        return (
          <div style={{
            marginTop:10, padding:"8px 12px", borderRadius:8,
            background:"#EFF6FF", border:"1px solid #BFDBFE",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <span style={{ fontSize:14 }}>🌧</span>
            <p style={{ fontSize:12, color:"#1E3A5F" }}>
              Rain from <strong>{label}</strong> to <strong>{fmt12h(lastRain.hour)}</strong> — up to <strong>{Math.round(maxProb * 100)}%</strong> chance
            </p>
          </div>
        );
      })()}
    </div>
  );
}
