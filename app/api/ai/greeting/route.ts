export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { date, cityName, highF, lowF, rooms, hourOfDay } = await req.json();
  const dateObj   = new Date(date + "T12:00:00Z");
  const weekday   = dateObj.toLocaleDateString("en-US", { weekday:"long" });
  const monthDay  = dateObj.toLocaleDateString("en-US", { month:"long", day:"numeric" });
  const openCount = (rooms as {shouldOpen:boolean}[]).filter(r => r.shouldOpen).length;
  const total     = (rooms as unknown[]).length;

  const hour      = hourOfDay ?? 9;
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const bpLines = (rooms as {shouldOpen:boolean; bpRange:{min:number;max:number;label:string}|null}[])
    .map(r => r.bpRange?.label).filter(Boolean);
  const bpNote = bpLines.length
    ? `Actual balance points: ${bpLines.join(", ")}. Only use these exact values if you mention balance points.`
    : "Do not mention balance point temperatures.";

  const prompt = `You are Window Advisor, a friendly home ventilation assistant. Write a short greeting (2-3 sentences max) for a dashboard being viewed in the ${timeOfDay}.

Facts you may use:
- Date: ${weekday}, ${monthDay}
- Time of day: ${timeOfDay}
- Location: ${cityName}
- Today's forecast: High ${highF}°F, Low ${lowF}°F
- ${openCount} of ${total} room${total>1?"s":""} have good ventilation conditions today
- ${bpNote}

RULES:
- Start with "${salutation}" — match the time of day exactly
- Always mention the forecast high and low temperatures naturally in the greeting
- Never invent temperatures or numbers not listed above
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
