export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { roomName, shouldOpen, openPeriods, reasoning, highF, lowF, bpRange } = await req.json();

  const bpNote = bpRange?.label
    ? `Balance point today: ${bpRange.label} (shifts with room activity). Only use this exact value if mentioning balance points.`
    : "Do not mention balance point temperatures.";

  const prompt = `Write ONE short, friendly sentence (max 20 words) summarising a window recommendation. Natural, specific, no jargon.

Room: ${roomName} | ${shouldOpen?"Open":"Closed"} | High ${highF}°F Low ${lowF}°F
${openPeriods?.length ? `Good times today: ${(openPeriods as {from:string;to:string}[]).map(p=>`${p.from}–${p.to}`).join(", ")}` : ""}
Reason: ${reasoning}
${bpNote}

RULES: Never invent temperatures or numbers not given above.

Good examples:
- "Good conditions tonight from 5 PM — cool and dry for a few hours."
- "Keep them closed today — warmer and more humid outside than in."
- "Brief opening around 9 AM before the afternoon heat arrives."
- "No luck today — rain and humidity all day."

Write only the sentence.`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY??"", "anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:60, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text?.trim() ?? "" });
  } catch { return NextResponse.json({ text: "" }); }
}
