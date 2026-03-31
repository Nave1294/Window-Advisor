export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { rooms, highF, lowF, cityName } = await req.json();
  const openRooms   = (rooms as {name:string;shouldOpen:boolean}[]).filter(r => r.shouldOpen);
  const closedRooms = (rooms as {name:string;shouldOpen:boolean}[]).filter(r => !r.shouldOpen);
  const total       = rooms.length;

  const prompt = `Write ONE short practical sentence (max 18 words) as a whole-house ventilation recommendation.

Today in ${cityName}: High ${highF}°F, Low ${lowF}°F
${openRooms.length} of ${total} rooms have good conditions: ${openRooms.map((r:{name:string}) => r.name).join(", ") || "none"}
${closedRooms.length > 0 ? `Keep closed: ${closedRooms.map((r:{name:string}) => r.name).join(", ")}` : ""}

RULES:
- This is a practical instruction about opening or closing windows/vents — not a weather report
- Never mention specific temperatures unless describing conditions simply (e.g. "cool tonight")
- Never confuse forecast high/low with balance point temperatures
- Focus on the action: open, keep closed, mixed

Good examples:
- "Good conditions across the house tonight from 5 PM."
- "Keep everything closed today — too warm outside."
- "Open the bedroom but keep the living room closed."
- "Mixed day — good conditions in 2 of 3 rooms from this afternoon."

Write only the sentence.`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY??"", "anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:60, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text?.trim() ?? "" });
  } catch {
    return NextResponse.json({ text: "" });
  }
}
