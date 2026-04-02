export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { rooms, highF, lowF, cityName } = await req.json();

  type RoomInfo = { name:string; shouldOpen:boolean; todayPeriods:{from:string;to:string}[] };
  const roomList = rooms as RoomInfo[];

  // Only rooms with actual open periods TODAY count as "open"
  const openToday   = roomList.filter(r => r.todayPeriods?.length > 0);
  const closedToday = roomList.filter(r => !r.todayPeriods?.length);
  const total = roomList.length;

  const prompt = `Write one direct instruction (max 12 words) telling someone what to do with their windows TODAY.

Situation: ${openToday.length} of ${total} rooms have good conditions today in ${cityName} (High ${highF}°F, Low ${lowF}°F)
${openToday.length  > 0 ? `Open today: ${openToday.map(r=>r.name).join(", ")}` : "No rooms have good conditions today."}
${closedToday.length > 0 ? `Closed today: ${closedToday.map(r=>r.name).join(", ")}` : ""}

Rules:
- If NO rooms are open today, say "Keep everything closed today." — nothing else.
- If ALL rooms are open, say when and which ones to open.
- Must be about TODAY only — never say "this week" or mention future days.
- Use room names if they differ. 12 words maximum.
- A direct action, not a summary.

Write only the instruction.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY??"","anthropic-version":"2023-06-01"},
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:40, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text?.trim() ?? "" });
  } catch {
    return NextResponse.json({ text: "" });
  }
}
