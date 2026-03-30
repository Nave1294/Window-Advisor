"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/app/components/AppHeader";
import type { OpenPeriod } from "@/lib/recommendation";
import type { AiringResult } from "@/lib/airing";

interface WindowChip { size:string; direction:string; }
interface Room { id:string; name:string; floorNumber:number; balancePoint:number|null; minTempF:number; maxTempF:number; minHumidity:number; maxHumidity:number; insulationLevel:string; windows:WindowChip[]; }
interface TodayRec { shouldOpen:boolean; openPeriods:OpenPeriod[]; reasoning:string; emailSent:boolean; highF?:number; lowF?:number; cityName?:string; airing?:AiringResult; }
interface RoomState { room:Room; rec:TodayRec|null; loading:boolean; error:string; summary:string; }

function todayLabel() { return new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}); }
function todayDate()  { return new Date().toISOString().slice(0,10); }
function fmtT(s:string){ return s.replace(":00 "," "); }

function openLine(periods:OpenPeriod[], today:string): string {
  const t = periods.filter(p=>!p.startDate||p.startDate===today);
  if (!t.length) { const f=periods[0]; return f?`Opens ${fmtT(f.from)}`:""; }
  return t.map(p=>`${fmtT(p.from)} – ${fmtT(p.to)}`).join(" and ");
}

