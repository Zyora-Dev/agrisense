"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudRain, CloudSun, Droplets, LoaderCircle, MapPin, ThermometerSun, Wind } from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Farm, Profile } from "@/lib/auth";

type ForecastDay = {
  date: string;
  weather_code: number;
  temperature_max_c: number;
  temperature_min_c: number;
  precipitation_probability_percent: number;
  precipitation_mm: number;
  reference_evapotranspiration_mm: number;
  weather_outlook: string;
};

type Forecast = {
  location: string;
  timezone: string;
  current: { temperature_c: number; relative_humidity_percent: number; precipitation_mm: number; weather_code: number };
  days: ForecastDay[];
  source: string;
  attribution_url: string;
};

function weatherLabel(code: number) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67 || (code >= 80 && code <= 82)) return "Rain";
  if (code >= 95) return "Thunderstorms";
  return "Showers";
}

export function WeatherWorkspace({ profile, farms }: { profile: Profile; farms: Farm[] }) {
  const availableFarms = farms.filter((farm) => farm.latitude && farm.longitude);
  const [farmId, setFarmId] = useState(availableFarms[0]?.id ?? "");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!farmId) return;
    const controller = new AbortController();
    async function loadForecast() {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/weather/farms/${farmId}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? data.error ?? "Could not load weather.");
        setForecast(data);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") setError((requestError as Error).message);
      } finally { setLoading(false); }
    }
    loadForecast();
    return () => controller.abort();
  }, [farmId]);

  return <div className="dashboard-shell"><aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /><div className="mt-auto text-xs leading-5 text-white/90">Forecast data<br /><span className="text-lime-200">Powered by Open-Meteo</span></div></aside><main className="min-w-0 flex-1"><header className="dashboard-header"><div><p className="text-xs font-semibold uppercase text-green-700">Planning</p><h1 className="mt-1 text-xl font-semibold text-zinc-950">Seven-day weather</h1></div><div className="ml-auto hidden text-right sm:block"><p className="text-sm font-semibold text-zinc-900">{profile.full_name}</p><p className="text-xs text-zinc-600">Farm weather workspace</p></div></header><div className="dashboard-content"><section className="animate-enter flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">Weather outlook</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-[30px]">Plan around the week ahead</h2><p className="mt-2 text-sm text-zinc-600">Forecast rain and atmospheric water demand for each exact farm location.</p></div>{availableFarms.length > 0 && <select aria-label="Select farm" className="h-10 rounded-md border bg-white px-3 text-sm font-medium text-zinc-900" value={farmId} onChange={(event) => setFarmId(event.target.value)}>{availableFarms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select>}</section>{availableFarms.length === 0 ? <section className="farm-empty mt-8"><MapPin className="mx-auto size-8 text-green-700" /><h3 className="mt-4 text-lg font-semibold text-zinc-950">Select an exact farm location</h3><p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">Edit a farm and choose a location search result or use your current GPS position.</p><Button asChild className="mt-5"><Link href="/farms">Open farms</Link></Button></section> : loading ? <div className="mt-8 flex h-64 items-center justify-center text-sm text-zinc-600"><LoaderCircle className="mr-2 size-5 animate-spin" />Loading seven-day forecast</div> : error ? <div role="alert" className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : forecast && <><section className="weather-current mt-8"><div><div className="flex items-center gap-2 text-sm font-medium text-green-800"><MapPin className="size-4" />{forecast.location}</div><div className="mt-4 flex items-end gap-3"><span className="text-5xl font-semibold text-zinc-950">{Math.round(forecast.current.temperature_c)}°</span><span className="pb-1 text-sm font-semibold text-zinc-700">{weatherLabel(forecast.current.weather_code)}</span></div></div><div className="weather-current-metrics"><div><Droplets /><span>{forecast.current.relative_humidity_percent}%</span><small>Humidity</small></div><div><CloudRain /><span>{forecast.current.precipitation_mm} mm</span><small>Current rain</small></div><div><Wind /><span>{forecast.timezone.replace("_", " ")}</span><small>Local timezone</small></div></div></section><section className="mt-5"><div className="panel-heading"><div><p className="panel-title">Daily forecast</p><p className="panel-subtitle">Rain and ET₀ help prepare irrigation decisions</p></div><Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">7 days</Badge></div><div className="forecast-grid mt-4">{forecast.days.map((day, index) => <article className="forecast-day" key={day.date}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-green-700">{index === 0 ? "Today" : new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${day.date}T00:00:00`))}</p><p className="mt-1 text-xs text-zinc-600">{new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${day.date}T00:00:00`))}</p></div>{day.precipitation_probability_percent >= 50 ? <CloudRain className="size-6 text-sky-700" /> : <CloudSun className="size-6 text-amber-600" />}</div><div className="mt-5 flex items-center gap-2"><ThermometerSun className="size-4 text-red-600" /><span className="text-lg font-semibold text-zinc-950">{Math.round(day.temperature_max_c)}°</span><span className="text-sm text-zinc-600">/ {Math.round(day.temperature_min_c)}°</span></div><div className="mt-4 space-y-2 border-t pt-4 text-xs text-zinc-700"><p className="flex justify-between"><span>Rain chance</span><strong>{day.precipitation_probability_percent}%</strong></p><p className="flex justify-between"><span>Rainfall</span><strong>{day.precipitation_mm} mm</strong></p><p className="flex justify-between"><span>ET₀ demand</span><strong>{day.reference_evapotranspiration_mm} mm</strong></p></div><p className="mt-4 min-h-10 text-xs font-medium leading-5 text-green-800">{day.weather_outlook}</p></article>)}</div><p className="mt-4 text-xs text-zinc-600">Weather forecast by <a className="font-semibold text-green-800 underline" href={forecast.attribution_url} target="_blank" rel="noreferrer">{forecast.source}</a>. Final irrigation advice will also use live soil-moisture readings.</p></section></>}</div></main></div>;
}