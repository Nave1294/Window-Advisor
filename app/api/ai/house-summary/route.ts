export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { rooms, highF, lowF, cityName } = await req.json();
  const open   = (rooms as {name:string;shouldOpen:boolean}[]).filter(r => r.shouldOpen);
  const closed = (rooms as {name:string;shouldOpen:boolean}[]).filter(r => !r.shouldOpen);
  const total  = rooms.length;

  const prompt = `Write one direct instruction (max 12 words) telling someone what to do with their windows.

Situation: ${open.length} of ${total} rooms open today in ${cityName} (High ${highF}°F, Low ${lowF}°F)
${open.length  > 0 ? `Open: ${open.map((r:{name:string})=>r.name).join(", ")}` : ""}
${closed.length > 0 ? `Closed: ${closed.map((r:{name:string})=>r.name).join(", ")}` : ""}

This must be a single direct ACTION instruction — not a summary of conditions.
Use the room names if they differ. Otherwise say "whole house" or "everything".

CORRECT examples:
"Open Ilevan's Bedroom tonight from 11 PM."
"Keep everything closed today."
"Open the bedroom, keep The Lair closed tonight."
"Good conditions across the house from 9 PM."

WRONG (do not do this):
"Both rooms have potential for ventilation this evening." ← summary, not instruction
"Keep Ilevan's Bedroom and The Lair closed; open when cool." ← too long, vague

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