function airingLine(a:AiringResult, today:string): string {
  const w = a.windows.filter(w=>w.date===today);
  if (!w.length) return "No suitable slots today";
  return w.map(w=>fmtT(w.label.split("–")[0].trim())).join(", ");
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

function RoomCard({ state,onRefresh,onDelete }:{state:RoomState;onRefresh:()=>void;onDelete:()=>void}) {
  const { room,rec,loading,error,summary } = state;
  const [expanded, setExpanded] = useState(false);
  const today = todayDate();

  return (
    <div className="card-raised" style={{overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"16px 20px 12px",borderBottom:"0.5px solid var(--border)",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h2 style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:600,color:"var(--navy)",marginBottom:2}}>{room.name}</h2>
          <p style={{fontSize:12,color:"var(--muted)"}}>Floor {room.floorNumber}{room.balancePoint!==null?` · Balance point ${room.balancePoint.toFixed(1)}°F`:""}</p>
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

            {/* Window status — icon + conversational sentence + times */}
            <div style={{
              display:"flex",alignItems:"flex-start",gap:12,
              padding:"14px 16px",
              borderRadius:"var(--radius-md)",
              background:rec.shouldOpen?"var(--sage-light)":"var(--bg-subtle)",
              border:`1px solid ${rec.shouldOpen?"#A3E4B5":"var(--border-mid)"}`,
            }}>
              <span style={{fontSize:22,flexShrink:0,marginTop:1}}>{rec.shouldOpen?"🪟":"🔒"}</span>
              <div>
                {summary ? (
                  <p style={{fontSize:14,color:"var(--navy)",lineHeight:1.5,marginBottom:rec.shouldOpen&&rec.openPeriods.length?4:0}}>
                    {summary}
                  </p>
                ) : (
                  <p style={{fontSize:14,fontWeight:600,color:"var(--navy)",marginBottom:rec.shouldOpen&&rec.openPeriods.length?4:0}}>
                    {rec.shouldOpen?"Open windows today":"Keep windows closed today"}
                  </p>
                )}
                {rec.shouldOpen && rec.openPeriods.length>0 && (
                  <p style={{fontSize:13,color:"#1A8C3A",fontWeight:500}}>{openLine(rec.openPeriods,today)}</p>
                )}
              </div>
            </div>

            {/* Air quality — always show */}
            {rec.airing?.needsAiring && (
              <div style={{
                display:"flex",alignItems:"flex-start",gap:12,
                padding:"12px 16px",
                borderRadius:"var(--radius-md)",
                background:"var(--bg-subtle)",
                border:"0.5px solid var(--border-mid)",
              }}>
                <span style={{fontSize:20,flexShrink:0,marginTop:1}}>🌬</span>
                <div>
                  <p style={{fontSize:14,color:"var(--navy)",marginBottom:2}}>Air out briefly</p>
                  <p style={{fontSize:13,color:"var(--muted)",fontWeight:500}}>{airingLine(rec.airing,today)}</p>
                </div>
              </div>
            )}

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

            {/* Expanded detail */}
            {expanded && (
              <div className="fade-up" style={{display:"flex",flexDirection:"column",gap:8,paddingTop:2}}>

                {/* Forecast strip */}
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"var(--muted)",padding:"8px 12px",background:"var(--bg-subtle)",borderRadius:"var(--radius-sm)"}}>
                  {rec.cityName && <span>📍 {rec.cityName}</span>}
                  {rec.highF!=null && <span>High {rec.highF.toFixed(0)}°F · Low {rec.lowF?.toFixed(0)}°F</span>}
                  {room.balancePoint!=null && <span>Balance point {room.balancePoint.toFixed(1)}°F</span>}
                  <span>Comfort {room.minTempF}–{room.maxTempF}°F · {room.minHumidity}–{room.maxHumidity}% RH</span>
                </div>

                {/* Reasoning */}
                <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,padding:"8px 12px",background:"var(--bg-subtle)",borderRadius:"var(--radius-sm)"}}>{rec.reasoning}</p>

                {/* Open period detail */}
                {rec.shouldOpen && rec.openPeriods.length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <p style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Open window detail</p>
                    {rec.openPeriods.filter(p=>!p.startDate||p.startDate===today).map((p,i)=>(
                      <div key={i} style={{padding:"10px 12px",borderRadius:"var(--radius-sm)",background:"var(--sky-light)",border:"1px solid var(--sky-mid)"}}>
                        <p style={{fontSize:13,fontWeight:600,color:"var(--navy)",marginBottom:3}}>{fmtT(p.from)} – {fmtT(p.to)}{p.multiDay&&<span style={{fontSize:11,marginLeft:8,color:"var(--sky)"}}>Multi-day</span>}</p>
                        <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{p.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Airing detail */}
                {rec.airing?.needsAiring && rec.airing.windows.filter(w=>w.date===today).length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <p style={{fontSize:11,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Air quality detail</p>
                    <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{rec.airing.summary}</p>
                    {rec.airing.windows.filter(w=>w.date===today).map((w,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"var(--bg-subtle)",borderRadius:"var(--radius-sm)",border:"0.5px solid var(--border)"}}>
                        <div>
                          <p style={{fontSize:13,fontWeight:500,color:"var(--navy)"}}>{w.label}</p>
                          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{w.reason}</p>
                        </div>
                        <span style={{fontSize:11,padding:"3px 8px",borderRadius:10,background:w.disruption==="low"?"var(--sage-light)":w.disruption==="moderate"?"var(--amber-light)":"var(--error-light)",color:w.disruption==="low"?"#1A8C3A":w.disruption==="moderate"?"#B25C00":"var(--error)",fontWeight:500}}>
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
  const [deleteTarget,setDeleteTarget]= useState<Room|null>(null);
  const [deleting,    setDeleting]    = useState(false);

  const loadRec = useCallback(async (roomId:string) => {
    setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:true,error:""}:s));
    try {
      const getRes  = await fetch(`/api/rooms/${roomId}/recommend`);
      const getData = await getRes.json();
      if (getData.recommendation) {
        setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:false,rec:{
          shouldOpen:getData.recommendation.shouldOpen,
          openPeriods:getData.recommendation.openPeriods??[],
          reasoning:getData.recommendation.reasoning,
          emailSent:getData.recommendation.emailSent,
        }}:s));
        return;
      }
      const postRes  = await fetch(`/api/rooms/${roomId}/recommend`,{method:"POST"});
      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error??"Failed.");
      const rec:TodayRec = {
        shouldOpen:postData.recommendation.shouldOpen,
        openPeriods:postData.recommendation.openPeriods??[],
        reasoning:postData.recommendation.reasoning,
        emailSent:postData.recommendation.emailSent,
        highF:postData.forecast?.days?.[0]?.highF,
        lowF:postData.forecast?.days?.[0]?.lowF,
        cityName:postData.forecast?.cityName,
        airing:postData.airing,
      };
      setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:false,rec}:s));

      // Generate conversational summary
      fetch("/api/ai/room-summary",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          roomName: roomStates.find(s=>s.room.id===roomId)?.room.name ?? "",
          shouldOpen:rec.shouldOpen,
          openPeriods:rec.openPeriods,
          reasoning:rec.reasoning,
          highF:rec.highF,
          lowF:rec.lowF,
          balancePoint: null,
        }),
      }).then(r=>r.json()).then(d=>{
        if(d.text) setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,summary:d.text}:s));
      }).catch(()=>{});

    } catch(err) {
      setRoomStates(prev=>prev.map(s=>s.room.id===roomId?{...s,loading:false,error:err instanceof Error?err.message:"Failed."}:s));
    }
  },[]);

  useEffect(()=>{
    fetch(`/api/rooms?email=${encodeURIComponent(decoded)}`)
      .then(r=>r.json())
      .then(d=>{
        if(d.error){setPageError(d.error);return;}
        const states:RoomState[]=(d.rooms as Room[]).map(room=>({room,rec:null,loading:false,error:"",summary:""}));
        setRoomStates(states);
        states.forEach(s=>loadRec(s.room.id));
      })
      .catch(()=>setPageError("Failed to load rooms."))
      .finally(()=>setPageLoading(false));
  },[decoded,loadRec]);

  // Load greeting after rooms are loaded
  useEffect(()=>{
    if (pageLoading || roomStates.length===0) return;
    const today = todayDate();
    const rooms = roomStates.map(s=>({shouldOpen:s.rec?.shouldOpen??false}));
    const first = roomStates.find(s=>s.rec?.cityName)?.rec;
    if (!first) return;
    fetch("/api/ai/greeting",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ date:today, cityName:first.cityName??"", highF:first.highF??70, lowF:first.lowF??55, rooms }),
    }).then(r=>r.json()).then(d=>{ if(d.text) setGreeting(d.text); }).catch(()=>{});
  },[pageLoading, roomStates.map(s=>s.rec?.cityName).join(",")]);

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

  // Generate summaries once recs are loaded
  useEffect(()=>{
    roomStates.forEach(s=>{
      if (!s.rec || s.summary || s.loading) return;
      fetch("/api/ai/room-summary",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          roomName:s.room.name,
          shouldOpen:s.rec.shouldOpen,
          openPeriods:s.rec.openPeriods,
          reasoning:s.rec.reasoning,
          highF:s.rec.highF??70,
          lowF:s.rec.lowF??55,
          balancePoint:s.room.balancePoint,
        }),
      }).then(r=>r.json()).then(d=>{
        if(d.text) setRoomStates(prev=>prev.map(p=>p.room.id===s.room.id?{...p,summary:d.text}:p));
      }).catch(()=>{});
    });
  },[roomStates.map(s=>s.rec?.shouldOpen).join(",")]);

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      {deleteTarget&&<DeleteModal roomName={deleteTarget.name} onConfirm={confirmDelete} onCancel={()=>setDeleteTarget(null)} deleting={deleting}/>}
      <AppHeader right={<span style={{fontSize:13,color:"var(--muted)"}}>{decoded}</span>}/>

      <main style={{maxWidth:640,margin:"0 auto",padding:"28px 20px 80px"}}>

        {/* Date + greeting */}
        <div style={{marginBottom:28}}>
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:greeting?10:0}}>
            <div>
              <h1 style={{fontFamily:"'Lora',serif",fontSize:28,fontWeight:600,color:"var(--navy)",letterSpacing:"-0.02em",marginBottom:2}}>Today</h1>
              <p style={{fontSize:13,color:"var(--muted)"}}>{todayLabel()}</p>
            </div>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`}
              style={{fontSize:14,fontWeight:500,color:"var(--sky)",textDecoration:"none",padding:"9px 18px",background:"var(--sky-light)",borderRadius:"var(--radius-sm)",border:"1px solid var(--sky-mid)"}}>
              + Add room
            </Link>
          </div>
          {greeting && (
            <p className="fade-up" style={{fontSize:14,color:"var(--muted)",lineHeight:1.65,marginTop:10,paddingTop:10,borderTop:"0.5px solid var(--border)"}}>
              {greeting}
            </p>
          )}
        </div>

        {pageLoading && <div style={{textAlign:"center",padding:"60px 0",color:"var(--muted)",fontSize:14}}>Loading…</div>}
        {pageError  && <div style={{padding:"14px 18px",borderRadius:"var(--radius-md)",background:"var(--error-light)",color:"var(--error)",fontSize:14}}>{pageError}</div>}
        {!pageLoading && !pageError && roomStates.length===0 && (
          <div style={{textAlign:"center",padding:"80px 0"}}>
            <p style={{fontSize:16,color:"var(--muted)",marginBottom:20}}>No rooms set up yet.</p>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`} style={{color:"var(--sky)",fontSize:15,fontWeight:500,textDecoration:"none"}}>Set up your first room →</Link>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {roomStates.map(state=>(
            <RoomCard key={state.room.id} state={state} onRefresh={()=>loadRec(state.room.id)} onDelete={()=>setDeleteTarget(state.room)}/>
          ))}
        </div>
      </main>
    </div>
  );
}
