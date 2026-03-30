/**
 * Weather Service
 * ===============
 * Wraps the OpenWeatherMap free-tier API.
 *
 * Endpoints used:
 *   GET /geo/1.0/zip          — ZIP → lat/lon (required for One Call)
 *   GET /data/2.5/forecast    — 5-day / 3-hour forecast (free tier)
 *
 * The forecast endpoint returns 40 slots × 3 hours = 5 days.
 * We group them by calendar day and extract the fields the
 * recommendation engine needs.
 */

const BASE = "https://api.openweathermap.org";

function key(): string {
  const k = process.env.OPENWEATHER_API_KEY;
  if (!k) throw new Error("OPENWEATHER_API_KEY is not set.");
  return k;
}

// ─── Raw API shapes (only fields we use) ─────────────────────────────────────

interface GeoResponse {
  lat: number;
  lon: number;
  name: string;  // city name
}

interface ForecastSlot {
  dt:   number;        // Unix timestamp
  main: {
    temp:     number;  // °K
    humidity: number;  // %
    dew_point?: number; // not always present in /forecast
  };
  weather: { description: string; icon: string }[];
  wind: {
    speed: number;   // m/s
    deg:   number;   // degrees (0=N, 90=E, 180=S, 270=W)
  };
  pop:  number;        // probability of precipitation 0–1
  rain?: { "3h"?: number }; // mm in 3h window
  snow?: { "3h"?: number };
  dt_txt: string;      // "YYYY-MM-DD HH:MM:SS" UTC
}

interface ForecastResponse {
  city: { name: string; timezone: number }; // timezone offset in seconds
  list: ForecastSlot[];
}

// ─── Our normalised types ─────────────────────────────────────────────────────

export interface HourlySlot {
  /** Local wall-clock hour 0–23 (approximated via timezone offset) */
  hour:        number;
  /** Unix timestamp */
  ts:          number;
  tempF:       number;
  humidity:    number;  // %
  dewPointF:   number;  // °F — estimated from temp + humidity if not provided
  precipProb:  number;  // 0–1
  windSpeedMph: number;
  windDeg:     number;  // 0–360
  description: string;
  icon:        string;
}

export interface DayForecast {
  /** "YYYY-MM-DD" in the location's local date */
  date:        string;
  slots:       HourlySlot[];
  // Convenience aggregates
  highF:       number;
  lowF:        number;
  maxHumidity: number;
  maxPrecipProb: number;
  maxWindMph:  number;
}

export interface WeatherForecast {
  cityName:  string;
  days:      DayForecast[];  // up to 5 days, index 0 = today
  fetchedAt: string;         // ISO timestamp
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────

function kelvinToF(k: number): number {
  return (k - 273.15) * 9/5 + 32;
}

function msToMph(ms: number): number {
  return ms * 2.237;
}

/**
 * Magnus formula dew point estimate (°F) from temp (°F) and relative humidity.
 * Accurate to within ~1°F for RH > 50%.
 */
function estimateDewPointF(tempF: number, rh: number): number {
  const tempC = (tempF - 32) * 5/9;
  const a = 17.27, b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  const dpC = (b * alpha) / (a - alpha);
  return dpC * 9/5 + 32;
}

/** Convert compass degrees to cardinal label */
export function degToCardinal(deg: number): string {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// ─── Geo lookup ───────────────────────────────────────────────────────────────

export async function resolveZip(zip: string): Promise<{ lat: number; lon: number; city: string }> {
  const url = `${BASE}/geo/1.0/zip?zip=${zip},US&appid=${key()}`;
  const res  = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Geo lookup failed for ZIP ${zip}: ${res.status} ${text}`);
  }
  const data: GeoResponse = await res.json();
  return { lat: data.lat, lon: data.lon, city: data.name };
}

// ─── Forecast fetch ───────────────────────────────────────────────────────────

export async function fetchForecast(zip: string): Promise<WeatherForecast> {
  // Step 1: resolve ZIP to coordinates + city name
  const { lat, lon, city } = await resolveZip(zip);

  // Step 2: fetch 5-day / 3-hour forecast
  const url = `${BASE}/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${key()}`;
  const res  = await fetch(url, { next: { revalidate: 3600 } }); // cache 1h
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Forecast fetch failed: ${res.status} ${text}`);
  }
  const data: ForecastResponse = await res.json();
  const tzOffsetSec = data.city.timezone; // seconds east of UTC

  // Step 3: normalise slots and group by local date
  const byDate = new Map<string, HourlySlot[]>();

  for (const slot of data.list) {
    const tempF      = kelvinToF(slot.main.temp);
    const humidity   = slot.main.humidity;
    const dewPointF  = slot.main.dew_point != null
      ? kelvinToF(slot.main.dew_point)
      : estimateDewPointF(tempF, humidity);

    // Local wall-clock time via timezone offset
    const localTs   = slot.dt + tzOffsetSec;
    const localDate = new Date(localTs * 1000);
    // Format as YYYY-MM-DD using UTC methods (since we already applied offset)
    const dateStr   = localDate.toISOString().slice(0, 10);
    const hour      = localDate.getUTCHours();

    const normalised: HourlySlot = {
      hour,
      ts:           slot.dt,
      tempF:        Math.round(tempF * 10) / 10,
      humidity,
      dewPointF:    Math.round(dewPointF * 10) / 10,
      precipProb:   slot.pop,
      windSpeedMph: Math.round(msToMph(slot.wind.speed) * 10) / 10,
      windDeg:      slot.wind.deg,
      description:  slot.weather[0]?.description ?? "",
      icon:         slot.weather[0]?.icon ?? "",
    };

    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr)!.push(normalised);
  }

  // Step 4: build DayForecast for each date, sorted chronologically
  const days: DayForecast[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => {
      const temps   = slots.map(s => s.tempF);
      return {
        date,
        slots:          slots.sort((a, b) => a.hour - b.hour),
        highF:          Math.max(...temps),
        lowF:           Math.min(...temps),
        maxHumidity:    Math.max(...slots.map(s => s.humidity)),
        maxPrecipProb:  Math.max(...slots.map(s => s.precipProb)),
        maxWindMph:     Math.max(...slots.map(s => s.windSpeedMph)),
      };
    });

  return {
    cityName:  city,
    days,
    fetchedAt: new Date().toISOString(),
  };
}
