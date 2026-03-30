export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { roomName, shouldOpen, openPeriods, reasoning, highF, lowF, balancePoint } = await req.json();

  const prompt = `One short friendly sentence (max 20 words) summarising a window recommendation. Natural, specific, no jargon.

Room: ${roomName} | ${shouldOpen?"Open":"Closed"} | High ${highF}°F Low ${lowF}°F${balancePoint?` BP ${balancePoint.toFixed(1)}°F`:""}
${openPeriods?.length ? `Times: ${(openPeriods as {from:string;to:string}[]).map(p=>`${p.from}–${p.to}`).join(", ")}` : ""}
Reason: ${reasoning}

Good examples: "Good window this morning — cool and dry from 7–10 AM." / "Keep them closed — warmer and more humid outside than in." / "No luck today — rain and humidity all day."
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
