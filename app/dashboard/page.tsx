"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardIndexPage() {
  const [email, setEmail] = useState("");
  const [error, setError]  = useState("");
  const router = useRouter();

  function lookup() {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError("Enter a valid email address.");
      return;
    }
    router.push(`/dashboard/${encodeURIComponent(email)}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--cream)" }}>
      {/* Logo mark */}
      <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--sky)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,122,255,0.3)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="3" stroke="white" strokeWidth="2"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="white" strokeWidth="1.5"/>
            <line x1="12" y1="4" x2="12" y2="20" stroke="white" strokeWidth="1.5"/>
          </svg>
        </div>
        <span style={{ fontWeight: 600, fontSize: "1.0625rem", letterSpacing: "-0.02em", color: "var(--navy)" }}>Window Advisor</span>
      </div>

      <div className="card" style={{ width: "100%", maxWidth: 360, padding: "28px 24px" }}>
        <h1 style={{ fontWeight: 600, fontSize: "1.25rem", letterSpacing: "-0.03em", color: "var(--navy)", marginBottom: 6 }}>View your rooms</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 24, letterSpacing: "-0.01em" }}>Enter the email you used during setup.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="field"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && lookup()}
          />
          {error && <p style={{ fontSize: "0.8125rem", color: "var(--error)", letterSpacing: "-0.01em" }}>{error}</p>}
          <button className="btn-primary" onClick={lookup} style={{ width: "100%" }}>
            Open dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
