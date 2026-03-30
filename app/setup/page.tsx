"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction      = "N" | "S" | "E" | "W";
type WindowSize     = "SMALL" | "MEDIUM" | "LARGE";
type GlazingType    = "SINGLE" | "DOUBLE" | "TRIPLE";
type Insulation     = "BELOW_CODE" | "AT_CODE" | "ABOVE_CODE";
type Orientation    = "NS" | "EW";
type OccupancyLevel = "EMPTY" | "ONE_TWO" | "THREE_FOUR";
type HeatSource     = "MINIMAL" | "LIGHT_ELECTRONICS" | "HOME_OFFICE" | "KITCHEN_LAUNDRY";

interface WindowEntry {
  id: string;
  size: WindowSize;
  direction: Direction;
  glazingOverride?: GlazingType;
}

interface FormData {
  // Step 1
  email: string;
  zipCode: string;
  // Step 2
  roomName: string;
  floorNumber: number;
  isTopFloor: boolean | null;
  // Step 3
  lengthFt: string;
  widthFt: string;
  ceilingHeightFt: string;
  orientation: Orientation | "";
  // Step 4
  insulationLevel: Insulation | "";
  glazingType: GlazingType | "";
  hasCrossBreeze: boolean | null;
  // Step 5
  windows: WindowEntry[];
  // Step 6
  exteriorWalls: Direction[];
  // Step 7
  occupancyLevel: OccupancyLevel | "";
  heatSourceLevel: HeatSource | "";
  // Step 8
  minTempF: number;
  maxTempF: number;
  minHumidity: number;
  maxHumidity: number;
}

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  "Your Details",
  "Room Identity",
  "Dimensions & Orientation",
  "Envelope",
  "Windows",
  "Exterior Walls",
  "Occupancy & Heat",
  "Comfort Targets",
  "Review",
];

// ─── Option data ──────────────────────────────────────────────────────────────
const INSULATION_OPTS: { value: Insulation; label: string; desc: string }[] = [
  { value: "BELOW_CODE", label: "Below Code",  desc: "Older home, minimal or no wall insulation" },
  { value: "AT_CODE",    label: "At Code",     desc: "Standard modern construction (2×6 framing)" },
  { value: "ABOVE_CODE", label: "Above Code",  desc: "Spray foam, continuous insulation, or upgraded retrofit" },
];

const GLAZING_OPTS: { value: GlazingType; label: string; desc: string; u: string }[] = [
  { value: "SINGLE", label: "Single pane", desc: "Older windows, no insulating air gap", u: "U=0.90" },
  { value: "DOUBLE", label: "Double pane", desc: "Most windows built after ~1990",        u: "U=0.30" },
  { value: "TRIPLE", label: "Triple pane", desc: "High-performance / cold-climate windows", u: "U=0.15" },
];

const WINDOW_SIZE_OPTS: { value: WindowSize; label: string; desc: string; area: string }[] = [
  { value: "SMALL",  label: "Small",  desc: "Bathroom, narrow casement", area: "≈ 4 ft²" },
  { value: "MEDIUM", label: "Medium", desc: "Standard bedroom window",   area: "≈ 10 ft²" },
  { value: "LARGE",  label: "Large",  desc: "Picture window, patio door", area: "≈ 20 ft²" },
];

const OCCUPANCY_OPTS: { value: OccupancyLevel; label: string; desc: string; rate: string }[] = [
  { value: "EMPTY",      label: "Usually empty",   desc: "Spare room, storage, occasional use", rate: "1.5 BTU/hr·ft²" },
  { value: "ONE_TWO",    label: "1–2 people",       desc: "Typical bedroom or living room",      rate: "3.5 BTU/hr·ft²" },
  { value: "THREE_FOUR", label: "3–4 people",       desc: "Common area, family room",            rate: "5.5 BTU/hr·ft²" },
];

