"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { OpenPeriod } from "@/lib/recommendation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Window { size: string; direction: string; }

interface Room {
  id: string;
  name: string;
  floorNumber: number;
  balancePoint: number | null;
  minTempF: number; maxTempF: number;
  minHumidity: number; maxHumidity: number;
  insulationLevel: string;
  windows: Window[];
}

interface TodayRec {
  shouldOpen:  boolean;
  openPeriods: OpenPeriod[];
  reasoning:   string;
  emailSent:   boolean;
  highF?: number;
  lowF?:  number;
  cityName?: string;
}

interface RoomState {
  room: Room;
  rec:  TodayRec | null;
  loading: boolean;
  error:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insulationLabel(v: string) {
  return v.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Room card ────────────────────────────────────────────────────────────────

function RoomCard({ state, onRefresh }: { state: RoomState; onRefresh: () => void }) {
  const { room, rec, loading, error } = state;

  return (
    <div className="card overflow-hidden">
      {/* Room header */}
      <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold" style={{ color: "var(--navy)" }}>
              {room.name}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
              Floor {room.floorNumber} · {insulationLabel(room.insulationLevel)} insulation
            </p>
          </div>
          <div className="text-right shrink-0">
            {room.balancePoint !== null ? (
              <>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Balance point</p>
                <p className="font-display text-2xl font-semibold" style={{ color: "var(--sky)" }}>
                  {room.balancePoint.toFixed(1)}°F
                </p>
              </>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "var(--amber-light)", color: "var(--amber)" }}>
                Calculating…
              </span>
            )}
          </div>
        </div>

        {/* Window chips */}
        {room.windows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.windows.map((w, i) => (
              <span key={i} className="window-chip">
                {w.size.charAt(0) + w.size.slice(1).toLowerCase()} · {w.direction}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Today's recommendation */}
      <div className="px-6 py-5">
        {loading && (
          <div className="flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
            <span className="text-sm">Fetching recommendation…</span>
          </div>
        )}

        {error && !loading && (
          <div className="text-sm px-4 py-3 rounded-xl" style={{ background: "var(--error-light)", color: "var(--error)" }}>
            {error}
            <button className="ml-3 underline text-xs" onClick={onRefresh}>Retry</button>
          </div>
        )}

        {!loading && !error && !rec && (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--muted)" }}>No recommendation yet for today.</p>
            <button className="btn-ghost text-sm" onClick={onRefresh} style={{ padding: "8px 14px" }}>
              Generate
            </button>
          </div>
        )}

        {!loading && rec && (
          <div className="space-y-4">
            {/* Forecast strip */}
            {(rec.highF != null || rec.cityName) && (
              <div className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
                {rec.cityName && <span>📍 {rec.cityName}</span>}
                {rec.highF != null && (
                  <span>↑ {rec.highF.toFixed(0)}°F · ↓ {rec.lowF?.toFixed(0)}°F</span>
                )}
              </div>
            )}

            {/* Status banner */}
            <div className="rounded-xl p-4"
              style={{
                background: rec.shouldOpen ? "var(--sage-light)" : "var(--amber-light)",
                border: `1.5px solid ${rec.shouldOpen ? "var(--sage)" : "var(--amber)"}`,
              }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{rec.shouldOpen ? "🪟" : "🔒"}</span>
                <span className="font-semibold text-base" style={{ color: "var(--navy)" }}>
                  {rec.shouldOpen ? "Open your windows" : "Keep windows closed"}
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--navy)", opacity: 0.8 }}>
                {rec.reasoning}
              </p>
            </div>

            {/* Open periods */}
            {rec.shouldOpen && rec.openPeriods.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Best times to open
                </p>
                {rec.openPeriods.map((p, i) => (
                  <div key={i} className="rounded-lg p-3"
                    style={{ background: "var(--sky-light)", border: "1px solid var(--sky)" }}>
                    <p className="font-semibold text-sm" style={{ color: "var(--navy)" }}>
                      {p.from} – {p.to}
                    </p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                      {p.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Comfort targets */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2.5 rounded-lg" style={{ background: "var(--cream)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Temp target</p>
                <p className="font-semibold mt-0.5" style={{ color: "var(--navy)" }}>
                  {room.minTempF}° – {room.maxTempF}°F
                </p>
              </div>
              <div className="p-2.5 rounded-lg" style={{ background: "var(--cream)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Humidity target</p>
                <p className="font-semibold mt-0.5" style={{ color: "var(--navy)" }}>
                  {room.minHumidity}% – {room.maxHumidity}%
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {rec.emailSent ? "✓ Email sent this morning" : "Email sends at 7 AM"}
              </span>
              <button className="btn-ghost text-xs" onClick={onRefresh} style={{ padding: "6px 12px" }}>
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { email }  = useParams<{ email: string }>();
  const decoded    = decodeURIComponent(email);
  const [roomStates, setRoomStates] = useState<RoomState[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError,   setPageError]   = useState("");

  // Load a recommendation for one room — generate if missing
  const loadRec = useCallback(async (roomId: string) => {
    setRoomStates(prev => prev.map(s =>
      s.room.id === roomId ? { ...s, loading: true, error: "" } : s
    ));

    try {
      // First check if today's rec already exists
      const getRes  = await fetch(`/api/rooms/${roomId}/recommend`);
      const getData = await getRes.json();

      if (getData.recommendation) {
        setRoomStates(prev => prev.map(s =>
          s.room.id === roomId ? { ...s, loading: false, rec: {
            shouldOpen:  getData.recommendation.shouldOpen,
            openPeriods: getData.recommendation.openPeriods ?? [],
            reasoning:   getData.recommendation.reasoning,
            emailSent:   getData.recommendation.emailSent,
          }} : s
        ));
        return;
      }

      // None yet — generate it
      const postRes  = await fetch(`/api/rooms/${roomId}/recommend`, { method: "POST" });
      const postData = await postRes.json();

      if (!postRes.ok) throw new Error(postData.error ?? "Failed to generate recommendation.");

      setRoomStates(prev => prev.map(s =>
        s.room.id === roomId ? { ...s, loading: false, rec: {
          shouldOpen:  postData.recommendation.shouldOpen,
          openPeriods: postData.recommendation.openPeriods
            ? JSON.parse(postData.recommendation.openPeriods)
            : [],
          reasoning:   postData.recommendation.reasoning,
          emailSent:   postData.recommendation.emailSent,
          highF:       postData.forecast?.highF,
          lowF:        postData.forecast?.lowF,
          cityName:    postData.forecast?.cityName,
        }} : s
      ));
    } catch (err) {
      setRoomStates(prev => prev.map(s =>
        s.room.id === roomId
          ? { ...s, loading: false, error: err instanceof Error ? err.message : "Failed." }
          : s
      ));
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetch(`/api/rooms?email=${encodeURIComponent(decoded)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setPageError(d.error); return; }
        const states: RoomState[] = (d.rooms as Room[]).map(room => ({
          room, rec: null, loading: false, error: "",
        }));
        setRoomStates(states);
        // Kick off recommendation loads in parallel
        states.forEach(s => loadRec(s.room.id));
      })
      .catch(() => setPageError("Failed to load rooms."))
      .finally(() => setPageLoading(false));
  }, [decoded, loadRec]);

  return (
    <div className="min-h-screen" style={{ background: "var(--cream)" }}>
      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--white)" }}>
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--sky)" strokeWidth="1.8"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="var(--sky)" strokeWidth="1.5"/>
            <line x1="12" y1="4" x2="12" y2="20" stroke="var(--sky)" strokeWidth="1.5"/>
          </svg>
          <span className="font-display text-lg font-semibold" style={{ color: "var(--navy)" }}>
            Window Advisor
          </span>
        </div>
        <span className="text-sm" style={{ color: "var(--muted)" }}>{decoded}</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--navy)" }}>
              Today's Forecast
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{todayLabel()}</p>
          </div>
          <Link href="/setup"
            style={{
              background: "var(--cream-dark)", color: "var(--navy)",
              border: "1.5px solid var(--border)", borderRadius: 8,
              padding: "9px 16px", fontSize: "0.85rem", fontWeight: 500,
              textDecoration: "none", display: "inline-block",
            }}>
            + Add room
          </Link>
        </div>

        {/* States */}
        {pageLoading && (
          <div className="text-center py-16" style={{ color: "var(--muted)" }}>
            <div className="font-display text-lg">Loading…</div>
          </div>
        )}

        {pageError && (
          <div className="p-4 rounded-xl text-sm"
            style={{ background: "var(--error-light)", color: "var(--error)" }}>
            {pageError}
          </div>
        )}

        {!pageLoading && !pageError && roomStates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-lg mb-4" style={{ color: "var(--muted)" }}>No rooms set up yet.</p>
            <Link href="/setup" style={{ color: "var(--sky)", fontWeight: 600, textDecoration: "none" }}>
              Set up your first room →
            </Link>
          </div>
        )}

        <div className="space-y-5">
          {roomStates.map(state => (
            <RoomCard
              key={state.room.id}
              state={state}
              onRefresh={() => loadRec(state.room.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
