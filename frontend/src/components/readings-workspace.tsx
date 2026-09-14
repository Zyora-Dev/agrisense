"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Beaker, Droplets, Gauge, Leaf, LoaderCircle, MapPin, Menu, Plus, RefreshCw,
  Sprout, TestTubes, ThermometerSun, Wind,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Farm, Profile, ReadingMetric, SensorReading } from "@/lib/auth";

const metrics: { metric: ReadingMetric; label: string; icon: typeof Droplets; tone: string }[] = [
  { metric: "soil_moisture", label: "Soil moisture", icon: Droplets, tone: "green" },
  { metric: "temperature", label: "Temperature", icon: ThermometerSun, tone: "amber" },
  { metric: "humidity", label: "Humidity", icon: Wind, tone: "blue" },
  { metric: "ph", label: "Soil pH", icon: Beaker, tone: "purple" },
  { metric: "nitrogen", label: "Nitrogen", icon: Leaf, tone: "green" },
  { metric: "phosphorus", label: "Phosphorus", icon: TestTubes, tone: "amber" },
  { metric: "potassium", label: "Potassium", icon: Sprout, tone: "blue" },
];

const metricLabels = Object.fromEntries(metrics.map(({ metric, label }) => [metric, label])) as Record<ReadingMetric, string>;

function displayValue(reading: SensorReading | undefined) {
  if (!reading) return "--";
  const precision = reading.metric === "ph" ? 2 : 1;
  return `${Number(reading.value).toFixed(precision)}${reading.unit === "pH" ? "" : ` ${reading.unit}`}`;
}

