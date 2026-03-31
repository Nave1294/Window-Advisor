export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { date, cityName, highF, lowF, rooms } = await req.json();
  const dateObj   = new Date(date + "T12:00:00Z");
  const weekday   = dateObj.toLocaleDateString("en-US", { weekday:"long" });
  const monthDay  = dateObj.toLocaleDateString("en-US", { month:"long", day:"numeric" });
  const openCount = (rooms as {shouldOpen:boolean}[]).filter(r => r.shouldOpen).length;
  const total     = (rooms as unknown[]).length;

  // Build a real BP summary from actual data — never invent numbers
  const bpLines = (rooms as {shouldOpen:boolean; bpRange:{min:number;max:number;label:string}|null}[])
    .map(r => r.bpRange?.label)
    .filter(Boolean);
  const bpNote = bpLines.length
    ? `Actual balance point${bpLines.length > 1 ? "s" : ""}: ${bpLines.join(", ")}. Only reference these exact values if you mention balance points.`
    : "Do not mention balance point temperatures — no data available.";

  const prompt = `You are Window Advisor, a friendly home ventilation assistant. Write a short greeting (2-3 sentences max) for a morning dashboard.

Facts you may use:
- Date: ${weekday}, ${monthDay}
- Location: ${cityName}
- Today's forecast: High ${highF}°F, Low ${lowF}°F
- ${openCount} of ${total} room${total>1?"s":""} have good ventilation conditions today
- ${bpNote}

RULES:
- Never invent or estimate any temperatures or numbers not listed above
- Only mention balance points if you have them above, and only use those exact values
- Include ONE creative element: a holiday or observance for this date, a weather pun, a ventilation joke, or a seasonal observation
- Warm, brief, clever. No emojis. Don't be corny.`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY??"", "anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:150, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text ?? "" });
  } catch { return NextResponse.json({ text: "" }); }
}
