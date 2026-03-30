"use client";
import Link from "next/link";

const LOGO_SVG = (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="2" y="5" width="24" height="18" rx="4" fill="var(--sky)" opacity="0.12"/>
    <rect x="2" y="5" width="24" height="18" rx="4" stroke="var(--sky)" strokeWidth="1.5" fill="none"/>
    <line x1="2" y1="11" x2="26" y2="11" stroke="var(--sky)" strokeWidth="1.5"/>
    <line x1="14" y1="5" x2="14" y2="23" stroke="var(--sky)" strokeWidth="1.5"/>
  </svg>
);

export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header style={{
      background: "rgba(255,255,255,0.85)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "0.5px solid var(--border)",
      padding: "0 24px",
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <Link href="/" style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none" }}>
        {LOGO_SVG}
        <span style={{ fontFamily:"'Lora',serif", fontSize:16, fontWeight:600, color:"var(--navy)", letterSpacing:"-0.02em" }}>
          Window Advisor
        </span>
      </Link>
      {right && <div>{right}</div>}
    </header>
  );
}
