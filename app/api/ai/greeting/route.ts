export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { date, cityName, highF, lowF, rooms } = await req.json();
  const dateObj  = new Date(date + "T12:00:00Z");
  const weekday  = dateObj.toLocaleDateString("en-US", { weekday:"long" });
  const monthDay = dateObj.toLocaleDateString("en-US", { month:"long", day:"numeric" });
  const openCount = (rooms as {shouldOpen:boolean}[]).filter(r => r.shouldOpen).length;
  const total     = (rooms as unknown[]).length;

  const prompt = `You are Window Advisor, a friendly home ventilation assistant. Write a short greeting (2-3 sentences max) for a dashboard.

Context: ${weekday} ${monthDay}, ${cityName}, High ${highF}°F Low ${lowF}°F, ${openCount} of ${total} room${total>1?"s":""} open today.

Include ONE creative element: a holiday/observance for this date, a weather pun, a ventilation/balance-point joke, or a seasonal observation. Warm, brief, clever. No emojis. Don't be corny.`;

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
