"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardIndexPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function lookup() {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError("Please enter a valid email address.");
      return;
    }
    router.push(`/dashboard/${encodeURIComponent(email)}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--cream)" }}>
      <div className="card p-8 w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--sky)" strokeWidth="1.8"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="var(--sky)" strokeWidth="1.5"/>
            <line x1="12" y1="4" x2="12" y2="20" stroke="var(--sky)" strokeWidth="1.5"/>
          </svg>
          <span className="font-display font-semibold" style={{ color: "var(--navy)" }}>Window Advisor</span>
        </div>
        <h1 className="font-display text-2xl font-semibold mb-1" style={{ color: "var(--navy)" }}>View your rooms</h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>Enter the email you used during setup.</p>
        <div className="space-y-3">
          <input className="field" type="email" placeholder="you@example.com"
            value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && lookup()} />
          {error && <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>}
          <button className="btn-primary w-full" onClick={lookup}>Look up my rooms →</button>
        </div>
      </div>
    </div>
  );
}
