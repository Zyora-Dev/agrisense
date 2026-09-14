import type { SensorReading } from "./auth";

export type DashboardReading = Omit<SensorReading, "metric"> & { metric: SensorReading["metric"] | "rainfall" };
export type DashboardMetric = DashboardReading["metric"];

export const dashboardMetrics: Record<DashboardMetric, { label: string; unit: string }> = {
  soil_moisture: { label: "Soil moisture", unit: "%" },
  temperature: { label: "Temperature", unit: "C" },
  humidity: { label: "Air humidity", unit: "%" },
  ph: { label: "Soil pH", unit: "pH" },
  nitrogen: { label: "Nitrogen", unit: "mg/kg" },
  phosphorus: { label: "Phosphorus", unit: "mg/kg" },
  potassium: { label: "Potassium", unit: "mg/kg" },
  rainfall: { label: "Rainfall", unit: "mm" },
};

export function readingValue(reading?: DashboardReading) {
  if (!reading) return "--";
  return `${Number(reading.value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${reading.unit === "pH" ? "" : ` ${reading.unit}`}`;
}

export function readingAge(reading: DashboardReading, now: number) {
  const elapsed = now - Date.parse(reading.recorded_at);
  if (elapsed < -300_000) return "Future timestamp";
  return elapsed > 86_400_000 ? "Older than 24h" : "Within 24h";
}

export function historyWindow(readings: DashboardReading[], metric: DashboardMetric, days: number, now: number) {
  return readings.filter((reading) => reading.metric === metric
    && Date.parse(reading.recorded_at) >= now - days * 86_400_000
    && Date.parse(reading.recorded_at) <= now)
    .sort((left, right) => Date.parse(left.recorded_at) - Date.parse(right.recorded_at));
}

export function weatherLabel(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if (code >= 95) return "Thunderstorms";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  return "Rain / showers";
}