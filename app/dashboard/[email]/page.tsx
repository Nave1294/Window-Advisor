"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/app/components/AppHeader";
import type { OpenPeriod } from "@/lib/recommendation";
import type { AiringWindow } from "@/lib/airing";
import { conditionLine, airingLine, wholeHouseLine } from "@/lib/condition-line";

interface WindowChip { size:string; direction:string; }
interface Room {
  id:string; name:string; floorNumber:number; balancePoint:number|null;
  minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number;
  windows:WindowChip[]; notificationsEnabled:boolean;
}
interface AiringInfo { needsAiring:boolean; windows:AiringWindow[]; intervalMins:number; summary:string; }
interface TodayRec {
  shouldOpen:boolean; openPeriods:OpenPeriod[]; airingWindows:AiringWindow[]|null;
  reasoning:string; emailSent:boolean; highF?:number; lowF?:number; cityName?:string;
  airing?:AiringInfo;
  bpRange?: { min:number; max:number; label:string };
}
interface RoomState { room:Room; rec:TodayRec|null; loading:boolean; error:string; summary:string; notifEnabled:boolean; }

function todayLabel() {
  return new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",timeZone:"America/New_York"});
}
function todayDate() {
  return new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"}); // YYYY-MM-DD in Eastern
}
function nowHour() {
  return parseInt(new Date().toLocaleString("en-US",{hour:"numeric",hour12:false,timeZone:"America/New_York"}));
}

function Toggle({ on, onChange, label }: { on:boolean; onChange:(v:boolean)=>void; label:string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        display:"flex", alignItems:"center", gap:8,
        background:"none", border:"none", cursor:"pointer", padding:0,
      }}
    >
      <div style={{
        width:36, height:20, borderRadius:10, position:"relative",
        background: on ? "var(--sky)" : "var(--border-mid)",
        transition:"background 0.2s ease",
        flexShrink:0,
      }}>
        <div style={{
          position:"absolute", top:2, left: on ? 18 : 2,
          width:16, height:16, borderRadius:"50%", background:"white",
          boxShadow:"0 1px 3px rgba(0,0,0,0.2)",
          transition:"left 0.2s ease",
        }}/>
      </div>
      <span style={{ fontSize:13, color: on ? "var(--navy)" : "var(--muted)", fontWeight: on ? 500 : 400 }}>
        {label}
      </span>
    </button>
  );
}

function DeleteModal({ roomName,onConfirm,onCancel,deleting }:{roomName:string;onConfirm:()=>void;onCancel:()=>void;deleting:boolean}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(8px)"}}>
      <div className="card-raised" style={{width:"100%",maxWidth:360,padding:28}}>
        <h3 style={{fontFamily:"'Lora',serif",fontSize:20,fontWeight:600,color:"var(--navy)",marginBottom:8}}>Delete {roomName}?</h3>
        <p style={{fontSize:14,color:"var(--muted)",marginBottom:24,lineHeight:1.6}}>This will permanently delete this room and all its history.</p>
        <div style={{display:"flex",gap:10}}>
          <button className="btn-secondary" style={{flex:1}} onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="btn-primary" style={{flex:1,background:"var(--error)"}} onClick={onConfirm} disabled={deleting}>{deleting?"Deleting…":"Delete"}</button>
        </div>
      </div>
    </div>
  );
}

