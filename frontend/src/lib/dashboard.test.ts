import assert from "node:assert/strict";
import test from "node:test";
import { historyWindow, readingAge, readingValue, weatherLabel } from "./dashboard.ts";
import type { DashboardReading } from "./dashboard.ts";

const now = Date.parse("2026-09-14T12:00:00Z");
function reading(metric: DashboardReading["metric"], offsetHours: number, source: DashboardReading["source"] = "simulated"): DashboardReading {
  return { id: `${metric}-${offsetHours}`, farm_id: "farm-a", device_id: "device-a", metric, value: "0", unit: metric === "ph" ? "pH" : "%", source, recorded_at: new Date(now + offsetHours * 3_600_000).toISOString(), created_at: new Date(now).toISOString() };
}

test("history filters the selected metric and date window without mutating readings or dropping provenance", () => {
  const readings = [reading("humidity", -1), reading("ph", -2), reading("ph", -48), reading("ph", 1), reading("ph", -3, "manual")];
  const result = historyWindow(readings, "ph", 1, now);
  assert.deepEqual(result.map((item) => item.source), ["manual", "simulated"]);
  assert.equal(readings[0].metric, "humidity");
  assert.equal(historyWindow(readings, "ph", 7, now).length, 3);
});

test("zero measurements are values, missing measurements are not synthetic defaults", () => {
  assert.equal(readingValue(reading("ph", -1)), "0");
  assert.equal(readingValue(reading("humidity", -1)), "0 %");
  assert.equal(readingValue(), "--");
});

test("old and future measurements are identified without inventing crop health", () => {
  assert.equal(readingAge(reading("ph", -25), now), "Older than 24h");
  assert.equal(readingAge(reading("ph", -1), now), "Within 24h");
  assert.equal(readingAge(reading("ph", 1), now), "Future timestamp");
  assert.equal(weatherLabel(95), "Thunderstorms");
});