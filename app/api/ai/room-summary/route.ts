export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { roomName, shouldOpen, openPeriods, highF, lowF, bpRange, nowHour, conditionLine } = await req.json();

  const hour = nowHour ?? 12;
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

  const bpNote = bpRange?.label
    ? `Balance point today: ${bpRange.label}. Only use if mentioning balance points.`
    : "Do not mention balance point temperatures.";

  const periodsStr = (openPeriods as {from:string;to:string}[])?.length
    ? openPeriods.map((p:{from:string;to:string}) => `${p.from}–${p.to}`).join(", ")
    : "none today";

  // conditionLine is the single source of truth for timing/action
  const condNote = conditionLine
    ? `THE FACTUAL STATUS (do not contradict this): "${conditionLine}"
Your sentence must say the same thing about timing and action as this line.`
    : "";

  const prompt = `Write ONE short natural sentence (max 16 words) about this room's ventilation. Current time: ${timeOfDay}.

Room: ${roomName}
Windows should be: ${shouldOpen ? "OPEN" : "CLOSED"}
Today's open windows (if any): ${periodsStr}
Forecast: High ${highF}°F, Low ${lowF}°F
${bpNote}

${condNote}

RULES:
- Agree exactly with the factual status line above — same timing, same action
- Only describe TODAY, not future days
- Never invent numbers not given above
- No jargon

Write only the sentence.`;

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
