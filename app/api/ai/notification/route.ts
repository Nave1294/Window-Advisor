export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { roomName, action, reasoning, highF, lowF, balancePoint, until } = await req.json();

  const prompt = `Write a very short, friendly push notification email body (2-3 sentences max) about home ventilation.

Room: ${roomName}
Action: ${action === "open" ? "Time to open the windows" : "Time to close the windows"}
${until ? `Good conditions until: ${until}` : ""}
Today: High ${highF}°F, Low ${lowF}°F${balancePoint ? `, balance point ${balancePoint.toFixed(1)}°F` : ""}
Reason: ${reasoning}

Be warm, specific, and brief. No subject line. No greetings. Just the body.
Example open: "Outdoor temps have dropped nicely — good conditions in the kitchen right now. Worth opening up for the next couple of hours before it warms again."
Example close: "Conditions outside are shifting — time to close up the bedroom. You can open again this evening from 8 PM."

Write only the body.`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY??"", "anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:100, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text?.trim() ?? "" });
  } catch {
    return NextResponse.json({ text: "" });
  }
}
