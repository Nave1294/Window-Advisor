export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { step, stepName, formData, trigger } = await req.json();

  const prompt = `You are a setup guide for Window Advisor, a home ventilation app that calculates thermal balance points.

Step: "${stepName}" (${step+1}) | Trigger: ${trigger} (advance=just arrived, update=value changed, idle=8s no activity)
Form so far: ${JSON.stringify(formData)}

One short helpful comment (max 20 words).
- advance: hint at what matters most on this step
- update: brief reaction to what they entered
- idle: gentle nudge or useful tip

Reference how inputs affect balance points or recommendations occasionally. Warm, not robotic. No quotes in output.`;

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
