"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router   = useRouter();
  const [email,     setEmail]     = useState("");
  const [status,    setStatus]    = useState<"idle"|"checking"|"new"|"existing">("idle");
  const [error,     setError]     = useState("");

  async function handleEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError("Enter a valid email address."); return;
    }
    setError(""); setStatus("checking");
    try {
      const res  = await fetch(`/api/check-email?email=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      setStatus(data.exists ? "existing" : "new");
    } catch {
      setError("Something went wrong. Try again."); setStatus("idle");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleEmail();
  }

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column" }}>

      {/* Nav */}
      <nav style={{ padding:"20px 32px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="5" width="24" height="18" rx="4" fill="var(--sky)" opacity="0.12"/>
            <rect x="2" y="5" width="24" height="18" rx="4" stroke="var(--sky)" strokeWidth="1.5" fill="none"/>
            <line x1="2" y1="11" x2="26" y2="11" stroke="var(--sky)" strokeWidth="1.5"/>
            <line x1="14" y1="5" x2="14" y2="23" stroke="var(--sky)" strokeWidth="1.5"/>
          </svg>
          <span style={{ fontFamily:"'Lora',serif", fontSize:17, fontWeight:600, color:"var(--navy)", letterSpacing:"-0.02em" }}>
            Window Advisor
          </span>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 24px 80px" }}>
        <div style={{ width:"100%", maxWidth:480, textAlign:"center" }}>

          {/* Badge */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"var(--sky-light)", border:"1px solid var(--sky-mid)", borderRadius:20, padding:"5px 14px", marginBottom:28 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--sky)" }}/>
            <span style={{ fontSize:12, fontWeight:500, color:"var(--sky)" }}>Smart ventilation · Daily recommendations</span>
          </div>

          {/* Heading */}
          <h1 style={{ fontFamily:"'Lora',serif", fontSize:42, fontWeight:600, color:"var(--navy)", lineHeight:1.15, letterSpacing:"-0.03em", marginBottom:16 }}>
            Know exactly when to<br/>open your windows
          </h1>

          <p style={{ fontSize:16, color:"var(--muted)", lineHeight:1.65, marginBottom:40, maxWidth:380, margin:"0 auto 40px" }}>
            Personalised open/close schedules based on your room's thermal balance point and the local forecast — delivered every morning.
          </p>

          {/* Email input card */}
          <div style={{ background:"var(--white)", borderRadius:var_radius_lg(), padding:24, boxShadow:"var(--shadow-md)", border:"0.5px solid var(--border)", marginBottom:16 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--muted)", marginBottom:8, textAlign:"left" }}>
              Enter your email to get started
            </label>
            <div style={{ display:"flex", gap:8 }}>
              <input
                className="field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setStatus("idle"); setError(""); }}
                onKeyDown={handleKeyDown}
                style={{ flex:1, marginBottom:0 }}
              />
              <button
                className="btn-primary"
                onClick={handleEmail}
                disabled={status === "checking"}
                style={{ whiteSpace:"nowrap", padding:"13px 20px" }}
              >
                {status === "checking" ? "…" : "Continue"}
              </button>
            </div>

            {error && (
              <p style={{ fontSize:13, color:"var(--error)", marginTop:8, textAlign:"left" }}>{error}</p>
            )}

            {/* Returning user */}
            {status === "existing" && (
              <div style={{ marginTop:16, padding:16, background:"var(--sky-light)", borderRadius:var_radius_sm(), border:"1px solid var(--sky-mid)" }} className="fade-up">
                <p style={{ fontSize:14, fontWeight:500, color:"var(--navy)", marginBottom:12 }}>
                  Welcome back — you have rooms set up.
                </p>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize:14, padding:"10px 18px" }}
                    onClick={() => router.push(`/dashboard/${encodeURIComponent(email.trim().toLowerCase())}`)}
                  >
                    View dashboard →
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize:14, padding:"10px 18px" }}
                    onClick={() => router.push("/setup?email=" + encodeURIComponent(email.trim().toLowerCase()))}
                  >
                    + Add a room
                  </button>
                </div>
              </div>
            )}

            {/* New user */}
            {status === "new" && (
              <div style={{ marginTop:16, padding:16, background:"var(--sage-light)", borderRadius:var_radius_sm(), border:"1px solid #A3E4B5" }} className="fade-up">
                <p style={{ fontSize:14, color:"var(--navy)", marginBottom:12 }}>
                  No account yet — set up your first room in about 3 minutes.
                </p>
                <button
                  className="btn-primary"
                  style={{ fontSize:14, padding:"10px 18px", background:"var(--sage)" }}
                  onClick={() => router.push("/setup?email=" + encodeURIComponent(email.trim().toLowerCase()))}
                >
                  Set up a room →
                </button>
              </div>
            )}
          </div>

          <p style={{ fontSize:12, color:"var(--muted-light)" }}>
            Free to use · No password required · Daily email at 7 AM
          </p>
        </div>
      </main>

      {/* Features strip */}
      <section style={{ borderTop:"0.5px solid var(--border)", background:"var(--white)", padding:"48px 24px" }}>
        <div style={{ maxWidth:720, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:32 }}>
          {[
            { icon:"⚖️", title:"Balance point", body:"We calculate the outdoor temperature at which your room neither gains nor loses heat." },
            { icon:"🌤",  title:"5-day forecast", body:"Cross-referenced with temperature, humidity, dew point, rain, and wind direction." },
            { icon:"🌬",  title:"Air quality",   body:"CO₂ airing reminders timed to your occupancy schedule — open briefly, breathe better." },
            { icon:"📬",  title:"Morning email", body:"One daily digest at 7 AM with your schedule, open windows, and plain-English reasoning." },
          ].map(f => (
            <div key={f.title} style={{ textAlign:"left" }}>
              <div style={{ fontSize:24, marginBottom:10 }}>{f.icon}</div>
              <h3 style={{ fontFamily:"'Lora',serif", fontSize:15, fontWeight:600, color:"var(--navy)", marginBottom:6 }}>{f.title}</h3>
              <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.6 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Helper — avoids template literal issues with CSS vars in inline styles
function var_radius_lg() { return "var(--radius-lg)"; }
function var_radius_sm() { return "var(--radius-sm)"; }
