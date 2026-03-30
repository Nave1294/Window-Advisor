"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/app/components/AppHeader";
import type { OpenPeriod } from "@/lib/recommendation";
import type { AiringResult } from "@/lib/airing";

interface WindowChip { size:string; direction:string; }
interface Room {
  id:string; name:string; floorNumber:number;
  balancePoint:number|null;
  minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number;
  insulationLevel:string; windows:WindowChip[];
}
interface TodayRec {
  shouldOpen:boolean; openPeriods:OpenPeriod[]; reasoning:string;
  emailSent:boolean; highF?:number; lowF?:number; cityName?:string;
  airing?:AiringResult;
}
interface RoomState { room:Room; rec:TodayRec|null; loading:boolean; error:string; }

function todayLabel() { return new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}); }
function todayDate()  { return new Date().toISOString().slice(0,10); }

function Pill({ children, color="sky" }: { children:React.ReactNode; color?:"sky"|"green"|"amber"|"red"|"gray" }) {
  const map = {
    sky:   { bg:"var(--sky-light)",   border:"var(--sky-mid)",    text:"var(--sky)" },
    green: { bg:"var(--sage-light)",  border:"#A3E4B5",           text:"#1A8C3A" },
    amber: { bg:"var(--amber-light)", border:"#FFCC80",           text:"#B25C00" },
    red:   { bg:"var(--error-light)", border:"#FFAAAA",           text:"var(--error)" },
    gray:  { bg:"#F5F5F7",            border:"rgba(0,0,0,0.1)",   text:"var(--muted)" },
  }[color];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", fontSize:11, fontWeight:500, padding:"3px 9px", borderRadius:20, background:map.bg, border:`1px solid ${map.border}`, color:map.text }}>
      {children}
    </span>
  );
}

function DeleteModal({ roomName, onConfirm, onCancel, deleting }:{ roomName:string; onConfirm:()=>void; onCancel:()=>void; deleting:boolean }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(8px)" }}>
      <div className="card-raised" style={{ width:"100%", maxWidth:360, padding:28 }}>
        <h3 style={{ fontFamily:"'Lora',serif", fontSize:20, fontWeight:600, color:"var(--navy)", marginBottom:8 }}>Delete {roomName}?</h3>
        <p style={{ fontSize:14, color:"var(--muted)", marginBottom:24, lineHeight:1.6 }}>This will permanently delete this room and all its history. This cannot be undone.</p>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-secondary" style={{ flex:1 }} onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="btn-primary" style={{ flex:1, background:"var(--error)" }} onClick={onConfirm} disabled={deleting}>{deleting?"Deleting…":"Delete"}</button>
        </div>
      </div>
    </div>
  );
}