const HEAT_OPTS: { value: HeatSource; label: string; desc: string; rate: string }[] = [
  { value: "MINIMAL",           label: "Minimal",           desc: "Phone charger, a lamp",                rate: "+0.5 BTU/hr/ft²" },
  { value: "LIGHT_ELECTRONICS", label: "Light electronics", desc: "TV, laptop, streaming device",         rate: "+1.5 BTU/hr/ft²" },
  { value: "HOME_OFFICE",       label: "Home office",       desc: "Desktop PC, multiple monitors",        rate: "+3.0 BTU/hr/ft²" },
  { value: "KITCHEN_LAUNDRY",   label: "Kitchen / laundry", desc: "Cooking appliances, washer/dryer",     rate: "+5.0 BTU/hr/ft²" },
];

const DIRECTIONS: Direction[] = ["N", "S", "E", "W"];

// ─── Shared components ────────────────────────────────────────────────────────
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="block text-sm font-semibold" style={{ color: "var(--navy)" }}>{children}</label>
      {hint && <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{hint}</p>}
    </div>
  );
}

function StepHeader({ stepNum, title, subtitle }: { stepNum: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--sky)" }}>
        Step {stepNum} of {STEPS.length}
      </p>
      <h2 className="font-display text-3xl font-semibold mb-2" style={{ color: "var(--navy)" }}>{title}</h2>
      {subtitle && <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{subtitle}</p>}
    </div>
  );
}

function RadioCard({
  selected, onClick, label, desc, badge,
}: {
  selected: boolean; onClick: () => void; label: string; desc: string; badge?: string;
}) {
  return (
    <button type="button"
      className={`option-pill w-full flex items-start gap-3 text-left ${selected ? "selected" : ""}`}
      style={{ padding: "12px 16px" }}
      onClick={onClick}
    >
      <span className="text-base leading-none mt-0.5 shrink-0">{selected ? "●" : "○"}</span>
      <span className="flex-1">
        <span className="font-semibold">{label}</span>
        {badge && (
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--sky-light)", color: "var(--sky)" }}>{badge}</span>
        )}
        <span className="block text-xs mt-0.5" style={{ color: "var(--muted)", fontWeight: 400 }}>{desc}</span>
      </span>
    </button>
  );
}

