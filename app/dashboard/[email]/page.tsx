"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/app/components/AppHeader";
import { ForecastStrip } from "@/app/components/ForecastStrip";
import { RoomCard, type Room, type TodayRec, type RoomState } from "@/app/components/RoomCard";
import { conditionLine, wholeHouseLine } from "@/lib/condition-line";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", timeZone:"America/New_York" });
}
function todayDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone:"America/New_York" });
}
function nowHour() {
  return parseInt(new Date().toLocaleString("en-US", { hour:"numeric", hour12:false, timeZone:"America/New_York" }));
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ roomName, onConfirm, onCancel, deleting }: {
  roomName:string; onConfirm:()=>void; onCancel:()=>void; deleting:boolean;
}) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(8px)" }}>
      <div className="card-raised" style={{ width:"100%", maxWidth:360, padding:28 }}>
        <h3 style={{ fontFamily:"'Lora',serif", fontSize:20, fontWeight:600, color:"var(--navy)", marginBottom:8 }}>Delete {roomName}?</h3>
        <p style={{ fontSize:14, color:"var(--muted)", marginBottom:24, lineHeight:1.6 }}>This will permanently delete this room and all its history.</p>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-secondary" style={{ flex:1 }} onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="btn-primary" style={{ flex:1, background:"var(--error)" }} onClick={onConfirm} disabled={deleting}>{deleting?"Deleting…":"Delete"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Timeline legend ───────────────────────────────────────────────────────────

