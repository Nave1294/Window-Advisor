import { fetchForecast } from "./weather";

async function main() {
  const zip = "19103"; // Philadelphia
  try {
    const forecast = await fetchForecast(zip);
    console.log(`City: ${forecast.cityName}`);
    console.log(`Days: ${forecast.days.length}`);
    for (const day of forecast.days.slice(0, 2)) {
      console.log(`\n${day.date} — High ${day.highF.toFixed(1)}°F Low ${day.lowF.toFixed(1)}°F`);
      for (const s of day.slots) {
        console.log(`  ${String(s.hour).padStart(2,"0")}:00  ${s.tempF.toFixed(1)}°F  ${s.humidity}% RH  ${Math.round(s.precipProb*100)}% precip`);
      }
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
main();
