export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { roomName, openPeriods, highF, lowF, bpRange, nowHour, conditionLine } = await req.json();

  const hour       = nowHour ?? 12;
  const timeOfDay  = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const hasPeriods = Array.isArray(openPeriods) && openPeriods.length > 0;

  const bpNote = bpRange?.label
    ? `Balance point: ${bpRange.label}. Only use if you mention balance points.`
    : "Do not mention balance point temperatures.";

  const periodsStr = hasPeriods
    ? (openPeriods as {from:string;to:string}[]).map(p => `${p.from}–${p.to}`).join(", ")
    : "none";

  // conditionLine is authoritative — the AI sentence must agree with it
  const condNote = conditionLine
    ? `REQUIRED — your sentence must match this exactly in timing and action:\n"${conditionLine}"`
    : "";

  const prompt = `Write ONE short conversational sentence (max 15 words) about ventilation for ${roomName} this ${timeOfDay}.

Open windows today: ${periodsStr}
Forecast: High ${highF}°F, Low ${lowF}°F
${bpNote}

${condNote}

Rules:
- Match the required line above exactly — same action, same timing
- Today only — never mention future days
- No invented numbers
- Natural, not robotic

Sentence only.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY??"", "anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:50, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text?.trim() ?? "" });
  } catch { return NextResponse.json({ text: "" }); }
}