function sourceLabel(source: SensorReading["source"]) {
  if (source === "device") return "Device";
  if (source === "manual") return "Manual";
  return "Simulated";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function fetchReadings(farmId: string, signal?: AbortSignal) {
  const [latestResponse, historyResponse] = await Promise.all([
    fetch(`/api/farms/${farmId}/readings/latest`, { cache: "no-store", signal }),
    fetch(`/api/farms/${farmId}/readings?limit=100`, { cache: "no-store", signal }),
  ]);
  const [latestData, historyData] = await Promise.all([latestResponse.json(), historyResponse.json()]);
  if (!latestResponse.ok || !historyResponse.ok) throw new Error(latestData.detail ?? historyData.detail ?? "Could not load readings.");
  return { latest: latestData as SensorReading[], history: historyData as SensorReading[] };
}

export function ReadingsWorkspace({ profile, farms }: { profile: Profile; farms: Farm[] }) {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const [latest, setLatest] = useState<SensorReading[]>([]);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedFarm = farms.find((farm) => farm.id === farmId);

  async function loadReadings(signal?: AbortSignal) {
    if (!farmId) return;
    setLoading(true); setError("");
    try {
      const data = await fetchReadings(farmId, signal);
      setLatest(data.latest); setHistory(data.history);
    } catch (requestError) {
      if ((requestError as Error).name !== "AbortError") setError((requestError as Error).message);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    if (farmId) {
      void fetchReadings(farmId, controller.signal)
        .then((data) => { setLatest(data.latest); setHistory(data.history); setError(""); })
        .catch((requestError: Error) => { if (requestError.name !== "AbortError") setError(requestError.message); })
        .finally(() => setLoading(false));
    }
    return () => controller.abort();
  }, [farmId]);

  async function saveManualReadings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const readings = (["ph", "nitrogen", "phosphorus", "potassium"] as ReadingMetric[])
      .flatMap((metric) => formData.get(metric) ? [{ metric, value: formData.get(metric) }] : []);
    if (readings.length === 0) { setError("Enter at least one pH or NPK value."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/farms/${farmId}/readings`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save readings.");
      setEntryOpen(false); form.reset(); await loadReadings();
    } catch (requestError) { setError((requestError as Error).message); }
    finally { setSaving(false); }
  }

  const latestByMetric = Object.fromEntries(latest.map((reading) => [reading.metric, reading])) as Partial<Record<ReadingMetric, SensorReading>>;
  const moistureTrend = history.filter((reading) => reading.metric === "soil_moisture").slice(0, 20).reverse().map((reading) => ({
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(reading.recorded_at)),
    value: Number(reading.value), source: sourceLabel(reading.source),
  }));

  return <div className="dashboard-shell"><aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /><div className="mt-auto text-xs leading-5 text-white/90">Sensor workspace<br /><span className="text-lime-200">Sources tracked per reading</span></div></aside><main className="min-w-0 flex-1"><header className="dashboard-header"><div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="w-[290px] border-0 bg-[#123d2b] p-6 text-white"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand light /><WorkspaceNav /></SheetContent></Sheet><Brand /></div><div className="hidden lg:block"><p className="text-xs font-semibold uppercase text-green-700">Monitoring</p><h1 className="mt-1 text-xl font-semibold text-zinc-950">Field readings</h1></div><div className="ml-auto hidden text-right sm:block"><p className="text-sm font-semibold text-zinc-900">{profile.full_name}</p><p className="text-xs text-zinc-600">Sensor data workspace</p></div></header><div className="dashboard-content"><section className="animate-enter flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">Live and recorded data</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-[30px]">Monitor field conditions</h2><p className="mt-2 text-sm text-zinc-600">Device, simulated, and manually tested values remain clearly identified.</p></div>{farms.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="Select farm" className="h-10 min-w-44 rounded-md border bg-white px-3 text-sm font-medium text-zinc-900" value={farmId} onChange={(event) => setFarmId(event.target.value)}>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select><Button variant="outline" size="icon" aria-label="Refresh readings" title="Refresh readings" onClick={() => loadReadings()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /></Button><Button onClick={() => setEntryOpen(true)}><Plus />Add pH / NPK</Button></div>}</section>

      {farms.length === 0 ? <section className="farm-empty mt-8"><MapPin className="mx-auto size-8 text-green-700" /><h3 className="mt-4 text-lg font-semibold text-zinc-950">Add a farm first</h3><p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">Readings need a farm so their history and ownership remain clear.</p><Button asChild className="mt-5"><Link href="/farms">Open farms</Link></Button></section> : <>
        {error && <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>}
        <section className="readings-metric-grid" aria-label="Latest field readings">{metrics.map(({ metric, label, icon: Icon, tone }) => { const reading = latestByMetric[metric]; return <article className="metric-card" key={metric}><div className={`metric-icon ${tone}`}><Icon className="size-5" /></div><div className="mt-5"><p className="text-xs font-medium text-zinc-600">{label}</p><p className="mt-1 text-2xl font-semibold text-zinc-950">{displayValue(reading)}</p></div><div className="mt-3 flex items-center justify-between gap-2"><Badge variant="outline" className={reading?.source === "simulated" ? "border-amber-200 bg-amber-50 text-amber-800" : ""}>{reading ? sourceLabel(reading.source) : "No data"}</Badge>{reading && <time className="text-[11px] text-zinc-600">{formatTime(reading.recorded_at)}</time>}</div></article>; })}</section>
        <div className="readings-grid"><section className="panel min-w-0"><div className="panel-heading"><div><p className="panel-title">Soil moisture trend</p><p className="panel-subtitle">{selectedFarm?.name} · latest 20 measurements</p></div><Gauge className="size-5 text-green-700" /></div>{moistureTrend.length > 0 ? <div className="mt-7 h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={moistureTrend} margin={{ top: 8, right: 8, left: -25, bottom: 0 }}><defs><linearGradient id="reading-moisture" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#237a4b" stopOpacity={0.32} /><stop offset="100%" stopColor="#237a4b" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#52525b", fontSize: 11 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#52525b", fontSize: 11 }} /><ChartTooltip contentStyle={{ borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 12 }} formatter={(value) => [`${value}%`, "Moisture"]} /><Area type="monotone" dataKey="value" stroke="#237a4b" strokeWidth={2.5} fill="url(#reading-moisture)" /></AreaChart></ResponsiveContainer></div> : <div className="flex h-[280px] items-center justify-center text-sm text-zinc-600">No soil-moisture readings yet.</div>}</section>
        <section className="panel min-w-0"><div className="panel-heading"><div><p className="panel-title">Recent readings</p><p className="panel-subtitle">Newest measurements across all sources</p></div>{loading && <LoaderCircle className="size-5 animate-spin text-green-700" />}</div>{history.length > 0 ? <div className="reading-history mt-5">{history.slice(0, 12).map((reading) => <div key={reading.id} className="reading-row"><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-900">{metricLabels[reading.metric]}</p><p className="mt-1 text-xs text-zinc-600">{formatTime(reading.recorded_at)}</p></div><div className="text-right"><p className="text-sm font-semibold text-zinc-950">{displayValue(reading)}</p><p className={`mt-1 text-xs font-medium ${reading.source === "simulated" ? "text-amber-700" : "text-green-700"}`}>{sourceLabel(reading.source)}</p></div></div>)}</div> : <div className="flex h-[280px] items-center justify-center text-center text-sm text-zinc-600">No readings recorded for this farm.</div>}</section></div>
      </>}</div></main>

    <Dialog open={entryOpen} onOpenChange={setEntryOpen}><DialogContent className="sm:max-w-lg"><form onSubmit={saveManualReadings}><DialogHeader><DialogTitle>Add soil test values</DialogTitle><DialogDescription>Enter available pH and NPK results. Empty fields are not saved.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4 sm:grid-cols-2"><ManualField name="ph" label="Soil pH" min="0" max="14" step="0.01" placeholder="6.70" /><ManualField name="nitrogen" label="Nitrogen (mg/kg)" min="0" max="10000" step="0.01" placeholder="84" /><ManualField name="phosphorus" label="Phosphorus (mg/kg)" min="0" max="10000" step="0.01" placeholder="42" /><ManualField name="potassium" label="Potassium (mg/kg)" min="0" max="10000" step="0.01" placeholder="61" /></div><p className="mt-4 text-xs leading-5 text-zinc-600">These values are stored as manual soil-test inputs, separate from device and simulated readings.</p><DialogFooter className="mt-7"><Button type="button" variant="outline" onClick={() => setEntryOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" />}{saving ? "Saving..." : "Save readings"}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>;
}

function ManualField({ name, label, min, max, step, placeholder }: { name: string; label: string; min: string; max: string; step: string; placeholder: string }) {
  return <div className="space-y-2"><Label htmlFor={`reading-${name}`}>{label}</Label><Input id={`reading-${name}`} name={name} type="number" min={min} max={max} step={step} placeholder={placeholder} /></div>;
}