function TimelineLegend() {
  return (
    <div style={{ marginTop:24, padding:"14px 18px", borderRadius:"var(--radius-md)", background:"var(--white)", border:"0.5px solid var(--border)" }}>
      <p style={{ fontSize:11, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Timeline key</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"10px 20px" }}>
        {[
          { color:"#93C5FD", label:"Cool (below balance point)" },
          { color:"#A7F3D0", label:"Near balance point" },
          { color:"#FCD34D", label:"Warm (above balance point)" },
          { color:"#F87171", label:"Hot" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:14, height:10, borderRadius:3, background:color, flexShrink:0 }}/>
            <span style={{ fontSize:12, color:"var(--muted)" }}>{label}</span>
          </div>
        ))}
        {[
          { bg:"#16A34A", label:"Open window" },
          { bg:"#DC2626", label:"Close window" },
          { bg:"#1D4ED8", label:"Air out room (CO₂)" },
        ].map(({ bg, label }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:bg, border:"1.5px solid white", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", flexShrink:0 }}/>
            <span style={{ fontSize:12, color:"var(--muted)" }}>{label}</span>
          </div>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:2, height:14, borderRadius:1, background:"rgba(0,0,0,0.35)", flexShrink:0 }}/>
          <span style={{ fontSize:12, color:"var(--muted)" }}>Current hour</span>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { email } = useParams<{ email:string }>();
  const decoded   = decodeURIComponent(email);

  const [roomStates,  setRoomStates]  = useState<RoomState[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError,   setPageError]   = useState("");
  const [houseLine,   setHouseLine]   = useState("");
  const [greeting,    setGreeting]    = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Room|null>(null);
  const [deleting,    setDeleting]    = useState(false);

  // ── Load / refresh a single room recommendation ────────────────────────────

  const loadRec = useCallback(async (roomId: string, force = false) => {
    setRoomStates(prev => prev.map(s => s.room.id === roomId ? { ...s, loading:true, error:"" } : s));
    try {
      // On explicit refresh, skip the cache entirely and go straight to POST
      if (!force) {
        const getRes  = await fetch(`/api/rooms/${roomId}/recommend`);
        const getData = await getRes.json();

        if (getData.recommendation) {
          const highF   = getData.forecast?.days?.[0]?.highF;
          const lowF    = getData.forecast?.days?.[0]?.lowF;
          const bpSlots = getData.bpSlots;
          // Serve cache only if it has full data (bpSlots + valid forecast)
          const hasFullData = highF != null && lowF != null && highF !== lowF
                           && Array.isArray(bpSlots) && bpSlots.length > 0
                           && (getData.forecast?.slots?.length ?? 0) > 0;
          if (hasFullData) {
            const rec: TodayRec = {
              ...getData.recommendation,
              airing:        getData.airing,
              bpRange:       getData.bpRange,
              bpSlots,
              highF, lowF,
              cityName:      getData.forecast?.cityName,
              forecastDays:  getData.forecast?.days,
              forecastSlots: getData.forecast?.slots,
            };
            setRoomStates(prev => prev.map(s => s.room.id === roomId ? { ...s, loading:false, rec, lastRefreshed:Date.now() } : s));
            triggerSummary(roomId);
            return;
          }
        }
      }

      // No valid cache or forced refresh — fetch fresh from OWM
      const postRes  = await fetch(`/api/rooms/${roomId}/recommend`, { method:"POST" });
      const postData = await postRes.json();
      if (!postRes.ok) throw new Error(postData.error ?? "Failed.");
      const rec: TodayRec = {
        shouldOpen:    postData.recommendation.shouldOpen,
        openPeriods:   postData.recommendation.openPeriods ?? [],
        airingWindows: postData.recommendation.airingWindows ?? null,
        reasoning:     postData.recommendation.reasoning,
        emailSent:     postData.recommendation.emailSent,
        highF:         postData.forecast?.days?.[0]?.highF,
        lowF:          postData.forecast?.days?.[0]?.lowF,
        cityName:      postData.forecast?.cityName,
        airing:        postData.airing,
        bpRange:       postData.bpRange,
        bpSlots:       postData.bpSlots,
        forecastDays:  postData.forecast?.days,
        forecastSlots: postData.forecast?.slots,
      };
      setRoomStates(prev => prev.map(s => s.room.id === roomId ? { ...s, loading:false, rec, lastRefreshed:Date.now() } : s));
      triggerSummary(roomId);
    } catch (err) {
      setRoomStates(prev => prev.map(s => s.room.id === roomId ? { ...s, loading:false, error:err instanceof Error ? err.message : "Failed." } : s));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trigger AI room summary ────────────────────────────────────────────────

  function triggerSummary(roomId: string) {
    setRoomStates(prev => {
      const s = prev.find(x => x.room.id === roomId);
      if (!s?.rec) return prev;
      const today = todayDate();
      const hour  = nowHour();
      const todayPeriods = s.rec.openPeriods.filter(p => !p.startDate || p.startDate === today);
      const cLine = conditionLine(s.rec.shouldOpen, s.rec.openPeriods, today, hour);
      fetch("/api/ai/room-summary", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          roomName:      s.room.name,
          shouldOpen:    s.rec.shouldOpen,
          openPeriods:   todayPeriods,
          highF:         s.rec.highF ?? 70,
          lowF:          s.rec.lowF  ?? 55,
          bpRange:       s.rec.bpRange ?? null,
          nowHour:       hour,
          conditionLine: cLine,
        }),
      }).then(r => r.json()).then(d => {
        if (d.text) setRoomStates(p => p.map(x => x.room.id === roomId ? { ...x, summary:d.text } : x));
      }).catch(() => {});
      return prev;
    });
  }

  // ── Notification toggle ────────────────────────────────────────────────────

  async function toggleNotif(roomId: string, enabled: boolean) {
    setRoomStates(prev => prev.map(s => s.room.id === roomId ? { ...s, notifEnabled:enabled } : s));
    try {
      const res = await fetch(`/api/rooms/${roomId}/notifications`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setRoomStates(prev => prev.map(s => s.room.id === roomId ? { ...s, notifEnabled:!enabled } : s));
    }
  }

  // ── Initial room load ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/rooms?email=${encodeURIComponent(decoded)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setPageError(d.error); return; }
        const states: RoomState[] = (d.rooms as Room[]).map(room => ({
          room, rec:null, loading:false, error:"", summary:"",
          notifEnabled: room.notificationsEnabled, lastRefreshed: null,
        }));
        setRoomStates(states);
        states.forEach(s => loadRec(s.room.id));
      })
      .catch(() => setPageError("Failed to load rooms."))
      .finally(() => setPageLoading(false));
  }, [decoded, loadRec]);

  // ── House summary + greeting (fires when recs are loaded) ─────────────────

  useEffect(() => {
    const loaded = roomStates.filter(s => s.rec && !s.loading);
    if (!loaded.length) return;
    const today = todayDate();
    const hour  = nowHour();

    // Deterministic fallback
    setHouseLine(wholeHouseLine(loaded.map(s => ({
      name:s.room.name, shouldOpen:s.rec!.shouldOpen,
      openPeriods:s.rec!.openPeriods, today, nowHour:hour,
    }))));

    const first = loaded.find(s => s.rec?.cityName)?.rec;
    if (!first?.cityName) return;

    fetch("/api/ai/house-summary", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        rooms: loaded.map(s => ({
          name: s.room.name,
          shouldOpen: s.rec!.shouldOpen,
          // Pass today's open periods so AI knows if anything is actually open today
          todayPeriods: s.rec!.openPeriods.filter(p => !p.startDate || p.startDate === today),
        })),
        highF: first.highF ?? 70, lowF: first.lowF ?? 55, cityName: first.cityName,
        today,
      }),
    }).then(r => r.json()).then(d => { if (d.text) setHouseLine(d.text); }).catch(() => {});

    fetch("/api/ai/greeting", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        date:today, cityName:first.cityName, highF:first.highF??70, lowF:first.lowF??55,
        hourOfDay: hour,
        rooms: loaded.map(s => ({ shouldOpen:s.rec!.shouldOpen, bpRange:s.rec?.bpRange ?? null })),
      }),
    }).then(r => r.json()).then(d => { if (d.text) setGreeting(d.text); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomStates.map(s => !!s.rec).join(",")]);

  // ── Hourly auto-refresh ────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting("");
      setRoomStates(prev => { prev.forEach(s => loadRec(s.room.id)); return prev; });
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadRec]);

  // ── Minute tick (keeps "X min ago" fresh) ─────────────────────────────────

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // ── Delete room ────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/rooms/${deleteTarget.id}`, { method:"DELETE" });
      setRoomStates(prev => prev.filter(s => s.room.id !== deleteTarget!.id));
      setDeleteTarget(null);
    } catch { setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const today   = todayDate();
  const hour    = nowHour();
  const hasTimeline = roomStates.some(s => s.rec?.bpSlots?.length);
  const forecastSlots = roomStates.find(s => (s.rec?.forecastSlots?.length ?? 0) > 0)?.rec?.forecastSlots;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)" }}>
      {deleteTarget && (
        <DeleteModal roomName={deleteTarget.name} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} deleting={deleting}/>
      )}
      <AppHeader right={<span style={{ fontSize:13, color:"var(--muted)" }}>{decoded}</span>}/>

      <main style={{ maxWidth:640, margin:"0 auto", padding:"28px 20px 80px" }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <h1 style={{ fontFamily:"'Lora',serif", fontSize:28, fontWeight:600, color:"var(--navy)", letterSpacing:"-0.02em", marginBottom:2 }}>Today</h1>
              <p style={{ fontSize:13, color:"var(--muted)" }}>{todayLabel()}</p>
            </div>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`} style={{ fontSize:14, fontWeight:500, color:"var(--sky)", textDecoration:"none", padding:"9px 18px", background:"var(--sky-light)", borderRadius:"var(--radius-sm)", border:"1px solid var(--sky-mid)" }}>
              + Add room
            </Link>
          </div>

          {/* House summary + greeting */}
          {houseLine && (
            <div className="fade-up" style={{ padding:"14px 18px", borderRadius:"var(--radius-md)", background:"var(--white)", border:"0.5px solid var(--border-mid)", boxShadow:"var(--shadow-sm)", marginBottom:10 }}>
              <p style={{ fontSize:15, fontWeight:600, color:"var(--navy)", marginBottom:greeting?4:0 }}>{houseLine}</p>
              {greeting && <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.5 }}>{greeting}</p>}
            </div>
          )}

          {/* 24-hour forecast strip */}
          {forecastSlots && forecastSlots.length > 0 && (
            <ForecastStrip slots={forecastSlots} today={today} nowHour={hour}/>
          )}
        </div>

        {/* ── Loading / error / empty states ── */}
        {pageLoading && (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--muted)", fontSize:14 }}>Loading…</div>
        )}
        {pageError && (
          <div style={{ padding:"14px 18px", borderRadius:"var(--radius-md)", background:"var(--error-light)", color:"var(--error)", fontSize:14 }}>{pageError}</div>
        )}
        {!pageLoading && !pageError && roomStates.length === 0 && (
          <div style={{ textAlign:"center", padding:"80px 0" }}>
            <p style={{ fontSize:16, color:"var(--muted)", marginBottom:20 }}>No rooms set up yet.</p>
            <Link href={`/setup?email=${encodeURIComponent(decoded)}`} style={{ color:"var(--sky)", fontSize:15, fontWeight:500, textDecoration:"none" }}>
              Set up your first room →
            </Link>
          </div>
        )}

        {/* ── Room cards ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {roomStates.map(state => (
            <RoomCard
              key={state.room.id}
              state={state}
              today={today}
              nowHour={hour}
              onRefresh={() => loadRec(state.room.id, true)}
              onDelete={() => setDeleteTarget(state.room)}
              onToggleNotif={v => toggleNotif(state.room.id, v)}
            />
          ))}
        </div>

        {/* ── Timeline legend ── */}
        {hasTimeline && <TimelineLegend/>}
      </main>
    </div>
  );
}
