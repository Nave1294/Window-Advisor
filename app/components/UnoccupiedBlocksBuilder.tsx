"use client";
import { useState } from "react";
import type { UnoccupiedBlock } from "@/lib/schema";

const DAYS      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_SHORT = ["S","M","T","W","T","F","S"];

function fmt(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h-12} PM`;
}

interface Props {
  blocks:   UnoccupiedBlock[];
  onChange: (blocks: UnoccupiedBlock[]) => void;
}

export function UnoccupiedBlocksBuilder({ blocks, onChange }: Props) {
  const [pendingDays,  setPendingDays]  = useState<number[]>([1,2,3,4,5]);
  const [pendingStart, setPendingStart] = useState<number>(0);
  const [pendingEnd,   setPendingEnd]   = useState<number>(8);

  function toggleDay(d: number) {
    setPendingDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
    );
  }

  function addBlock() {
    if (!pendingDays.length || pendingEnd <= pendingStart) return;
    onChange([...blocks, {
      id:        crypto.randomUUID(),
      startHour: pendingStart,
      endHour:   pendingEnd,
      days:      [...pendingDays],
    }]);
  }

  function removeBlock(id: string) {
    onChange(blocks.filter(b => b.id !== id));
  }

  function dayLabel(dayIndices: number[]): string {
    const sorted = [...dayIndices].sort();
    if (sorted.length === 7) return "Every day";
    if (JSON.stringify(sorted) === JSON.stringify([1,2,3,4,5])) return "Weekdays";
    if (JSON.stringify(sorted) === JSON.stringify([0,6])) return "Weekends";
    return sorted.map(d => DAYS[d].slice(0,3)).join(", ");
  }

  const canAdd = pendingDays.length > 0 && pendingEnd > pendingStart;

  return (
    <div className="space-y-4">
      {/* Existing blocks */}
      {blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map(b => (
            <div key={b.id} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background:"var(--cream-dark)", border:"1px solid var(--border)" }}>
              <div>
                <span className="text-sm font-semibold" style={{ color:"var(--navy)" }}>
                  {fmt(b.startHour)} – {fmt(b.endHour)}
                </span>
                <span className="text-xs ml-2" style={{ color:"var(--muted)" }}>
                  {dayLabel(b.days)}
                </span>
              </div>
              <button type="button" className="text-xs" style={{ color:"var(--error)" }}
                onClick={() => removeBlock(b.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add block form */}
      <div className="p-4 rounded-xl space-y-4" style={{ background:"var(--cream)", border:"1.5px dashed var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:"var(--muted)" }}>
          Add an unoccupied window
        </p>

        {/* Day picker */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color:"var(--navy)" }}>Which days?</label>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map((day, i) => (
              <button key={i} type="button"
                onClick={() => toggleDay(i)}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: `1.5px solid ${pendingDays.includes(i) ? "var(--sky)" : "var(--border)"}`,
                  background: pendingDays.includes(i) ? "var(--sky)" : "var(--white)",
                  color: pendingDays.includes(i) ? "white" : "var(--muted)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}>
                {DAY_SHORT[i]}
              </button>
            ))}
          </div>
          {/* Quick-select shortcuts */}
          <div className="flex gap-2 mt-2">
            {[
              { label:"Weekdays", days:[1,2,3,4,5] },
              { label:"Weekends", days:[0,6] },
              { label:"Every day",days:[0,1,2,3,4,5,6] },
            ].map(({ label, days }) => (
              <button key={label} type="button"
                className="text-xs"
                style={{ color:"var(--sky)", textDecoration:"underline", cursor:"pointer", background:"none", border:"none", padding:0 }}
                onClick={() => setPendingDays(days)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color:"var(--navy)" }}>From</label>
            <select className="field text-sm" value={pendingStart}
              onChange={e => setPendingStart(+e.target.value)}>
              {Array.from({length:24},(_,i) => (
                <option key={i} value={i}>{fmt(i)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color:"var(--navy)" }}>Until</label>
            <select className="field text-sm" value={pendingEnd}
              onChange={e => setPendingEnd(+e.target.value)}>
              {Array.from({length:24},(_,i) => (
                <option key={i+1} value={i+1}>{fmt(i+1)}</option>
              ))}
            </select>
          </div>
        </div>

        {pendingEnd <= pendingStart && (
          <p className="text-xs" style={{ color:"var(--error)" }}>End time must be after start time.</p>
        )}

        <button type="button" className="btn-ghost"
          disabled={!canAdd} onClick={addBlock}
          style={{ opacity: canAdd ? 1 : 0.4 }}>
          + Add unoccupied window
        </button>
      </div>
    </div>
  );
}
