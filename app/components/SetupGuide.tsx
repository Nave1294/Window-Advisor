"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  step:     number;
  stepName: string;
  formData: Record<string, unknown>;
  trigger:  "advance" | "update" | "idle";
}

export function SetupGuide({ step, stepName, formData, trigger }: Props) {
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setVisible(false);

    fetch("/api/ai/setup-guide", {
      method:  "POST",
      headers: { "Content-Type":"application/json" },
      signal:  ctrl.signal,
      body:    JSON.stringify({ step, stepName, formData, trigger }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.text) { setText(d.text); setVisible(true); }
        setLoading(false);
      })
      .catch(e => {
        if (e.name !== "AbortError") setLoading(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, trigger]);

  if (!visible && !loading) return null;

  return (
    <div style={{
      display:"flex", alignItems:"flex-start", gap:10,
      padding:"12px 14px",
      background:"var(--sky-light)",
      border:"1px solid var(--sky-mid)",
      borderRadius:"var(--radius-md)",
      marginTop:16,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(4px)",
      transition:"opacity 0.3s ease, transform 0.3s ease",
    }}>
      {/* Claude avatar */}
      <div style={{
        width:24, height:24, borderRadius:"50%",
        background:"var(--sky)", display:"flex",
        alignItems:"center", justifyContent:"center",
        flexShrink:0, marginTop:1,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" opacity="0"/>
          <circle cx="12" cy="12" r="4" fill="white"/>
        </svg>
      </div>
      <p style={{ fontSize:13, color:"var(--sky)", lineHeight:1.5, margin:0, fontWeight:500 }}>
        {loading ? (
          <span style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
            <span style={{ display:"inline-flex", gap:3 }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  width:4, height:4, borderRadius:"50%", background:"var(--sky)", display:"inline-block",
                  animation:"pulse 1.2s ease-in-out infinite", animationDelay:`${i*0.2}s`,
                }}/>
              ))}
            </span>
          </span>
        ) : text}
      </p>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}
