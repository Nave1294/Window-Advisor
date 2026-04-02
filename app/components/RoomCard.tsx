"use client";
import { useState } from "react";
import Link from "next/link";
import type { OpenPeriod } from "@/lib/recommendation";
import type { AiringWindow } from "@/lib/airing";
import { conditionLine, airingLine } from "@/lib/condition-line";
import { DayTimeline } from "./DayTimeline";

// ── Shared types (imported by dashboard too) ──────────────────────────────────

export interface WindowChip { size:string; direction:string; }

export interface Room {
  id:string; name:string; floorNumber:number; balancePoint:number|null;
  minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number;
  windows:WindowChip[]; notificationsEnabled:boolean;
}

export interface AiringInfo {
  needsAiring:boolean; windows:AiringWindow[]; intervalMins:number; summary:string;
}

export interface TodayRec {
  shouldOpen:boolean; openPeriods:OpenPeriod[]; airingWindows:AiringWindow[]|null;
  reasoning:string; emailSent:boolean; highF?:number; lowF?:number; cityName?:string;
  airing?:AiringInfo;
  bpRange?:  { min:number; max:number; label:string };
  bpSlots?:  { hour:number; balancePt:number }[];
  forecastDays?:  { date:string; highF:number; lowF:number }[];
  forecastSlots?: { date:string; hour:number; ts:number; precipProb:number; tempF:number; humidity:number }[];
}

export interface RoomState {
  room:Room; rec:TodayRec|null; loading:boolean;
  error:string; summary:string; notifEnabled:boolean; lastRefreshed:number|null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on:boolean; onChange:(v:boolean)=>void }) {
  return (
    <button onClick={() => onChange(!on)} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:0 }}>
      <div style={{ width:36, height:20, borderRadius:10, position:"relative", background:on?"var(--sky)":"var(--border-mid)", transition:"background 0.2s ease", flexShrink:0 }}>
        <div style={{ position:"absolute", top:2, left:on?18:2, width:16, height:16, borderRadius:"50%", background:"white", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left 0.2s ease" }}/>
      </div>
      <span style={{ fontSize:13, color:on?"var(--navy)":"var(--muted)", fontWeight:on?500:400 }}>
        {on ? "Notifications on" : "Notifications off"}
      </span>
    </button>
  );
}

function DisruptionBadge({ level }: { level:"low"|"moderate"|"high" }) {
  const styles = {
    low:      { bg:"var(--sage-light)",  color:"#1A8C3A",  label:"Low impact" },
    moderate: { bg:"var(--amber-light)", color:"#B25C00",  label:"Moderate" },
    high:     { bg:"var(--error-light)", color:"var(--error)", label:"High impact" },
  }[level];
  return (
    <span style={{ fontSize:11, padding:"2px 7px", borderRadius:10, fontWeight:500, background:styles.bg, color:styles.color, flexShrink:0 }}>
      {styles.label}
    </span>
  );
}

// ── Main RoomCard ─────────────────────────────────────────────────────────────

interface Props {
  state:         RoomState;
  today:         string;
  nowHour:       number;
  onRefresh:     () => void;
  onDelete:      () => void;
  onToggleNotif: (v:boolean) => void;
}