function RoomCard({ state, onRefresh, onDelete }:{ state:RoomState; onRefresh:()=>void; onDelete:()=>void }) {
  const { room, rec, loading, error } = state;
  const today = todayDate();

  return (
    <div className="card-raised" style={{ overflow:"hidden" }}>

      {/* Room header */}
      <div style={{ padding:"20px 24px 16px", borderBottom:"0.5px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16, marginBottom:12 }}>
          <div>
            <h2 style={{ fontFamily:"'Lora',serif", fontSize:20, fontWeight:600, color:"var(--navy)", marginBottom:3 }}>{room.name}</h2>
            <p style={{ fontSize:13, color:"var(--muted)" }}>Floor {room.floorNumber}</p>
          </div>
          {room.balancePoint !== null ? (
            <div style={{ textAlign:"right" }}>
              <p style={{ fontSize:11, color:"var(--muted)", marginBottom:2 }}>Balance point</p>
              <p style={{ fontFamily:"'Lora',serif", fontSize:24, fontWeight:600, color:"var(--sky)", letterSpacing:"-0.02em" }}>{room.balancePoint.toFixed(1)}°F</p>
            </div>
          ) : (
            <Pill color="amber">Calculating…</Pill>
          )}
        </div>

        {room.windows.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
            {room.windows.map((w,i) => <span key={i} className="window-chip">{w.size.charAt(0)+w.size.slice(1).toLowerCase()} · {w.direction}</span>)}
          </div>
        )}

        <div style={{ display:"flex", gap:8 }}>
          <Link href={`/edit/${room.id}`} style={{ fontSize:13, fontWeight:500, color:"var(--sky)", textDecoration:"none", padding:"6px 14px", background:"var(--sky-light)", borderRadius:8, border:"1px solid var(--sky-mid)" }}>
            Edit
          </Link>
          <button type="button" onClick={onDelete} style={{ fontSize:13, fontWeight:500, color:"var(--error)", padding:"6px 14px", background:"var(--error-light)", borderRadius:8, border:"1px solid #FFAAAA", cursor:"pointer" }}>
            Delete
          </button>
        </div>
      </div>

      {/* Recommendation body */}
      <div style={{ padding:"20px 24px" }}>
        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:10, color:"var(--muted)", fontSize:14 }}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="32" strokeDashoffset="12"/></svg>
            Fetching forecast…
          </div>
        )}

        {error && !loading && (
          <div style={{ fontSize:13, padding:"12px 16px", borderRadius:"var(--radius-sm)", background:"var(--error-light)", color:"var(--error)" }}>
            {error} <button className="btn-text" style={{ fontSize:13 }} onClick={onRefresh}>Retry</button>
          </div>
        )}

        {!loading && !error && !rec && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <p style={{ fontSize:14, color:"var(--muted)" }}>No recommendation yet for today.</p>
            <button className="btn-secondary" style={{ fontSize:13, padding:"8px 16px" }} onClick={onRefresh}>Generate</button>
          </div>
        )}

        {!loading && rec && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Forecast strip */}
            {(rec.highF != null || rec.cityName) && (
              <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:13, color:"var(--muted)" }}>
                {rec.cityName && <span>📍 {rec.cityName}</span>}
                {rec.highF != null && <span>↑{rec.highF.toFixed(0)}° · ↓{rec.lowF?.toFixed(0)}°F</span>}
              </div>
            )}

            {/* Status banner */}
            <div style={{
              borderRadius:"var(--radius-md)",
              padding:"16px 18px",
              background: rec.shouldOpen ? "var(--sage-light)" : "var(--bg-subtle)",
              border: `1px solid ${rec.shouldOpen ? "#A3E4B5" : "var(--border-mid)"}`,
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{rec.shouldOpen ? "🪟" : "🔒"}</span>
                <span style={{ fontSize:15, fontWeight:600, color:"var(--navy)" }}>
                  {rec.shouldOpen ? "Open your windows" : "Keep windows closed"}
                </span>
              </div>
              <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.55 }}>{rec.reasoning}</p>
            </div>

            {/* Open periods — today only */}
            {rec.shouldOpen && rec.openPeriods.length > 0 && (() => {
              const todayP  = rec.openPeriods.filter(p => p.startDate === today || !p.startDate);
              const futureP = rec.openPeriods.filter(p => p.startDate && p.startDate > today);
              const active  = rec.openPeriods.find(p => p.multiDay && p.startDate && p.startDate < today);
              const show    = active ? [active, ...todayP] : todayP;
              return (
                <div>
                  <p style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>
                    {show.length > 0 ? "Best times to open today" : "Active window"}
                  </p>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {show.map((p,i) => (
                      <div key={i} style={{ padding:"12px 14px", borderRadius:"var(--radius-sm)", background:"var(--sky-light)", border:"1px solid var(--sky-mid)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                          <span style={{ fontSize:14, fontWeight:600, color:"var(--navy)" }}>{p.from} – {p.to}</span>
                          {p.multiDay && <Pill color="sky">Multi-day</Pill>}
                        </div>
                        <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>{p.reason}</p>
                      </div>
                    ))}
                    {futureP.length > 0 && (
                      <p style={{ fontSize:12, color:"var(--muted)", padding:"8px 12px", background:"var(--bg-subtle)", borderRadius:"var(--radius-sm)" }}>
                        + conditions also favourable {futureP.length === 1 ? `${futureP[0].from} – ${futureP[0].to}` : `across ${futureP.length} more windows this week`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Airing */}
            {rec.airing?.needsAiring && (() => {
              const todayW = rec.airing.windows.filter(w => w.date === today);
              return (
                <div style={{ padding:"14px 16px", borderRadius:"var(--radius-md)", background:"var(--bg-subtle)", border:"0.5px solid var(--border-mid)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span>🌬</span>
                    <p style={{ fontSize:14, fontWeight:500, color:"var(--navy)" }}>Air quality</p>
                  </div>
                  <p style={{ fontSize:12, color:"var(--muted)", marginBottom:todayW.length?10:0, lineHeight:1.5 }}>{rec.airing.summary}</p>
                  {todayW.length > 0 && (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {todayW.map((w,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"var(--white)", borderRadius:"var(--radius-sm)", border:"0.5px solid var(--border)" }}>
                          <div>
                            <p style={{ fontSize:13, fontWeight:500, color:"var(--navy)" }}>{w.label}</p>
                            <p style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{w.reason}</p>
                          </div>
                          <Pill color={w.disruption === "low" ? "green" : w.disruption === "moderate" ? "amber" : "red"}>
                            {w.disruption === "low" ? "Low impact" : w.disruption === "moderate" ? "Moderate" : "High impact"}
                          </Pill>
                        </div>
                      ))}
                    </div>
                  )}
                  {todayW.length === 0 && <p style={{ fontSize:12, color:"var(--muted)" }}>No suitable slots today during occupied hours.</p>}
                </div>
              );
            })()}

            {/* Comfort targets */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                { label:"Temp target",     value:`${room.minTempF}° – ${room.maxTempF}°F` },
                { label:"Humidity target", value:`${room.minHumidity}% – ${room.maxHumidity}%` },
              ].map(item => (
                <div key={item.label} style={{ padding:"10px 14px", background:"var(--bg-subtle)", borderRadius:"var(--radius-sm)" }}>
                  <p style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>{item.label}</p>
                  <p style={{ fontSize:14, fontWeight:500, color:"var(--navy)" }}>{item.value}</p>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:"var(--muted-light)" }}>{rec.emailSent ? "✓ Email sent this morning" : "Email sends at 7 AM"}</span>
              <button className="btn-text" style={{ fontSize:13 }} onClick={onRefresh}>Refresh</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { email }   = useParams<{ email:string }>();
  const decoded     = decodeURIComponent(email);
  const [roomStates, setRoomStates]   = useState<RoomState[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError,   setPageError]   = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Room|null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const loadRec = useCallback(async (roomId:string) => {
    setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:true,error:""} : s));
    try {
      const getRes  = await fetch(`/api/rooms/${roomId}/recommend`);
      const getData = await getRes.json();
      if (getData.recommendation) {
        setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:false,rec:{
          shouldOpen:getData.recommendation.shouldOpen,
          openPeriods:getData.recommendation.openPeriods??[],
          reasoning:getData.recommendation.reasoning,
          emailSent:getData.recommendation.emailSent,
        }} : s));
        return;
      }
      const postRes  = await fetch(`/api/rooms/${roomId}/recommend`,{method:"POST"});
      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error??"Failed.");
      setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:false,rec:{
        shouldOpen:postData.recommendation.shouldOpen,
        openPeriods:postData.recommendation.openPeriods??[],
        reasoning:postData.recommendation.reasoning,
        emailSent:postData.recommendation.emailSent,
        highF:postData.forecast?.days?.[0]?.highF,
        lowF:postData.forecast?.days?.[0]?.lowF,
        cityName:postData.forecast?.cityName,
        airing:postData.airing,
      }} : s));
    } catch(err) {
      setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:false,error:err instanceof Error?err.message:"Failed."} : s));
    }
  },[]);

  useEffect(() => {
    fetch(`/api/rooms?email=${encodeURIComponent(decoded)}`)
      .then(r=>r.json())
      .then(d=>{
        if(d.error){setPageError(d.error);return;}
        const states:RoomState[]=(d.rooms as Room[]).map(room=>({room,rec:null,loading:false,error:""}));
        setRoomStates(states);
        states.forEach(s=>loadRec(s.room.id));
      })
      .catch(()=>setPageError("Failed to load rooms."))
      .finally(()=>setPageLoading(false));
  },[decoded,loadRec]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rooms/${deleteTarget.id}`,{method:"DELETE"});
      if (!res.ok) throw new Error("Delete failed.");
      setRoomStates(prev=>prev.filter(s=>s.room.id!==deleteTarget.id));
      setDeleteTarget(null);
    } catch { setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)" }}>
      {deleteTarget && <DeleteModal roomName={deleteTarget.name} onConfirm={confirmDelete} onCancel={()=>setDeleteTarget(null)} deleting={deleting}/>}

      <AppHeader right={<span style={{ fontSize:13, color:"var(--muted)" }}>{decoded}</span>}/>

      <main style={{ maxWidth:640, margin:"0 auto", padding:"32px 20px 80px" }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:28 }}>
          <div>
            <h1 style={{ fontFamily:"'Lora',serif", fontSize:28, fontWeight:600, color:"var(--navy)", letterSpacing:"-0.02em", marginBottom:4 }}>Today</h1>
            <p style={{ fontSize:13, color:"var(--muted)" }}>{todayLabel()}</p>
          </div>
          <Link href={`/setup?email=${encodeURIComponent(decoded)}`}
            style={{ fontSize:14, fontWeight:500, color:"var(--sky)", textDecoration:"none", padding:"9px 18px", background:"var(--sky-light)", borderRadius:"var(--radius-sm)", border:"1px solid var(--sky-mid)" }}>
            + Add room
          </Link>
        </div>

        {pageLoading && (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--muted)", fontSize:14 }}>Loading…</div>
        )}
        {pageError && (
          <div style={{ padding:"14px 18px", borderRadius:"var(--radius-md)", background:"var(--error-light)", color:"var(--error)", fontSize:14 }}>{pageError}</div>
        )}
        {!pageLoading && !pageError && roomStates.length === 0 && (
          <div style={{ textAlign:"center", padding:"80px 0" }}>
            <p style={{ fontSize:16, color:"var(--muted)", marginBottom:20 }}>No rooms set up yet.</p>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`} style={{ color:"var(--sky)", fontSize:15, fontWeight:500, textDecoration:"none" }}>Set up your first room →</Link>
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {roomStates.map(state => (
            <RoomCard key={state.room.id} state={state} onRefresh={()=>loadRec(state.room.id)} onDelete={()=>setDeleteTarget(state.room)}/>
          ))}
        </div>
      </main>
    </div>
  );
}
