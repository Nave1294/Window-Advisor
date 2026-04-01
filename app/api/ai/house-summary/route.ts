export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { rooms, highF, lowF, cityName } = await req.json();
  const openRooms   = (rooms as {name:string;shouldOpen:boolean}[]).filter(r => r.shouldOpen);
  const closedRooms = (rooms as {name:string;shouldOpen:boolean}[]).filter(r => !r.shouldOpen);
  const total       = rooms.length;

  const prompt = `Write ONE short practical sentence (max 14 words) telling someone what to do with their windows today. This is a direct instruction, not a summary.

${openRooms.length} of ${total} rooms have good conditions: ${openRooms.map((r:{name:string})=>r.name).join(", ")||"none"}
${closedRooms.length>0?`Keep closed: ${closedRooms.map((r:{name:string})=>r.name).join(", ")}`: ""}
${cityName} — High ${highF}°F, Low ${lowF}°F

RULES:
- One direct instruction only — not a summary, not "conditions suggest"
- Name specific rooms if they differ, otherwise say "whole house" or "everything"
- Good examples:
  "Keep everything closed today — it's too warm outside."
  "Open the bedroom tonight from 11 PM, keep The Lair closed."
  "Good conditions across the house tonight from 9 PM."

Write only the sentence.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY??"","anthropic-version":"2023-06-01"},
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:50, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text?.trim() ?? "" });
  } catch {
    return NextResponse.json({ text: "" });
  }
}