export function RoomCard({ state, today, nowHour, onRefresh, onDelete, onToggleNotif }: Props) {
  const { room, rec, loading, error, summary, notifEnabled, lastRefreshed } = state;
  const [expanded, setExpanded] = useState(false);

  const airingWindows: AiringWindow[] = rec?.airing?.windows ?? rec?.airingWindows ?? [];
  const condLine = rec ? conditionLine(rec.shouldOpen, rec.openPeriods, today, nowHour) : "";

  const updatedLabel = lastRefreshed ? (() => {
    const mins = Math.floor((Date.now() - lastRefreshed) / 60000);
    if (mins < 1)  return "Updated just now";
    if (mins === 1) return "Updated 1 min ago";
    if (mins < 60) return `Updated ${mins} min ago`;
    return `Updated ${Math.floor(mins / 60)}h ago`;
  })() : null;

  return (
    <div className="card-raised" style={{ overflow:"hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding:"16px 20px 12px", borderBottom:"0.5px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <h2 style={{ fontFamily:"'Lora',serif", fontSize:18, fontWeight:600, color:"var(--navy)", marginBottom:2 }}>{room.name}</h2>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <p style={{ fontSize:12, color:"var(--muted)" }}>
              Floor {room.floorNumber}
              {rec?.bpRange
                ? ` · Balance point ${rec.bpRange.label}`
                : room.balancePoint != null
                  ? ` · Balance point ${room.balancePoint.toFixed(1)}°F`
                  : ""}
            </p>
            {updatedLabel && <span style={{ fontSize:11, color:"var(--muted-light)" }}>· {updatedLabel}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
          <button onClick={onRefresh} disabled={loading} title="Refresh forecast" style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            width:30, height:30, borderRadius:8, border:"0.5px solid var(--border-mid)",
            background:"var(--bg-subtle)", cursor:loading?"not-allowed":"pointer",
            opacity:loading?0.4:1, transition:"opacity 0.2s",
          }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ transform:loading?"rotate(180deg)":"none", transition:"transform 0.5s" }}>
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 4 1.7" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
              <polyline points="12,1 12,4.5 15.5,4.5" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
          <Link href={`/edit/${room.id}`} style={{ fontSize:12, fontWeight:500, color:"var(--muted)", textDecoration:"none", padding:"5px 10px", background:"var(--bg-subtle)", borderRadius:8, border:"0.5px solid var(--border-mid)" }}>Edit</Link>
          <button onClick={onDelete} style={{ fontSize:12, fontWeight:500, color:"var(--error)", padding:"5px 10px", background:"var(--error-light)", borderRadius:8, border:"0.5px solid #FFAAAA", cursor:"pointer" }}>Delete</button>
        </div>
      </div>

      <div style={{ padding:"16px 20px" }}>

        {/* ── Loading / Error / Empty states ── */}
        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--muted)", fontSize:14 }}>
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="32" strokeDashoffset="12"/>
            </svg>
            Fetching forecast…
          </div>
        )}
        {error && !loading && (
          <div style={{ fontSize:13, padding:"10px 14px", borderRadius:"var(--radius-sm)", background:"var(--error-light)", color:"var(--error)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{error}</span>
            <button className="btn-text" style={{ fontSize:13 }} onClick={onRefresh}>Retry</button>
          </div>
        )}
        {!loading && !error && !rec && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <p style={{ fontSize:14, color:"var(--muted)" }}>No recommendation yet for today.</p>
            <button className="btn-secondary" style={{ fontSize:13, padding:"7px 14px" }} onClick={onRefresh}>Generate</button>
          </div>
        )}

        {/* ── Main content ── */}
        {!loading && rec && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

            {/* Status banner */}
            <div style={{
              display:"flex", alignItems:"flex-start", gap:12, padding:"14px 16px",
              borderRadius:"var(--radius-md)",
              background:rec.shouldOpen?"var(--sage-light)":"var(--bg-subtle)",
              border:`1px solid ${rec.shouldOpen?"#A3E4B5":"var(--border-mid)"}`,
            }}>
              <span style={{ fontSize:20, flexShrink:0, marginTop:2 }}>
                {rec.shouldOpen ? (
                  // Window-open icon — SVG so it renders correctly on all platforms
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="2" width="18" height="18" rx="2" stroke="#1A8C3A" strokeWidth="1.6" fill="none"/>
                    <line x1="2" y1="11" x2="20" y2="11" stroke="#1A8C3A" strokeWidth="1.4"/>
                    <line x1="11" y1="2" x2="11" y2="20" stroke="#1A8C3A" strokeWidth="1.4"/>
                    <path d="M6 6.5 L9 8.5 L6 10.5" stroke="#1A8C3A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                ) : "🔒"}
              </span>
              <div>
                <p style={{ fontSize:14, color:"var(--navy)", lineHeight:1.5, marginBottom:summary?4:0 }}>
                  {summary || condLine}
                </p>
                {summary && (
                  <p style={{ fontSize:13, color:rec.shouldOpen?"#1A8C3A":"var(--muted)", fontWeight:500 }}>
                    {condLine}
                  </p>
                )}
              </div>
            </div>

            {/* Day timeline */}
            {(rec.bpSlots?.length ?? 0) > 0 && (
              <DayTimeline
                slots={(rec.forecastSlots ?? []).filter(s => s.date === today)}
                openPeriods={rec.openPeriods}
                airingWindows={rec.airing?.windows ?? []}
                bpSlots={rec.bpSlots ?? []}
                today={today}
                nowHour={nowHour}
                co2IntervalMins={rec.airing?.intervalMins}
              />
            )}

            {/* Air quality */}
            <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 16px", borderRadius:"var(--radius-md)", background:"var(--bg-subtle)", border:"0.5px solid var(--border-mid)" }}>
              <span style={{ fontSize:20, flexShrink:0, marginTop:2 }}>🌬</span>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14, color:"var(--navy)", marginBottom:6 }}>Air quality</p>
                {(() => {
                  const todayW = airingWindows.filter(w => w.date === today);
                  if (!todayW.length) return (
                    <p style={{ fontSize:13, color:"var(--muted)" }}>
                      {rec.shouldOpen
                        ? "Open windows provide natural ventilation today."
                        : "Air out briefly when outdoor conditions improve — check back this evening."}
                    </p>
                  );
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {todayW.slice(0, 3).map((w, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 10px", borderRadius:8, background:i===0?"var(--white)":"transparent", border:i===0?"0.5px solid var(--border)":"none" }}>
                          <div>
                            <span style={{ fontSize:13, fontWeight:i===0?600:400, color:"var(--navy)" }}>{w.label}</span>
                            {i===0 && <span style={{ fontSize:11, marginLeft:6, color:"var(--sky)" }}>Best option</span>}
                          </div>
                          <DisruptionBadge level={w.disruption}/>
                        </div>
                      ))}
                      {todayW[0]?.reason && (
                        <p style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{todayW[0].reason}</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Notifications */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:"var(--radius-sm)", background:"var(--bg-subtle)", border:"0.5px solid var(--border-mid)" }}>
              <div>
                <Toggle on={notifEnabled} onChange={onToggleNotif}/>
                {notifEnabled && (
                  <p style={{ fontSize:11, color:"var(--muted)", marginTop:4, paddingLeft:44 }}>
                    You'll get an email when conditions open or close
                  </p>
                )}
              </div>
              <span style={{ fontSize:18 }}>🔔</span>
            </div>

            {/* Why? */}
            <button onClick={() => setExpanded(e => !e)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", background:"none", border:"none", cursor:"pointer", padding:"4px 0", color:"var(--muted)" }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Why?</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform:expanded?"rotate(180deg)":"none", transition:"transform 0.2s ease" }}>
                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {expanded && (
              <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:2 }}>
                {/* Forecast context */}
                <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:12, color:"var(--muted)", padding:"8px 12px", background:"var(--bg-subtle)", borderRadius:"var(--radius-sm)" }}>
                  {rec.cityName && <span>📍 {rec.cityName}</span>}
                  {rec.highF != null && (
                    rec.lowF != null && rec.lowF !== rec.highF
                      ? <span>High {rec.highF.toFixed(0)}°F · Low {rec.lowF.toFixed(0)}°F</span>
                      : <span>Forecast {rec.highF.toFixed(0)}°F</span>
                  )}
                  {room.balancePoint != null && <span>Balance point {room.balancePoint.toFixed(1)}°F</span>}
                  <span>Comfort {room.minTempF}–{room.maxTempF}°F · {room.minHumidity}–{room.maxHumidity}% RH</span>
                </div>

                {/* Reasoning */}
                <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.6, padding:"8px 12px", background:"var(--bg-subtle)", borderRadius:"var(--radius-sm)" }}>{rec.reasoning}</p>

                {/* Open window detail */}
                {rec.shouldOpen && rec.openPeriods.filter(p => !p.startDate || p.startDate === today).length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <p style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Condition windows</p>
                    {rec.openPeriods.filter(p => !p.startDate || p.startDate === today).map((p, i) => (
                      <div key={i} style={{ padding:"10px 12px", borderRadius:"var(--radius-sm)", background:"var(--sky-light)", border:"1px solid var(--sky-mid)" }}>
                        <p style={{ fontSize:13, fontWeight:600, color:"var(--navy)", marginBottom:3 }}>
                          {p.from.replace(":00 "," ")} – {p.to.replace(":00 "," ")}
                          {p.multiDay && <span style={{ fontSize:11, marginLeft:8, color:"var(--sky)" }}>Multi-day</span>}
                        </p>
                        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>{p.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Airing detail */}
                {airingWindows.filter(w => w.date === today).length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <p style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Air quality detail</p>
                    {rec.airing?.summary && <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>{rec.airing.summary}</p>}
                    {airingWindows.filter(w => w.date === today).map((w, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"var(--bg-subtle)", borderRadius:"var(--radius-sm)", border:"0.5px solid var(--border)" }}>
                        <div>
                          <p style={{ fontSize:13, fontWeight:500, color:"var(--navy)" }}>{w.label}</p>
                          <p style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{w.reason}</p>
                        </div>
                        <DisruptionBadge level={w.disruption}/>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ paddingTop:4 }}>
                  <span style={{ fontSize:12, color:"var(--muted-light)" }}>{rec.emailSent ? "✓ Email sent this morning" : "Email sends at 7 AM"}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
