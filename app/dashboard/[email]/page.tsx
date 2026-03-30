"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { OpenPeriod } from "@/lib/recommendation";
import type { AiringResult } from "@/lib/airing";

interface WindowChip { size: string; direction: string; }
interface Room {
  id: string; name: string; floorNumber: number;
  balancePoint: number | null;
  minTempF: number; maxTempF: number; minHumidity: number; maxHumidity: number;
  insulationLevel: string; windows: WindowChip[];
}
interface TodayRec {
  shouldOpen: boolean; openPeriods: OpenPeriod[]; reasoning: string;
  emailSent: boolean; highF?: number; lowF?: number; cityName?: string;
  airing?: AiringResult;
}
interface RoomState { room: Room; rec: TodayRec | null; loading: boolean; error: string; }

function insulationLabel(v: string) { return v.replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
function todayLabel() { return new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}); }
function todayDate()  { return new Date().toISOString().slice(0,10); }

function DisruptionBadge({ level }: { level: "low"|"moderate"|"high" }) {
  const styles = {
    low:      { bg:"var(--sage-light)",  border:"var(--sage)",  color:"var(--sage)",  label:"Low disruption" },
    moderate: { bg:"var(--amber-light)", border:"var(--amber)", color:"var(--amber)", label:"Moderate" },
    high:     { bg:"var(--error-light)", border:"var(--error)", color:"var(--error)", label:"High disruption" },
  }[level];
  return (
    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10, background:styles.bg, border:`1px solid ${styles.border}`, color:styles.color, fontWeight:600, whiteSpace:"nowrap" }}>
      {styles.label}
    </span>
  );
}

function DeleteModal({ roomName, onConfirm, onCancel, deleting }: { roomName:string; onConfirm:()=>void; onCancel:()=>void; deleting:boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:"rgba(26,43,60,0.5)"}}>
      <div className="card p-6 w-full max-w-sm">
        <h3 className="font-display text-xl font-semibold mb-2" style={{color:"var(--navy)"}}>Delete {roomName}?</h3>
        <p className="text-sm mb-6" style={{color:"var(--muted)"}}>This will permanently delete this room and all its recommendations. This cannot be undone.</p>
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="btn-primary flex-1" onClick={onConfirm} disabled={deleting} style={{background:"var(--error)"}}>{deleting?"Deleting…":"Delete"}</button>
        </div>
      </div>
    </div>
  );
}