function RoomCard({ state,onRefresh,onDelete,onToggleNotif }:{
  state:RoomState; onRefresh:()=>void; onDelete:()=>void; onToggleNotif:(v:boolean)=>void;
}) {
  const { room,rec,loading,error,summary,notifEnabled } = state;
  const [expanded, setExpanded] = useState(false);
  const today = todayDate();
  const hour  = nowHour();

  const airingWindows: AiringWindow[] = rec?.airing?.windows ?? rec?.airingWindows ?? [];
  const needsAiring   = rec?.airing?.needsAiring ?? airingWindows.length > 0;
  const condLine      = rec ? conditionLine(rec.shouldOpen, rec.openPeriods, today, hour) : "";
  const airLine       = needsAiring ? airingLine(airingWindows, today, hour) : "";

  return (
    <div className="card-raised" style={{overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"16px 20px 12px",borderBottom:"0.5px solid var(--border)",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h2 style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:600,color:"var(--navy)",marginBottom:2}}>{room.name}</h2>
          <p style={{fontSize:12,color:"var(--muted)"}}>
            Floor {room.floorNumber}
            {rec?.bpRange
              ? ` · Balance point ${rec.bpRange.label}`
              : room.balancePoint!==null
                ? ` · Balance point ${room.balancePoint?.toFixed(1)}°F`
                : ""}
          </p>
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          <Link href={`/edit/${room.id}`} style={{fontSize:12,fontWeight:500,color:"var(--muted)",textDecoration:"none",padding:"5px 10px",background:"var(--bg-subtle)",borderRadius:8,border:"0.5px solid var(--border-mid)"}}>Edit</Link>
          <button onClick={onDelete} style={{fontSize:12,fontWeight:500,color:"var(--error)",padding:"5px 10px",background:"var(--error-light)",borderRadius:8,border:"0.5px solid #FFAAAA",cursor:"pointer"}}>Delete</button>
        </div>
      </div>

      <div style={{padding:"16px 20px"}}>
        {loading && (
          <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--muted)",fontSize:14}}>
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="32" strokeDashoffset="12"/></svg>
            Fetching forecast…
          </div>
        )}
        {error && !loading && (
          <div style={{fontSize:13,padding:"10px 14px",borderRadius:"var(--radius-sm)",background:"var(--error-light)",color:"var(--error)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{error}</span>
            <button className="btn-text" style={{fontSize:13}} onClick={onRefresh}>Retry</button>
          </div>
        )}
        {!loading && !error && !rec && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <p style={{fontSize:14,color:"var(--muted)"}}>No recommendation yet for today.</p>
            <button className="btn-secondary" style={{fontSize:13,padding:"7px 14px"}} onClick={onRefresh}>Generate</button>
          </div>
        )}

        {!loading && rec && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>

            {/* Temperature status */}
            <div style={{
              display:"flex",alignItems:"flex-start",gap:12,padding:"14px 16px",
              borderRadius:"var(--radius-md)",
              background:rec.shouldOpen?"var(--sage-light)":"var(--bg-subtle)",
              border:`1px solid ${rec.shouldOpen?"#A3E4B5":"var(--border-mid)"}`,
            }}>
              <span style={{fontSize:20,flexShrink:0,marginTop:2}}>{rec.shouldOpen?"🪟":"🔒"}</span>
              <div>
                <p style={{fontSize:14,color:"var(--navy)",lineHeight:1.5,marginBottom:summary?4:0}}>
                  {summary || condLine}
                </p>
                {summary && <p style={{fontSize:13,color:"#1A8C3A",fontWeight:500}}>{condLine}</p>}
              </div>
            </div>

            {/* Air quality */}
            {needsAiring && (
              <div style={{
                display:"flex",alignItems:"flex-start",gap:12,padding:"12px 16px",
                borderRadius:"var(--radius-md)",background:"var(--bg-subtle)",border:"0.5px solid var(--border-mid)",
              }}>
                <span style={{fontSize:20,flexShrink:0,marginTop:2}}>🌬</span>
                <div>
                  <p style={{fontSize:14,color:"var(--navy)",marginBottom:airLine?3:0}}>Air quality</p>
                  <p style={{fontSize:13,color:"var(--muted)",fontWeight:500}}>
                    {airLine || "No suitable slots during occupied hours today."}
                  </p>
                </div>
              </div>
            )}

            {/* Notification toggle */}
            <div style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"10px 14px",borderRadius:"var(--radius-sm)",
              background:"var(--bg-subtle)",border:"0.5px solid var(--border-mid)",
            }}>
              <div>
                <Toggle
                  on={notifEnabled}
                  onChange={onToggleNotif}
                  label={notifEnabled ? "Notifications on" : "Notifications off"}
                />
                {notifEnabled && (
                  <p style={{fontSize:11,color:"var(--muted)",marginTop:4,paddingLeft:44}}>
                    You'll get an email when conditions open or close
                  </p>
                )}
              </div>
              <span style={{fontSize:18}}>🔔</span>
            </div>

            {/* Why? toggle */}
            <button
              onClick={()=>setExpanded(e=>!e)}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"4px 0",color:"var(--muted)"}}
            >
              <span style={{fontSize:13,fontWeight:500}}>Why?</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{transform:expanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s ease"}}>
                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {expanded && (
              <div className="fade-up" style={{display:"flex",flexDirection:"column",gap:8,paddingTop:2}}>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"var(--muted)",padding:"8px 12px",background:"var(--bg-subtle)",borderRadius:"var(--radius-sm)"}}>
                  {rec.cityName && <span>📍 {rec.cityName}</span>}
                  {rec.highF!=null && <span>High {rec.highF.toFixed(0)}°F · Low {rec.lowF?.toFixed(0)}°F</span>}
                  {room.balancePoint!=null && <span>Balance point {room.balancePoint.toFixed(1)}°F</span>}
                  <span>Comfort {room.minTempF}–{room.maxTempF}°F · {room.minHumidity}–{room.maxHumidity}% RH</span>
                </div>
                <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,padding:"8px 12px",background:"var(--bg-subtle)",borderRadius:"var(--radius-sm)"}}>{rec.reasoning}</p>

                {rec.shouldOpen && rec.openPeriods.filter(p=>!p.startDate||p.startDate===today).length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <p style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Condition windows</p>
                    {rec.openPeriods.filter(p=>!p.startDate||p.startDate===today).map((p,i)=>(
                      <div key={i} style={{padding:"10px 12px",borderRadius:"var(--radius-sm)",background:"var(--sky-light)",border:"1px solid var(--sky-mid)"}}>
                        <p style={{fontSize:13,fontWeight:600,color:"var(--navy)",marginBottom:3}}>
                          {p.from.replace(":00 "," ")} – {p.to.replace(":00 "," ")}
                          {p.multiDay&&<span style={{fontSize:11,marginLeft:8,color:"var(--sky)"}}>Multi-day</span>}
                        </p>
                        <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{p.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                {needsAiring && airingWindows.filter(w=>w.date===today).length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <p style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Air quality detail</p>
                    {rec.airing?.summary && <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{rec.airing.summary}</p>}
                    {airingWindows.filter(w=>w.date===today).map((w,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"var(--bg-subtle)",borderRadius:"var(--radius-sm)",border:"0.5px solid var(--border)"}}>
                        <div>
                          <p style={{fontSize:13,fontWeight:500,color:"var(--navy)"}}>{w.label}</p>
                          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{w.reason}</p>
                        </div>
                        <span style={{fontSize:11,padding:"3px 8px",borderRadius:10,fontWeight:500,
                          background:w.disruption==="low"?"var(--sage-light)":w.disruption==="moderate"?"var(--amber-light)":"var(--error-light)",
                          color:w.disruption==="low"?"#1A8C3A":w.disruption==="moderate"?"#B25C00":"var(--error)"}}>
                          {w.disruption==="low"?"Low impact":w.disruption==="moderate"?"Moderate":"High impact"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:4}}>
                  <span style={{fontSize:12,color:"var(--muted-light)"}}>{rec.emailSent?"✓ Email sent this morning":"Email sends at 7 AM"}</span>
                  <button className="btn-text" style={{fontSize:13}} onClick={onRefresh}>Refresh</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { email }   = useParams<{email:string}>();
  const decoded     = decodeURIComponent(email);
  const [roomStates,  setRoomStates]  = useState<RoomState[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError,   setPageError]   = useState("");
  const [greeting,    setGreeting]    = useState("");
  const [houseLine,   setHouseLine]   = useState("");
  const [deleteTarget,setDeleteTarget]= useState<Room|null>(null);
  const [deleting,    setDeleting]    = useState(false);

  const loadRec = useCallback(async (roomId:string) => {
    setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:true,error:""}:s));
    try {
      const getRes  = await fetch(`/api/rooms/${roomId}/recommend`);
      const getData = await getRes.json();

      if (getData.recommendation) {
        const rec: TodayRec = {
          ...getData.recommendation,
          airing:   getData.airing,
          bpRange:  getData.bpRange,
          highF:    getData.forecast?.days?.[0]?.highF,
          lowF:     getData.forecast?.days?.[0]?.lowF,
          cityName: getData.forecast?.cityName,
        };
        setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:false,rec}:s));
        triggerSummary(roomId);
        return;
      }

      const postRes  = await fetch(`/api/rooms/${roomId}/recommend`,{method:"POST"});
      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error??"Failed.");
      const rec: TodayRec = {
        shouldOpen:    postData.recommendation.shouldOpen,
        openPeriods:   postData.recommendation.openPeriods??[],
        airingWindows: postData.recommendation.airingWindows??null,
        reasoning:     postData.recommendation.reasoning,
        emailSent:     postData.recommendation.emailSent,
        highF:         postData.forecast?.days?.[0]?.highF,
        lowF:          postData.forecast?.days?.[0]?.lowF,
        cityName:      postData.forecast?.cityName,
        airing:        postData.airing,
        bpRange:       postData.bpRange,
      };
      setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:false,rec}:s));
      triggerSummary(roomId);
    } catch(err) {
      setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:false,error:err instanceof Error?err.message:"Failed."}:s));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function triggerSummary(roomId: string) {
    setRoomStates(prev => {
      const s = prev.find(x=>x.room.id===roomId);
      if (!s?.rec) return prev;
      const today = todayDate();
      // Only pass today's periods — prevents AI from narrating future days
      const todayPeriods = s.rec.openPeriods.filter(p => !p.startDate || p.startDate === today);
      fetch("/api/ai/room-summary",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          roomName:s.room.name, shouldOpen:s.rec.shouldOpen, openPeriods:todayPeriods,
          reasoning:s.rec.reasoning, highF:s.rec.highF??70, lowF:s.rec.lowF??55,
          balancePoint:s.room.balancePoint,
          bpRange:s.rec.bpRange ?? null,
        }),
      }).then(r=>r.json()).then(d=>{
        if(d.text) setRoomStates(p=>p.map(x=>x.room.id===roomId?{...x,summary:d.text}:x));
      }).catch(()=>{});
      return prev;
    });
  }

  async function toggleNotif(roomId: string, enabled: boolean) {
    setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,notifEnabled:enabled}:s));
    try {
      const res = await fetch(`/api/rooms/${roomId}/notifications`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on failure
      setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,notifEnabled:!enabled}:s));
    }
  }

  useEffect(()=>{
    fetch(`/api/rooms?email=${encodeURIComponent(decoded)}`)
      .then(r=>r.json())
      .then(d=>{
        if(d.error){setPageError(d.error);return;}
        const states:RoomState[]=(d.rooms as Room[]).map(room=>({
          room, rec:null, loading:false, error:"", summary:"",
          notifEnabled: room.notificationsEnabled,
        }));
        setRoomStates(states);
        states.forEach(s=>loadRec(s.room.id));
      })
      .catch(()=>setPageError("Failed to load rooms."))
      .finally(()=>setPageLoading(false));
  },[decoded,loadRec]);

  // Whole-house line + greeting
  useEffect(()=>{
    const loaded = roomStates.filter(s=>s.rec&&!s.loading);
    if (!loaded.length) return;
    const today = todayDate(); const hour = nowHour();
    const rdata = loaded.map(s=>({name:s.room.name,shouldOpen:s.rec!.shouldOpen,openPeriods:s.rec!.openPeriods,today,nowHour:hour}));
    setHouseLine(wholeHouseLine(rdata));
    const first = loaded.find(s=>s.rec?.cityName)?.rec;
    if (!first?.cityName) return;
    fetch("/api/ai/house-summary",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ rooms:loaded.map(s=>({name:s.room.name,shouldOpen:s.rec!.shouldOpen})), highF:first.highF??70, lowF:first.lowF??55, cityName:first.cityName }),
    }).then(r=>r.json()).then(d=>{ if(d.text) setHouseLine(d.text); }).catch(()=>{});
    fetch("/api/ai/greeting",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          date:today, cityName:first.cityName, highF:first.highF??70, lowF:first.lowF??55,
          rooms:loaded.map(s=>({
            shouldOpen:s.rec!.shouldOpen,
            bpRange: s.rec?.bpRange ?? null,
          })),
        }),
      }).then(r=>r.json()).then(d=>{ if(d.text) setGreeting(d.text); }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roomStates.map(s=>!!s.rec).join(",")]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/rooms/${deleteTarget.id}`,{method:"DELETE"});
      setRoomStates(prev=>prev.filter(s=>s.room.id!==deleteTarget.id));
      setDeleteTarget(null);
    } catch { setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      {deleteTarget&&<DeleteModal roomName={deleteTarget.name} onConfirm={confirmDelete} onCancel={()=>setDeleteTarget(null)} deleting={deleting}/>}
      <AppHeader right={<span style={{fontSize:13,color:"var(--muted)"}}>{decoded}</span>}/>

      <main style={{maxWidth:640,margin:"0 auto",padding:"28px 20px 80px"}}>
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <h1 style={{fontFamily:"'Lora',serif",fontSize:28,fontWeight:600,color:"var(--navy)",letterSpacing:"-0.02em",marginBottom:2}}>Today</h1>
              <p style={{fontSize:13,color:"var(--muted)"}}>{todayLabel()}</p>
            </div>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`}
              style={{fontSize:14,fontWeight:500,color:"var(--sky)",textDecoration:"none",padding:"9px 18px",background:"var(--sky-light)",borderRadius:"var(--radius-sm)",border:"1px solid var(--sky-mid)"}}>
              + Add room
            </Link>
          </div>

          {houseLine && (
            <div className="fade-up" style={{padding:"14px 18px",borderRadius:"var(--radius-md)",background:"var(--white)",border:"0.5px solid var(--border-mid)",boxShadow:"var(--shadow-sm)",marginBottom:greeting?10:0}}>
              <p style={{fontSize:15,fontWeight:600,color:"var(--navy)",marginBottom:greeting?4:0}}>{houseLine}</p>
              {greeting && <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6}}>{greeting}</p>}
            </div>
          )}
        </div>

        {pageLoading && <div style={{textAlign:"center",padding:"60px 0",color:"var(--muted)",fontSize:14}}>Loading…</div>}
        {pageError  && <div style={{padding:"14px 18px",borderRadius:"var(--radius-md)",background:"var(--error-light)",color:"var(--error)",fontSize:14}}>{pageError}</div>}
        {!pageLoading&&!pageError&&roomStates.length===0&&(
          <div style={{textAlign:"center",padding:"80px 0"}}>
            <p style={{fontSize:16,color:"var(--muted)",marginBottom:20}}>No rooms set up yet.</p>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`} style={{color:"var(--sky)",fontSize:15,fontWeight:500,textDecoration:"none"}}>Set up your first room →</Link>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {roomStates.map(state=>(
            <RoomCard
              key={state.room.id}
              state={state}
              onRefresh={()=>loadRec(state.room.id)}
              onDelete={()=>setDeleteTarget(state.room)}
              onToggleNotif={v=>toggleNotif(state.room.id,v)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