function CompassGrid({ selected, onToggle }: { selected: Direction[]; onToggle: (d: Direction) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "52px 52px 52px", gridTemplateRows: "52px 52px 52px", width: "fit-content" }}>
      <div />
      <button type="button" className={`compass-btn ${selected.includes("N") ? "selected" : ""}`} onClick={() => onToggle("N")}>N</button>
      <div />
      <button type="button" className={`compass-btn ${selected.includes("W") ? "selected" : ""}`} onClick={() => onToggle("W")}>W</button>
      <div className="flex items-center justify-center" style={{ background: "var(--cream-dark)", borderRadius: 8 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="2" fill="var(--muted)" />
          <line x1="10" y1="2" x2="10" y2="6"  stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="14" x2="10" y2="18" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2"  y1="10" x2="6"  y2="10" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="14" y1="10" x2="18" y2="10" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <button type="button" className={`compass-btn ${selected.includes("E") ? "selected" : ""}`} onClick={() => onToggle("E")}>E</button>
      <div />
      <button type="button" className={`compass-btn ${selected.includes("S") ? "selected" : ""}`} onClick={() => onToggle("S")}>S</button>
      <div />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SetupPage() {
  const router = useRouter();
  const [step, setStep]       = useState(0);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormData>({
    email: "", zipCode: "",
    roomName: "", floorNumber: 1, isTopFloor: null,
    lengthFt: "", widthFt: "", ceilingHeightFt: "", orientation: "",
    insulationLevel: "", glazingType: "", hasCrossBreeze: null,
    windows: [],
    exteriorWalls: [],
    occupancyLevel: "", heatSourceLevel: "",
    minTempF: 68, maxTempF: 74, minHumidity: 40, maxHumidity: 55,
  });

  const [pendingWin, setPendingWin] = useState<{
    size: WindowSize | ""; direction: Direction | ""; glazingOverride: GlazingType | "useRoom";
  }>({ size: "", direction: "", glazingOverride: "useRoom" });

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setError("");
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): string {
    switch (step) {
      case 0:
        if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return "Enter a valid email address.";
        if (!form.zipCode.match(/^\d{5}$/)) return "ZIP code must be 5 digits.";
        break;
      case 1:
        if (!form.roomName.trim()) return "Give this room a name.";
        if (form.floorNumber < 1) return "Floor must be at least 1.";
        if (form.isTopFloor === null) return "Indicate whether this is the top floor.";
        break;
      case 2: {
        const l = parseFloat(form.lengthFt), w = parseFloat(form.widthFt), h = parseFloat(form.ceilingHeightFt);
        if (!l || l <= 0) return "Enter a valid room length.";
        if (!w || w <= 0) return "Enter a valid room width.";
        if (!h || h <= 0 || h > 30) return "Enter a valid ceiling height (up to 30 ft).";
        if (!form.orientation) return "Select which direction the long wall of the room faces.";
        break;
      }
      case 3:
        if (!form.insulationLevel) return "Select an insulation level.";
        if (!form.glazingType) return "Select the predominant glazing type.";
        if (form.hasCrossBreeze === null) return "Indicate whether cross-breeze is possible.";
        break;
      case 4:
        if (form.windows.length === 0) return "Add at least one window.";
        break;
      case 5:
        if (form.exteriorWalls.length === 0) return "Select at least one exterior wall direction.";
        break;
      case 6:
        if (!form.occupancyLevel) return "Select a typical occupancy level.";
        if (!form.heatSourceLevel) return "Select the primary heat source.";
        break;
      case 7:
        if (form.minTempF >= form.maxTempF) return "Min temperature must be below max.";
        if (form.minHumidity >= form.maxHumidity) return "Min humidity must be below max.";
        break;
    }
    return "";
  }

  function next() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setStep(s => s + 1);
  }

  function back() { setError(""); setStep(s => s - 1); }

  // ── Window management ───────────────────────────────────────────────────────
  function addWindow() {
    if (!pendingWin.size || !pendingWin.direction) return;
    const entry: WindowEntry = {
      id: crypto.randomUUID(),
      size: pendingWin.size as WindowSize,
      direction: pendingWin.direction as Direction,
      glazingOverride: pendingWin.glazingOverride !== "useRoom"
        ? pendingWin.glazingOverride as GlazingType
        : undefined,
    };
    set("windows", [...form.windows, entry]);
    setPendingWin({ size: "", direction: "", glazingOverride: "useRoom" });
  }

  function removeWindow(id: string) {
    set("windows", form.windows.filter(w => w.id !== id));
  }

  function toggleWall(dir: Direction) {
    const walls = form.exteriorWalls.includes(dir)
      ? form.exteriorWalls.filter(d => d !== dir)
      : [...form.exteriorWalls, dir];
    set("exteriorWalls", walls);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function submit() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email, zipCode: form.zipCode,
          roomName: form.roomName.trim(),
          floorNumber: form.floorNumber,
          isTopFloor: form.isTopFloor,
          lengthFt: parseFloat(form.lengthFt),
          widthFt: parseFloat(form.widthFt),
          ceilingHeightFt: parseFloat(form.ceilingHeightFt),
          orientation: form.orientation,
          insulationLevel: form.insulationLevel,
          glazingType: form.glazingType,
          hasCrossBreeze: form.hasCrossBreeze,
          occupancyLevel: form.occupancyLevel,
          heatSourceLevel: form.heatSourceLevel,
          windows: form.windows.map(w => ({
            size: w.size, direction: w.direction,
            glazingOverride: w.glazingOverride,
          })),
          exteriorWalls: form.exteriorWalls,
          minTempF: form.minTempF, maxTempF: form.maxTempF,
          minHumidity: form.minHumidity, maxHumidity: form.maxHumidity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.push(`/dashboard/${encodeURIComponent(form.email)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step renderers ──────────────────────────────────────────────────────────
  function renderStep() {
    switch (step) {

      // ── 0: Your Details ─────────────────────────────────────────────────────
      case 0: return (
        <div className="fade-up">
          <StepHeader stepNum={1} title="Your Details" subtitle="We'll use this to send your daily window recommendations." />
          <div className="space-y-5">
            <div>
              <Label hint="Used to send you daily recommendations">Email address</Label>
              <input className="field" type="email" placeholder="you@example.com"
                value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div>
              <Label hint="Used to fetch your local weather forecast">ZIP code</Label>
              <input className="field" type="text" placeholder="10001" maxLength={5}
                value={form.zipCode} onChange={e => set("zipCode", e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
        </div>
      );

      // ── 1: Room Identity ─────────────────────────────────────────────────────
      case 1: return (
        <div className="fade-up">
          <StepHeader stepNum={2} title="Room Identity"
            subtitle="Name this room and tell us where it sits in the building. Upper floors heat up faster; top floors under a roof heat up fastest." />
          <div className="space-y-6">
            <div>
              <Label hint="E.g. Living Room, Master Bedroom, Home Office">Room name</Label>
              <input className="field" type="text" placeholder="Living Room"
                value={form.roomName} onChange={e => set("roomName", e.target.value)} />
            </div>
            <div>
              <Label hint="Ground floor = 1">Floor number</Label>
              <div className="flex items-center gap-4">
                <button type="button" className="btn-ghost"
                  style={{ width: 44, padding: "8px", textAlign: "center", fontSize: "1.2rem" }}
                  onClick={() => set("floorNumber", Math.max(1, form.floorNumber - 1))}>−</button>
                <span className="font-display text-3xl font-semibold"
                  style={{ color: "var(--navy)", minWidth: 40, textAlign: "center" }}>{form.floorNumber}</span>
                <button type="button" className="btn-ghost"
                  style={{ width: 44, padding: "8px", textAlign: "center", fontSize: "1.2rem" }}
                  onClick={() => set("floorNumber", form.floorNumber + 1)}>+</button>
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {form.floorNumber === 1 ? "Ground floor" : `Floor ${form.floorNumber}`}
                </span>
              </div>
            </div>
            <div>
              <Label hint="Is there a roof directly above this room, or another floor?">Is this the top floor?</Label>
              <div className="flex gap-3 mt-2">
                {[
                  { v: true,  label: "Yes — roof above", sub: "Higher radiant gain in summer" },
                  { v: false, label: "No — floor above",  sub: "Another conditioned space above" },
                ].map(({ v, label, sub }) => (
                  <button key={label} type="button"
                    className={`option-pill flex-1 text-left ${form.isTopFloor === v ? "selected" : ""}`}
                    style={{ padding: "12px 14px" }}
                    onClick={() => set("isTopFloor", v)}
                  >
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs mt-0.5" style={{ color: "var(--muted)", fontWeight: 400 }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      // ── 2: Dimensions & Orientation ──────────────────────────────────────────
      case 2: return (
        <div className="fade-up">
          <StepHeader stepNum={3} title="Dimensions & Orientation"
            subtitle="Approximate measurements are fine. Orientation tells us which walls get morning vs. afternoon sun." />
          <div className="space-y-5">
            {([
              { key: "lengthFt",        label: "Length",         placeholder: "15" },
              { key: "widthFt",         label: "Width",          placeholder: "12" },
              { key: "ceilingHeightFt", label: "Ceiling height", placeholder: "8"  },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key}>
                <Label>{label}</Label>
                <div className="flex items-center gap-2">
                  <input className="field" type="number" min="1" placeholder={placeholder}
                    style={{ maxWidth: 140 }}
                    value={form[key]}
                    onChange={e => set(key, e.target.value)} />
                  <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>ft</span>
                </div>
              </div>
            ))}

            {form.lengthFt && form.widthFt && form.ceilingHeightFt && (
              <div className="p-3 rounded-xl text-sm" style={{ background: "var(--sky-light)", color: "var(--navy)" }}>
                Volume: <strong>{(parseFloat(form.lengthFt) * parseFloat(form.widthFt) * parseFloat(form.ceilingHeightFt)).toLocaleString()} ft³</strong>
                &nbsp;·&nbsp;Area: <strong>{(parseFloat(form.lengthFt) * parseFloat(form.widthFt)).toLocaleString()} ft²</strong>
              </div>
            )}

            <div>
              <Label hint="Determines which walls are wider — affects how much solar exposure each wall face gets">
                Which direction does the long wall of the room run?
              </Label>
              <div className="flex gap-3 mt-2">
                {[
                  { v: "NS" as Orientation, label: "North–South", sub: `Long walls (${form.lengthFt || "L"} ft) face E/W` },
                  { v: "EW" as Orientation, label: "East–West",   sub: `Long walls (${form.lengthFt || "L"} ft) face N/S` },
                ].map(({ v, label, sub }) => (
                  <button key={v} type="button"
                    className={`option-pill flex-1 text-left ${form.orientation === v ? "selected" : ""}`}
                    style={{ padding: "12px 14px" }}
                    onClick={() => set("orientation", v)}
                  >
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs mt-0.5" style={{ color: "var(--muted)", fontWeight: 400 }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      // ── 3: Thermal Envelope ──────────────────────────────────────────────────
      case 3: return (
        <div className="fade-up">
          <StepHeader stepNum={4} title="Thermal Envelope"
            subtitle="These three factors determine how quickly heat moves through your walls and windows." />
          <div className="space-y-7">
            <div>
              <Label hint="Affects the U-value of your opaque wall surfaces">Wall insulation level</Label>
              <div className="space-y-2 mt-2">
                {INSULATION_OPTS.map(opt => (
                  <RadioCard key={opt.value} selected={form.insulationLevel === opt.value}
                    onClick={() => set("insulationLevel", opt.value)}
                    label={opt.label} desc={opt.desc} />
                ))}
              </div>
            </div>

            <div>
              <Label hint="Sets the U-value for all windows. You can override this per-window in the next step.">
                Predominant window glazing
              </Label>
              <div className="space-y-2 mt-2">
                {GLAZING_OPTS.map(opt => (
                  <RadioCard key={opt.value} selected={form.glazingType === opt.value}
                    onClick={() => set("glazingType", opt.value)}
                    label={opt.label} desc={opt.desc} badge={opt.u} />
                ))}
              </div>
            </div>

            <div>
              <Label hint="Windows on opposite or adjacent walls that allow air to flow through">
                Cross-breeze potential
              </Label>
              <div className="flex gap-3 mt-2">
                {[
                  { v: true,  label: "Yes", sub: "Windows on opposite / adjacent walls" },
                  { v: false, label: "No",  sub: "Single-aspect room" },
                ].map(({ v, label, sub }) => (
                  <button key={label} type="button"
                    className={`option-pill flex-1 text-left ${form.hasCrossBreeze === v ? "selected" : ""}`}
                    style={{ padding: "12px 14px" }}
                    onClick={() => set("hasCrossBreeze", v)}
                  >
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs mt-0.5" style={{ color: "var(--muted)", fontWeight: 400 }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      // ── 4: Windows ───────────────────────────────────────────────────────────
      case 4: return (
        <div className="fade-up">
          <StepHeader stepNum={5} title="Windows"
            subtitle="Add each window. Glazing defaults to your room setting but can be overridden per window." />
          <div className="space-y-5">
            {form.windows.length > 0 && (
              <div className="space-y-2">
                {form.windows.map((w, i) => {
                  const glazingLabel = w.glazingOverride
                    ? GLAZING_OPTS.find(g => g.value === w.glazingOverride)?.label
                    : `${GLAZING_OPTS.find(g => g.value === form.glazingType)?.label} (room default)`;
                  return (
                    <div key={w.id} className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: "var(--sky-light)", border: "1px solid var(--sky)" }}>
                      <span className="text-sm font-medium" style={{ color: "var(--navy)" }}>
                        #{i + 1} &mdash; {w.size.charAt(0) + w.size.slice(1).toLowerCase()}, faces <strong>{w.direction}</strong>
                        <span className="block text-xs mt-0.5" style={{ color: "var(--muted)", fontWeight: 400 }}>
                          {glazingLabel}
                        </span>
                      </span>
                      <button type="button" className="text-xs shrink-0"
                        style={{ color: "var(--error)" }} onClick={() => removeWindow(w.id)}>Remove</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add window panel */}
            <div className="p-4 rounded-xl space-y-4"
              style={{ background: "var(--cream)", border: "1.5px dashed var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Add a window
              </p>

              <div>
                <Label>Size</Label>
                <div className="flex gap-2 flex-wrap">
                  {WINDOW_SIZE_OPTS.map(opt => (
                    <button key={opt.value} type="button"
                      className={`option-pill ${pendingWin.size === opt.value ? "selected" : ""}`}
                      onClick={() => setPendingWin(p => ({ ...p, size: opt.value }))}
                    >
                      <span className="block font-semibold">{opt.label}</span>
                      <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>{opt.area}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label hint="Which direction does this window face?">Direction</Label>
                <CompassGrid
                  selected={pendingWin.direction ? [pendingWin.direction as Direction] : []}
                  onToggle={d => setPendingWin(p => ({ ...p, direction: p.direction === d ? "" : d }))}
                />
              </div>

              <div>
                <Label hint={`Leave as "room default" unless this window is different from the rest`}>
                  Glazing
                </Label>
                <div className="flex flex-wrap gap-2">
                  <button type="button"
                    className={`option-pill text-sm ${pendingWin.glazingOverride === "useRoom" ? "selected" : ""}`}
                    onClick={() => setPendingWin(p => ({ ...p, glazingOverride: "useRoom" }))}
                  >
                    Room default ({GLAZING_OPTS.find(g => g.value === form.glazingType)?.label ?? "—"})
                  </button>
                  {GLAZING_OPTS.filter(g => g.value !== form.glazingType).map(opt => (
                    <button key={opt.value} type="button"
                      className={`option-pill text-sm ${pendingWin.glazingOverride === opt.value ? "selected" : ""}`}
                      onClick={() => setPendingWin(p => ({ ...p, glazingOverride: opt.value }))}
                    >
                      {opt.label} ({opt.u})
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="btn-ghost"
                disabled={!pendingWin.size || !pendingWin.direction}
                onClick={addWindow}
                style={{ opacity: (!pendingWin.size || !pendingWin.direction) ? 0.45 : 1 }}
              >
                + Add this window
              </button>
            </div>
          </div>
        </div>
      );

      // ── 5: Exterior Walls ─────────────────────────────────────────────────────
      case 5: return (
        <div className="fade-up">
          <StepHeader stepNum={6} title="Exterior Walls"
            subtitle="Select every wall that faces outdoors. Interior walls facing other rooms don't count." />
          <div className="space-y-4">
            <CompassGrid selected={form.exteriorWalls} onToggle={toggleWall} />
            {form.exteriorWalls.length > 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {form.exteriorWalls.length} exterior wall{form.exteriorWalls.length > 1 ? "s" : ""}:&nbsp;
                <strong style={{ color: "var(--navy)" }}>{[...form.exteriorWalls].sort().join(", ")}</strong>
              </p>
            )}
            <div className="p-3 rounded-xl text-xs" style={{ background: "var(--cream-dark)", color: "var(--muted)" }}>
              Corner rooms will have 2; rooms in the middle of a building may have 1. Most rooms have 1–2.
            </div>
          </div>
        </div>
      );

      // ── 6: Occupancy & Heat Sources ──────────────────────────────────────────
      case 6: return (
        <div className="fade-up">
          <StepHeader stepNum={7} title="Occupancy & Heat Sources"
            subtitle="These determine how much heat the room generates on its own — a key input to the balance point formula." />
          <div className="space-y-7">
            <div>
              <Label hint="Typical number of people in this room at any given time">Typical occupancy</Label>
              <div className="space-y-2 mt-2">
                {OCCUPANCY_OPTS.map(opt => (
                  <RadioCard key={opt.value} selected={form.occupancyLevel === opt.value}
                    onClick={() => set("occupancyLevel", opt.value)}
                    label={opt.label} desc={opt.desc} badge={opt.rate} />
                ))}
              </div>
            </div>

            <div>
              <Label hint="Heat-generating devices that run regularly in this room">Primary heat source (electronics / appliances)</Label>
              <div className="space-y-2 mt-2">
                {HEAT_OPTS.map(opt => (
                  <RadioCard key={opt.value} selected={form.heatSourceLevel === opt.value}
                    onClick={() => set("heatSourceLevel", opt.value)}
                    label={opt.label} desc={opt.desc} badge={opt.rate} />
                ))}
              </div>
            </div>

            {form.occupancyLevel && form.heatSourceLevel && (
              <div className="p-3 rounded-xl text-sm" style={{ background: "var(--sky-light)", color: "var(--navy)" }}>
                {(() => {
                  const baseMap: Record<string, number> = { EMPTY: 1.5, ONE_TWO: 3.5, THREE_FOUR: 5.5 };
                  const heatMap: Record<string, number> = { MINIMAL: 0.5, LIGHT_ELECTRONICS: 1.5, HOME_OFFICE: 3.0, KITCHEN_LAUNDRY: 5.0 };
                  const floorPenalty = (form.floorNumber - 1) * 1.5 + (form.isTopFloor ? 1.5 : 0);
                  const totalRate = (baseMap[form.occupancyLevel] ?? 0) + (heatMap[form.heatSourceLevel] ?? 0) + floorPenalty;
                  const area = parseFloat(form.lengthFt) * parseFloat(form.widthFt);
                  return (
                    <>
                      Internal heat rate: <strong>{totalRate.toFixed(1)} BTU/hr·ft²</strong>
                      {area > 0 && <> &nbsp;·&nbsp; Total Q: <strong>{(totalRate * area).toFixed(0)} BTU/hr</strong></>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      );

      // ── 7: Comfort Targets ───────────────────────────────────────────────────
      case 7: return (
        <div className="fade-up">
          <StepHeader stepNum={8} title="Comfort Targets"
            subtitle="Your max temperature becomes the setpoint for the balance point formula." />
          <div className="space-y-8">
            <div>
              <Label>Temperature range</Label>
              <div className="p-5 rounded-xl space-y-5" style={{ background: "var(--sky-light)" }}>
                {[
                  { label: "Minimum", key: "minTempF" as const, val: form.minTempF, min: 55, max: 80,
                    guard: (v: number) => v < form.maxTempF },
                  { label: "Maximum", key: "maxTempF" as const, val: form.maxTempF, min: 60, max: 88,
                    guard: (v: number) => v > form.minTempF },
                ].map(({ label, key, val, min, max, guard }) => (
                  <div key={key}>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>{label}</span>
                      <span className="font-display text-2xl font-semibold" style={{ color: "var(--navy)" }}>{val}°F</span>
                    </div>
                    <input type="range" className="range-slider" min={min} max={max} step={1} value={val}
                      onChange={e => { const v = +e.target.value; if (guard(v)) set(key, v); }} />
                  </div>
                ))}
                <div className="text-center">
                  <span className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{ background: "var(--sky)", color: "white" }}>
                    {form.minTempF}° – {form.maxTempF}°F comfort zone &nbsp;·&nbsp; setpoint {form.maxTempF}°F
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Label>Humidity range</Label>
              <div className="p-5 rounded-xl space-y-5" style={{ background: "var(--sage-light)" }}>
                {[
                  { label: "Minimum", key: "minHumidity" as const, val: form.minHumidity, min: 20, max: 60,
                    guard: (v: number) => v < form.maxHumidity },
                  { label: "Maximum", key: "maxHumidity" as const, val: form.maxHumidity, min: 30, max: 80,
                    guard: (v: number) => v > form.minHumidity },
                ].map(({ label, key, val, min, max, guard }) => (
                  <div key={key}>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>{label}</span>
                      <span className="font-display text-2xl font-semibold" style={{ color: "var(--navy)" }}>{val}%</span>
                    </div>
                    <input type="range" className="range-slider" min={min} max={max} step={1} value={val}
                      onChange={e => { const v = +e.target.value; if (guard(v)) set(key, v); }} />
                  </div>
                ))}
                <div className="text-center">
                  <span className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{ background: "var(--sage)", color: "white" }}>
                    {form.minHumidity}% – {form.maxHumidity}% comfort zone
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

      // ── 8: Review ─────────────────────────────────────────────────────────────
      case 8: return (
        <div className="fade-up">
          <StepHeader stepNum={9} title="Review & Confirm" subtitle="Everything look right?" />
          <div className="space-y-3">
            {[
              {
                heading: "Your Details",
                items: [{ label: "Email", value: form.email }, { label: "ZIP", value: form.zipCode }],
              },
              {
                heading: "Room",
                items: [
                  { label: "Name",        value: form.roomName },
                  { label: "Floor",       value: `Floor ${form.floorNumber}${form.isTopFloor ? " (top floor — roof above)" : ""}` },
                  { label: "Dimensions",  value: `${form.lengthFt} × ${form.widthFt} ft, ${form.ceilingHeightFt} ft ceiling` },
                  { label: "Orientation", value: form.orientation === "NS" ? "Length runs N–S (long walls face E/W)" : "Length runs E–W (long walls face N/S)" },
                ],
              },
              {
                heading: "Thermal Envelope",
                items: [
                  { label: "Insulation",   value: INSULATION_OPTS.find(o => o.value === form.insulationLevel)?.label ?? "" },
                  { label: "Glazing",      value: GLAZING_OPTS.find(o => o.value === form.glazingType)?.label ?? "" },
                  { label: "Cross-breeze", value: form.hasCrossBreeze ? "Yes" : "No" },
                ],
              },
              {
                heading: "Windows",
                custom: (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {form.windows.map((w, i) => {
                      const gl = w.glazingOverride
                        ? GLAZING_OPTS.find(g => g.value === w.glazingOverride)?.label
                        : "room default";
                      return (
                        <span key={w.id} className="window-chip">
                          #{i + 1} {w.size.charAt(0) + w.size.slice(1).toLowerCase()} · {w.direction} · {gl}
                        </span>
                      );
                    })}
                  </div>
                ),
              },
              {
                heading: "Exterior Walls",
                items: [{ label: "Facing", value: [...form.exteriorWalls].sort().join(", ") }],
              },
              {
                heading: "Occupancy & Heat",
                items: [
                  { label: "Occupancy",    value: OCCUPANCY_OPTS.find(o => o.value === form.occupancyLevel)?.label ?? "" },
                  { label: "Heat sources", value: HEAT_OPTS.find(o => o.value === form.heatSourceLevel)?.label ?? "" },
                ],
              },
              {
                heading: "Comfort Targets",
                items: [
                  { label: "Temperature", value: `${form.minTempF}° – ${form.maxTempF}°F (setpoint ${form.maxTempF}°F)` },
                  { label: "Humidity",    value: `${form.minHumidity}% – ${form.maxHumidity}%` },
                ],
              },
            ].map(section => (
              <div key={section.heading} className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--sky)" }}>
                  {section.heading}
                </p>
                {section.custom ?? (
                  <div className="space-y-1.5">
                    {section.items?.map(item => (
                      <div key={item.label} className="flex justify-between text-sm gap-4">
                        <span style={{ color: "var(--muted)" }}>{item.label}</span>
                        <span className="font-medium text-right" style={{ color: "var(--navy)" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );

      default: return null;
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--cream)" }}>
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--white)" }}>
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--sky)" strokeWidth="1.8"/>
            <line x1="2" y1="9" x2="22" y2="9" stroke="var(--sky)" strokeWidth="1.5"/>
            <line x1="12" y1="4" x2="12" y2="20" stroke="var(--sky)" strokeWidth="1.5"/>
          </svg>
          <span className="font-display text-lg font-semibold" style={{ color: "var(--navy)" }}>Window Advisor</span>
        </div>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Room setup</span>
      </header>

      {/* Progress */}
      <div className="px-6 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--white)" }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-1 mb-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 h-1 rounded-full transition-all duration-300"
                style={{ background: i < step ? "var(--sage)" : i === step ? "var(--sky)" : "var(--border)" }} />
            ))}
          </div>
          <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
            <span>{STEPS[step]}</span>
            <span>{step + 1} / {STEPS.length}</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <main className="flex-1 px-6 py-10">
        <div className="max-w-lg mx-auto">
          {renderStep()}

          {error && (
            <div className="mt-5 px-4 py-3 rounded-xl text-sm"
              style={{ background: "var(--error-light)", color: "var(--error)" }}>
              {error}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="btn-secondary" onClick={back} disabled={step === 0}>
              ← Back
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn-primary" onClick={next}>Continue →</button>
            ) : (
              <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
                {loading ? "Saving…" : "Save & View Dashboard →"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