function RoomCard({ state, onRefresh, onDelete }: { state:RoomState; onRefresh:()=>void; onDelete:()=>void }) {
  const { room, rec, loading, error } = state;
  const today = todayDate();

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5" style={{borderBottom:"1px solid var(--border)"}}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold" style={{color:"var(--navy)"}}>{room.name}</h2>
            <p className="text-sm mt-0.5" style={{color:"var(--muted)"}}>Floor {room.floorNumber} · {insulationLabel(room.insulationLevel)}</p>
          </div>
          <div className="shrink-0 text-right">
            {room.balancePoint !== null
              ? <><p className="text-xs" style={{color:"var(--muted)"}}>Balance point</p><p className="font-display text-2xl font-semibold" style={{color:"var(--sky)"}}>{room.balancePoint.toFixed(1)}°F</p></>
              : <span className="text-xs px-2.5 py-1 rounded-full" style={{background:"var(--amber-light)",color:"var(--amber)"}}>Calculating…</span>}
          </div>
        </div>
        {room.windows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.windows.map((w,i)=><span key={i} className="window-chip">{w.size.charAt(0)+w.size.slice(1).toLowerCase()} · {w.direction}</span>)}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Link href={`/edit/${room.id}`} style={{display:"inline-block",padding:"7px 14px",borderRadius:8,border:"1.5px solid var(--border)",fontSize:"0.8rem",fontWeight:500,color:"var(--navy)",background:"var(--cream-dark)",textDecoration:"none"}}>✏ Edit room</Link>
          <button type="button" onClick={onDelete} style={{padding:"7px 14px",borderRadius:8,border:"1.5px solid var(--border)",fontSize:"0.8rem",fontWeight:500,color:"var(--error)",background:"var(--error-light)",cursor:"pointer"}}>🗑 Delete</button>
        </div>
      </div>

      {/* Recommendation body */}
      <div className="px-6 py-5 space-y-4">
        {loading && (
          <div className="flex items-center gap-2" style={{color:"var(--muted)"}}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/></svg>
            <span className="text-sm">Fetching recommendation…</span>
          </div>
        )}
        {error && !loading && (
          <div className="text-sm px-4 py-3 rounded-xl" style={{background:"var(--error-light)",color:"var(--error)"}}>{error} <button className="ml-3 underline text-xs" onClick={onRefresh}>Retry</button></div>
        )}
        {!loading && !error && !rec && (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{color:"var(--muted)"}}>No recommendation yet for today.</p>
            <button className="btn-ghost text-sm" onClick={onRefresh} style={{padding:"8px 14px"}}>Generate</button>
          </div>
        )}

        {!loading && rec && (<>
          {/* Forecast strip */}
          {(rec.highF != null || rec.cityName) && (
            <div className="flex items-center gap-3 text-sm" style={{color:"var(--muted)"}}>
              {rec.cityName && <span>📍 {rec.cityName}</span>}
              {rec.highF != null && <span>↑ {rec.highF.toFixed(0)}°F · ↓ {rec.lowF?.toFixed(0)}°F</span>}
            </div>
          )}

          {/* Temperature recommendation */}
          <div className="rounded-xl p-4" style={{background:rec.shouldOpen?"var(--sage-light)":"var(--amber-light)",border:`1.5px solid ${rec.shouldOpen?"var(--sage)":"var(--amber)"}`}}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{rec.shouldOpen?"🪟":"🔒"}</span>
              <span className="font-semibold text-base" style={{color:"var(--navy)"}}>{rec.shouldOpen?"Open your windows":"Keep windows closed"}</span>
            </div>
            <p className="text-sm leading-relaxed" style={{color:"var(--navy)",opacity:0.8}}>{rec.reasoning}</p>
          </div>

          {/* Open periods */}
          {rec.shouldOpen && rec.openPeriods.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--muted)"}}>Best times to open</p>
              {rec.openPeriods.map((p,i) => (
                <div key={i} className="rounded-lg p-3" style={{background:"var(--sky-light)",border:"1px solid var(--sky)"}}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{color:"var(--navy)"}}>{p.from} – {p.to}</p>
                    {p.multiDay && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{background:"var(--sky-light)",color:"var(--sky)",border:"1px solid var(--sky)"}}>Multi-day</span>}
                  </div>
                  <p className="text-xs mt-1 leading-relaxed" style={{color:"var(--muted)"}}>{p.reason}</p>
                </div>
              ))}
            </div>
          )}

          {/* CO2 airing section */}
          {rec.airing?.needsAiring && (() => {
            const todayWindows = rec.airing.windows.filter(w => w.date === today);
            return (
              <div className="rounded-xl p-4 space-y-3" style={{background:"var(--white)",border:"1px solid var(--border)"}}>
                <div className="flex items-center gap-2">
                  <span className="text-base">🌬</span>
                  <div>
                    <p className="font-semibold text-sm" style={{color:"var(--navy)"}}>Air quality — brief ventilation</p>
                    <p className="text-xs" style={{color:"var(--muted)"}}>{rec.airing.summary}</p>
                  </div>
                </div>

                {todayWindows.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--muted)"}}>Open briefly (~12 min) to clear CO₂</p>
                    {todayWindows.map((w,i) => (
                      <div key={i} className="rounded-lg p-3 flex items-start justify-between gap-3" style={{background:"var(--cream)",border:"0.5px solid var(--border)"}}>
                        <div>
                          <p className="font-semibold text-sm" style={{color:"var(--navy)"}}>{w.label}</p>
                          <p className="text-xs mt-0.5 leading-relaxed" style={{color:"var(--muted)"}}>{w.reason}</p>
                        </div>
                        <DisruptionBadge level={w.disruption}/>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{color:"var(--muted)"}}>No suitable airing slots today — conditions during occupied hours aren't ideal. Try to ventilate briefly when you can.</p>
                )}
              </div>
            );
          })()}

          {/* Comfort targets */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2.5 rounded-lg" style={{background:"var(--cream)"}}><p className="text-xs" style={{color:"var(--muted)"}}>Temp target</p><p className="font-semibold mt-0.5" style={{color:"var(--navy)"}}>{room.minTempF}° – {room.maxTempF}°F</p></div>
            <div className="p-2.5 rounded-lg" style={{background:"var(--cream)"}}><p className="text-xs" style={{color:"var(--muted)"}}>Humidity target</p><p className="font-semibold mt-0.5" style={{color:"var(--navy)"}}>{room.minHumidity}% – {room.maxHumidity}%</p></div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs" style={{color:"var(--muted)"}}>{rec.emailSent ? "✓ Email sent this morning" : "Email sends at 7 AM"}</span>
            <button className="btn-ghost text-xs" onClick={onRefresh} style={{padding:"6px 12px"}}>Refresh</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { email } = useParams<{ email: string }>();
  const decoded   = decodeURIComponent(email);
  const [roomStates, setRoomStates]   = useState<RoomState[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError,   setPageError]   = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Room|null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const loadRec = useCallback(async (roomId: string) => {
    setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:true,error:""} : s));
    try {
      const getRes  = await fetch(`/api/rooms/${roomId}/recommend`);
      const getData = await getRes.json();
      if (getData.recommendation) {
        setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:false,rec:{
          shouldOpen:  getData.recommendation.shouldOpen,
          openPeriods: getData.recommendation.openPeriods ?? [],
          reasoning:   getData.recommendation.reasoning,
          emailSent:   getData.recommendation.emailSent,
        }} : s));
        return;
      }
      const postRes  = await fetch(`/api/rooms/${roomId}/recommend`,{method:"POST"});
      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error??"Failed.");
      setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:false,rec:{
        shouldOpen:  postData.recommendation.shouldOpen,
        openPeriods: postData.recommendation.openPeriods ?? [],
        reasoning:   postData.recommendation.reasoning,
        emailSent:   postData.recommendation.emailSent,
        highF:       postData.forecast?.days?.[0]?.highF,
        lowF:        postData.forecast?.days?.[0]?.lowF,
        cityName:    postData.forecast?.cityName,
        airing:      postData.airing,
      }} : s));
    } catch(err) {
      setRoomStates(prev => prev.map(s => s.room.id===roomId ? {...s,loading:false,error:err instanceof Error?err.message:"Failed."} : s));
    }
  }, []);

  useEffect(() => {
    fetch(`/api/rooms?email=${encodeURIComponent(decoded)}`)
      .then(r=>r.json())
      .then(d=>{
        if (d.error){setPageError(d.error);return;}
        const states: RoomState[] = (d.rooms as Room[]).map(room=>({room,rec:null,loading:false,error:""}));
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
    <div className="min-h-screen" style={{background:"var(--cream)"}}>
      {deleteTarget && <DeleteModal roomName={deleteTarget.name} onConfirm={confirmDelete} onCancel={()=>setDeleteTarget(null)} deleting={deleting}/>}
      <header className="px-8 py-5 flex items-center justify-between" style={{borderBottom:"1px solid var(--border)",background:"var(--white)"}}>
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--sky)" strokeWidth="1.8"/><line x1="2" y1="9" x2="22" y2="9" stroke="var(--sky)" strokeWidth="1.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="var(--sky)" strokeWidth="1.5"/></svg>
          <span className="font-display text-lg font-semibold" style={{color:"var(--navy)"}}>Window Advisor</span>
        </div>
        <span className="text-sm" style={{color:"var(--muted)"}}>{decoded}</span>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold" style={{color:"var(--navy)"}}>Today&apos;s Forecast</h1>
            <p className="text-sm mt-1" style={{color:"var(--muted)"}}>{todayLabel()}</p>
          </div>
          <Link href="/setup" style={{background:"var(--cream-dark)",color:"var(--navy)",border:"1.5px solid var(--border)",borderRadius:8,padding:"9px 16px",fontSize:"0.85rem",fontWeight:500,textDecoration:"none",display:"inline-block"}}>+ Add room</Link>
        </div>
        {pageLoading && <div className="text-center py-16"><div className="font-display text-lg" style={{color:"var(--muted)"}}>Loading…</div></div>}
        {pageError  && <div className="p-4 rounded-xl text-sm" style={{background:"var(--error-light)",color:"var(--error)"}}>{pageError}</div>}
        {!pageLoading && !pageError && roomStates.length===0 && (
          <div className="text-center py-16">
            <p className="text-lg mb-4" style={{color:"var(--muted)"}}>No rooms set up yet.</p>
            <Link href="/setup" style={{color:"var(--sky)",fontWeight:600,textDecoration:"none"}}>Set up your first room →</Link>
          </div>
        )}
        <div className="space-y-5">
          {roomStates.map(state=>(
            <RoomCard key={state.room.id} state={state} onRefresh={()=>loadRec(state.room.id)} onDelete={()=>setDeleteTarget(state.room)}/>
          ))}
        </div>
      </main>
    </div>
  );
}
