/**
 * GET /api/weather?zip=XXXXX
 *
 * Returns the 5-day forecast for a ZIP code.
 * Thin wrapper around the weather service — lets the frontend
 * call it directly (for dashboard display) without exposing the API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchForecast } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip?.match(/^\d{5}$/))
    return NextResponse.json({ error: "Valid 5-digit ZIP required." }, { status: 400 });

  try {
    const forecast = await fetchForecast(zip);
    return NextResponse.json(forecast);
  } catch (err) {
    console.error("Weather fetch error:", err);
    const msg = err instanceof Error ? err.message : "Weather fetch failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
