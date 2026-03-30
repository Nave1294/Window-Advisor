import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cream)" }}>
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--sky)" strokeWidth="1.8"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="var(--sky)" strokeWidth="1.5"/>
            <line x1="12" y1="4" x2="12" y2="20" stroke="var(--sky)" strokeWidth="1.5"/>
          </svg>
          <span className="font-display text-xl font-semibold" style={{ color: "var(--navy)" }}>Window Advisor</span>
        </div>
        <Link href="/setup" className="btn-primary text-sm" style={{ padding: "9px 20px", borderRadius: 8, textDecoration: "none", display: "inline-block" }}>
          Get started
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: "var(--sky)" }}>
          Smart ventilation · Daily recommendations
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-semibold leading-tight mb-6" style={{ color: "var(--navy)", maxWidth: 640 }}>
          Know exactly when to open your windows
        </h1>
        <p className="text-lg mb-10" style={{ color: "var(--muted)", maxWidth: 480 }}>
          Window Advisor calculates your room's thermal balance point and cross-references it with today's forecast to give you a precise open/close schedule — delivered to your inbox each morning.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Link href="/setup"
            style={{ background: "var(--navy)", color: "white", padding: "14px 32px", borderRadius: 10, fontWeight: 600, fontSize: "0.95rem", textDecoration: "none", transition: "all 0.2s" }}
          >
            Set up my room →
          </Link>
          <Link href="/dashboard"
            style={{ color: "var(--muted)", padding: "14px 24px", fontWeight: 500, fontSize: "0.9rem", textDecoration: "none" }}
          >
            View existing rooms
          </Link>
        </div>
      </main>

      {/* Feature strip */}
      <section className="px-6 py-12" style={{ borderTop: "1px solid var(--border)", background: "var(--white)" }}>
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: "⚖️", title: "Balance point", body: "We calculate the outdoor temperature at which your room neither gains nor loses heat." },
            { icon: "🌤",  title: "Daily forecast", body: "Cross-referenced with temperature, humidity, dew point, rain probability, and wind." },
            { icon: "📬",  title: "Morning email", body: "One daily email with your open/close schedule and plain-English reasoning." },
          ].map(f => (
            <div key={f.title}>
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-display font-semibold text-lg mb-2" style={{ color: "var(--navy)" }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
