"use client";
import { Suspense } from "react";
import SetupPageInner from "./page-inner";

export default function SetupPage() {
  return (
    <Suspense fallback={<div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted)",fontSize:14}}>Loading…</div>}>
      <SetupPageInner />
    </Suspense>
  );
}
