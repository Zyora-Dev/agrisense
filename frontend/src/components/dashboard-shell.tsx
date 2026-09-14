"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowRight, Check, ChevronDown, CloudRain, CloudSun, Droplets,
  Leaf, LoaderCircle, LogOut, MapPin, Menu, Plus, Radio, RefreshCw, Settings,
  Sprout, TestTubes, ThermometerSun, TriangleAlert, Wind,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Farm, IotDevice, Profile } from "@/lib/auth";
import { dashboardMetrics, historyWindow, readingAge, readingValue, weatherLabel, type DashboardMetric, type DashboardReading } from "@/lib/dashboard";

type Resource<T> = { data: T | null; loading: boolean; error: string; receivedAt: number };
type Forecast = {
  location: string; timezone: string; source: string;
  current: { temperature_c: number; relative_humidity_percent: number; precipitation_mm: number; weather_code: number };
  days: { date: string; weather_code: number; temperature_max_c: number; temperature_min_c: number; precipitation_probability_percent: number; precipitation_mm: number; weather_outlook: string }[];
};

const selectStyle = "h-10 min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-green-700";
const primaryMetrics = [
  { metric: "soil_moisture", icon: Droplets, color: "bg-blue-50 text-blue-800" },
  { metric: "temperature", icon: ThermometerSun, color: "bg-amber-50 text-amber-800" },
  { metric: "humidity", icon: Wind, color: "bg-teal-50 text-teal-800" },
  { metric: "ph", icon: TestTubes, color: "bg-green-50 text-green-800" },
] as const;
const soilFields = ["ph", "nitrogen", "phosphorus", "potassium"] as const;

function timeLabel(value: string | number) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function useResource<T>(path: string | null, revision: number, retain = false): Resource<T> {
  const router = useRouter();
  const key = `${revision}:${path}`;
  const [result, setResult] = useState<{ key: string; path: string; data: T | null; error: string; receivedAt: number } | null>(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path!, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/login"); router.refresh(); throw new Error("Please sign in again."); }
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.error || "Could not load this data.");
        if (!controller.signal.aborted) setResult({ key, path: path!, data, error: "", receivedAt: Date.now() });
      } catch (error) {
        if (!controller.signal.aborted) setResult((previous) => ({ key, path: path!, data: retain && previous?.path === path ? previous.data : null, error: error instanceof Error ? error.message : "Service unavailable.", receivedAt: Date.now() }));
      }
    }
    void load();
    return () => controller.abort();
  }, [path, key, router, retain]);
  if (!path) return { data: null, error: "", loading: false, receivedAt: 0 };
  return result?.key === key ? { ...result, loading: false } : { data: retain && result?.path === path ? result.data : null, error: "", loading: true, receivedAt: 0 };
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label={label} onClick={onClick} disabled={disabled}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function SourceBadge({ source }: { source: DashboardReading["source"] }) {
  return <Badge variant="outline" className={source === "simulated" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700"}>{source === "simulated" ? "Simulated" : source === "manual" ? "Manual test" : "Device"}</Badge>;
}

function Loading({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="flex min-h-32 items-center justify-center gap-2 text-sm text-zinc-700"><LoaderCircle className="size-4 animate-spin" />{label}</div>;
}

function Failure({ text, retry }: { text: string; retry: () => void }) {
  return <div role="alert" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="min-w-0 flex-1">{text}</span><Button variant="outline" size="sm" onClick={retry}><RefreshCw className="size-4" />Retry</Button></div>;
}

export function DashboardShell({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [farmId, setFarmId] = useState("");
  const [automatic, setAutomatic] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const farms = useResource<Farm[]>("/api/farms", revision, true);
  const selectedFarm = farms.data?.find((farm) => farm.id === farmId) ?? farms.data?.[0];
  const initials = profile.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRevision((value) => value + 1); }, 60_000);
    return () => clearInterval(timer);
  }, [automatic]);

  async function logout() {
    setLoggingOut(true); setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out could not be confirmed. Please try again.");
      router.replace("/login"); router.refresh();
    } catch (error) { setLogoutError((error as Error).message); }
    finally { setLoggingOut(false); }
  }

  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /><div className="mt-auto border-t border-white/20 pt-5 text-xs leading-6 text-white/90">AgriSense field workspace<br /><span className="text-lime-200">{farms.data ? `${farms.data.length} registered farms` : "Farm monitoring"}</span></div></aside>
    <main className="min-w-0 flex-1">
      <header className="dashboard-header">
        <div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="w-[290px] border-0 bg-[#123d2b] p-6 text-white"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand light /><WorkspaceNav /></SheetContent></Sheet></div>
        <div className="ml-3 lg:ml-0"><p className="hidden text-xs font-semibold uppercase text-green-700 lg:block">Farm overview</p><h1 className="text-lg font-semibold text-zinc-950 lg:mt-1 lg:text-xl">Dashboard</h1></div>
        <div className="ml-auto"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-11 gap-2 px-2 sm:px-3" aria-label={`Account: ${profile.full_name}`}><Avatar className="size-8"><AvatarFallback className="bg-green-100 text-xs font-semibold text-green-800">{initials}</AvatarFallback></Avatar><span className="hidden max-w-32 truncate text-sm sm:block">{profile.full_name}</span><ChevronDown className="hidden size-4 sm:block" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem asChild><Link href="/settings"><Settings className="size-4" />Account settings</Link></DropdownMenuItem><DropdownMenuItem onClick={logout} disabled={loggingOut}><LogOut className="size-4" />{loggingOut ? "Signing out..." : "Sign out"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </header>
      <div className="dashboard-content !pb-24">
        {logoutError && <p role="alert" className="mb-5 rounded-md bg-red-50 p-4 text-sm text-red-800">{logoutError}</p>}
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0"><p className="eyebrow">Your field workspace</p><h2 className="mt-2 break-words text-2xl font-semibold text-zinc-950 sm:text-3xl">Farm overview</h2><p className="mt-2 text-sm text-zinc-700">Measurements, weather and device activity.</p></div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            {farms.data && farms.data.length > 0 && <div className="min-w-0 flex-1 sm:w-56"><Label htmlFor="dashboard-farm" className="sr-only">Select farm</Label><select id="dashboard-farm" className={`${selectStyle} w-full`} value={selectedFarm?.id ?? ""} onChange={(event) => setFarmId(event.target.value)}>{farms.data.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></div>}
            <IconButton label="Refresh dashboard" onClick={refresh} disabled={farms.loading}><RefreshCw className={`size-4 ${farms.loading ? "animate-spin" : ""}`} /></IconButton>
            <label className="flex h-10 items-center gap-2 text-xs font-medium text-zinc-700"><input type="checkbox" className="size-4 accent-green-700" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />Auto-refresh 60s</label>
          </div>
        </section>
        {farms.error && <Failure text={farms.error} retry={refresh} />}
        {selectedFarm ? <FarmDashboard key={selectedFarm.id} farm={selectedFarm} revision={revision} /> : farms.loading ? <Loading label="Loading farms" /> : !farms.error && <section className="mt-10 border-y py-16 text-center"><Sprout className="mx-auto size-10 text-green-700" /><h3 className="mt-5 text-xl font-semibold text-zinc-950">Your first farm starts here</h3><p className="mt-2 text-sm text-zinc-700">No farms are registered to this account.</p><Button asChild className="mt-6"><Link href="/farms"><Plus className="size-4" />Add a farm</Link></Button></section>}
      </div>
    </main>
  </div>;
}

function FarmDashboard({ farm, revision }: { farm: Farm; revision: number }) {
  const [localRevision, setLocalRevision] = useState(0);
  const [metric, setMetric] = useState<DashboardMetric>("soil_moisture");
  const [days, setDays] = useState("7");
  const [entryOpen, setEntryOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const version = revision + localRevision;
  const base = `/api/farms/${farm.id}`;
  const latest = useResource<DashboardReading[]>(`${base}/readings/latest`, version);
  const history = useResource<DashboardReading[]>(`${base}/readings?metric=${metric}&limit=500`, version);
  const devices = useResource<IotDevice[]>(`${base}/devices`, version);
  const weather = useResource<Forecast>(farm.latitude !== null && farm.longitude !== null ? `/api/weather/farms/${farm.id}` : null, version);
  const now = Math.max(latest.receivedAt, history.receivedAt);
  const refresh = () => setLocalRevision((value) => value + 1);
  const latestByMetric = Object.fromEntries((latest.data ?? []).map((reading) => [reading.metric, reading])) as Partial<Record<DashboardMetric, DashboardReading>>;
  const chartReadings = historyWindow(history.data ?? [], metric, Number(days), now);
  const missing = Object.keys(dashboardMetrics).filter((key) => !latestByMetric[key as DashboardMetric]);
  const simulated = (latest.data ?? []).filter((reading) => reading.source === "simulated");
  const old = (latest.data ?? []).filter((reading) => readingAge(reading, now) !== "Within 24h");

  function downloadHistory() {
    const rows = [["metric", "value", "unit", "source", "recorded_at"], ...chartReadings.map((reading) => [reading.metric, reading.value, reading.unit, reading.source, reading.recorded_at])];
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `agrisense-${farm.id}-${metric}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <>
    <section className="mt-7 flex flex-wrap items-center justify-between gap-4 border-y border-zinc-200 py-5">
      <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-zinc-950">{farm.name}</h3><p className="mt-1 flex items-start gap-1.5 text-sm text-zinc-700"><MapPin className="mt-0.5 size-4 shrink-0" /><span className="break-words">{farm.location}{farm.area_hectares !== null ? ` / ${Number(farm.area_hectares)} ha` : ""}</span></p></div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" asChild><Link href="/assistant"><Leaf className="size-4" />Farm assistant</Link></Button><Button onClick={() => { setNotice(""); setEntryOpen(true); }}><Plus className="size-4" />Add soil test</Button></div>
    </section>
    {notice && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-green-800"><Check className="size-4" />{notice}</p>}
    {latest.error && <Failure text={`Readings: ${latest.error}`} retry={refresh} />}
    <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4" aria-label="Current farm readings">
      {primaryMetrics.map(({ metric: key, icon: Icon, color }) => {
        const reading = latestByMetric[key];
        return <article key={key} aria-label={dashboardMetrics[key].label} className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${color}`}><Icon className="size-5" /></div>{reading && <span className="hidden text-xs text-zinc-700 sm:inline">{readingAge(reading, now)}</span>}</div><p className="mt-5 text-sm font-medium text-zinc-700">{dashboardMetrics[key].label}</p>{latest.loading ? <div aria-label="Loading reading" className="mt-2 h-8 w-20 animate-pulse rounded bg-zinc-100" /> : <p className="mt-1 break-words text-2xl font-semibold text-zinc-950">{readingValue(reading)}</p>}<div className="mt-3 min-h-6">{reading ? <SourceBadge source={reading.source} /> : <span className="text-xs text-zinc-700">{latest.loading ? "Loading" : latest.error ? "Unavailable" : "No reading"}</span>}</div>{reading && <p className="mt-2 text-xs leading-5 text-zinc-700"><time dateTime={reading.recorded_at}>{timeLabel(reading.recorded_at)}</time><span className="block sm:hidden">{readingAge(reading, now)}</span></p>}</article>;
      })}
    </section>
    <section className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-b pb-6 lg:grid-cols-4" aria-label="Nutrients and rainfall">
      {(["nitrogen", "phosphorus", "potassium", "rainfall"] as const).map((key) => { const reading = latestByMetric[key]; return <div key={key} className="min-w-0"><p className="text-xs font-medium text-zinc-700">{dashboardMetrics[key].label}</p><p className="mt-1 break-words text-lg font-semibold text-zinc-950">{latest.loading ? "Loading" : readingValue(reading)}</p>{reading ? <><div className="mt-2"><SourceBadge source={reading.source} /></div><p className="mt-2 text-xs text-zinc-700">{readingAge(reading, now)}<br />{timeLabel(reading.recorded_at)}</p></> : <p className="mt-2 text-xs text-zinc-700">{latest.error ? "Unavailable" : latest.loading ? "" : "No reading"}</p>}</div>; })}
    </section>
    <div className="mt-7 grid gap-8 xl:grid-cols-3">
      <section className="min-w-0 xl:col-span-2" aria-label="Reading history">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-zinc-950">Field trends</h3><p className="mt-1 text-xs text-zinc-700">Latest 500 readings per metric. Times shown locally.</p></div><IconButton label="Download filtered readings" onClick={downloadHistory} disabled={!chartReadings.length || history.loading}><ArrowDownToLine className="size-4" /></IconButton></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><select aria-label="Chart metric" className={selectStyle} value={metric} onChange={(event) => setMetric(event.target.value as DashboardMetric)}>{Object.entries(dashboardMetrics).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select><Tabs value={days} onValueChange={setDays}><TabsList aria-label="Chart period"><TabsTrigger value="1">24h</TabsTrigger><TabsTrigger value="7">7 days</TabsTrigger><TabsTrigger value="30">30 days</TabsTrigger></TabsList></Tabs></div>
        {history.loading ? <Loading label="Loading history" /> : history.error ? <Failure text={history.error} retry={refresh} /> : chartReadings.length ? <>
          <div className="mt-6 h-[270px] min-w-0" role="img" aria-label={`${dashboardMetrics[metric].label} chart, ${chartReadings.length} readings`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartReadings.map((reading) => ({ ...reading, timestamp: Date.parse(reading.recorded_at), amount: Number(reading.value) }))} margin={{ top: 12, right: 8, bottom: 8, left: -15 }}><CartesianGrid stroke="#e4e4e7" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} minTickGap={50} tickFormatter={(value) => new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", hour: "numeric" }).format(value)} tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis width={55} domain={metric === "ph" ? [0, 14] : metric === "soil_moisture" || metric === "humidity" ? [0, 100] : ["auto", "auto"]} tick={{ fill: "#52525b", fontSize: 12 }} axisLine={false} tickLine={false} /><ChartTooltip content={({ active, payload }) => { const reading = payload?.[0]?.payload as DashboardReading | undefined; return active && reading ? <div className="rounded-md border bg-white p-3 text-xs text-zinc-900 shadow-sm"><p>{timeLabel(reading.recorded_at)}</p><p className="my-2 font-semibold">{readingValue(reading)}</p><SourceBadge source={reading.source} /></div> : null; }} /><Area type="linear" dataKey="amount" stroke="#237a4b" fill="#dcfce7" strokeWidth={2} dot={{ r: 3, fill: "#237a4b" }} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-700"><span>{chartReadings.length} readings / {dashboardMetrics[metric].unit}</span>{chartReadings.some((reading) => reading.source === "simulated") && <SourceBadge source="simulated" />}</div>
          <details className="mt-4 border-y py-3"><summary className="cursor-pointer text-sm font-medium text-zinc-800">View chart data</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-white"><tr><th className="p-2">Measured</th><th className="p-2">Value</th><th className="p-2">Source</th></tr></thead><tbody>{chartReadings.map((reading) => <tr key={reading.id} className="border-t"><td className="p-2">{timeLabel(reading.recorded_at)}</td><td className="p-2">{readingValue(reading)}</td><td className="p-2">{reading.source}</td></tr>)}</tbody></table></div></details>
        </> : <div className="flex h-[270px] items-center justify-center border-b text-center text-sm text-zinc-700">No {dashboardMetrics[metric].label.toLowerCase()} readings in this period.</div>}
      </section>
      <WeatherPanel farm={farm} weather={weather} retry={refresh} />
    </div>
    <div className="mt-8 grid gap-8 border-t pt-7 lg:grid-cols-2">
      <section aria-label="Data readiness"><div className="flex items-center gap-2"><TriangleAlert className="size-4 text-amber-700" /><h3 className="text-base font-semibold text-zinc-950">Data readiness</h3></div>{latest.loading ? <Loading label="Checking readings" /> : latest.error ? <p className="mt-4 text-sm text-zinc-700">Readings could not be checked.</p> : <div className="mt-5 space-y-4 text-sm text-zinc-700"><p><span className="font-semibold text-zinc-950">{8 - missing.length} of 8 metrics recorded.</span>{missing.length > 0 && ` Missing: ${missing.map((key) => dashboardMetrics[key as DashboardMetric].label.toLowerCase()).join(", ")}.`}</p>{simulated.length > 0 && <p className="border-l-2 border-amber-500 pl-3"><span className="font-semibold text-amber-900">{simulated.length} simulated inputs.</span> Any dependent predictions use simulated data, not verified field measurements.</p>}{old.length > 0 && <p className="border-l-2 border-blue-500 pl-3">{old.length} measurements are older than 24 hours or have future timestamps. Review their measurement times.</p>}<p>Recorded soil type: <span className="font-semibold capitalize text-zinc-950">{farm.soil_type ?? "Not recorded"}</span></p><Button asChild variant="outline"><Link href="/assistant">Open farm analysis<ArrowRight className="size-4" /></Link></Button></div>}</section>
      <section aria-label="Farm devices"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Radio className="size-4 text-green-700" /><h3 className="text-base font-semibold text-zinc-950">Farm devices</h3></div><Button asChild variant="ghost" size="sm"><Link href="/farms">Manage<ArrowRight className="size-4" /></Link></Button></div><p className="mt-1 text-xs text-zinc-700">Connected = backend heartbeat within five minutes.</p>{devices.loading ? <Loading label="Loading devices" /> : devices.error ? <Failure text={devices.error} retry={refresh} /> : devices.data?.length ? <div className="mt-4 max-h-80 overflow-auto">{devices.data.map((device) => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-4"><div className="min-w-0"><p className="break-words text-sm font-semibold text-zinc-950">{device.name}</p><p className="mt-1 text-xs text-zinc-700">{device.last_seen_at ? `Last seen ${timeLabel(device.last_seen_at)}` : "No heartbeat received"}</p></div><Badge variant="outline" className={device.is_active && device.connection_status === "connected" ? "border-green-200 bg-green-50 text-green-800" : "border-zinc-300 text-zinc-700"}>{!device.is_active ? "Inactive" : device.connection_status === "connected" ? "Connected" : device.connection_status === "offline" ? "Offline" : "Never connected"}</Badge></div>)}</div> : <div className="py-8 text-sm text-zinc-700">No devices registered to this farm.<Button asChild variant="outline" className="mt-4 flex w-fit"><Link href="/farms"><Plus className="size-4" />Register device</Link></Button></div>}</section>
    </div>
    <SoilEntry farm={farm} open={entryOpen} onOpenChange={setEntryOpen} onSaved={() => { setEntryOpen(false); setNotice("Soil test saved. Latest readings updated."); refresh(); }} />
  </>;
}

function WeatherPanel({ farm, weather, retry }: { farm: Farm; weather: Resource<Forecast>; retry: () => void }) {
  return <section className="min-w-0 border-t pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0" aria-label="Farm weather"><div className="flex items-center justify-between"><h3 className="text-base font-semibold text-zinc-950">Local weather</h3><CloudSun className="size-5 text-amber-700" /></div>{farm.latitude === null || farm.longitude === null ? <div className="py-8"><MapPin className="size-7 text-green-700" /><p className="mt-3 text-sm text-zinc-700">Add farm coordinates to see its forecast.</p><Button asChild variant="outline" className="mt-4"><Link href="/farms">Set location<ArrowRight className="size-4" /></Link></Button></div> : weather.loading ? <Loading label="Loading weather" /> : weather.error ? <Failure text={weather.error} retry={retry} /> : weather.data && <><p className="mt-1 text-xs text-zinc-700">{weather.data.location}</p><div className="mt-6 flex items-center gap-4"><CloudSun className="size-12 shrink-0 text-amber-600" /><div><p className="text-4xl font-semibold text-zinc-950">{weather.data.current.temperature_c.toFixed(1)}<span className="text-xl"> C</span></p><p className="mt-1 text-sm text-zinc-700">{weatherLabel(weather.data.current.weather_code)}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3 border-y py-4 text-sm text-zinc-700"><div><Wind className="mb-2 size-4 text-teal-800" />Humidity<p className="mt-1 font-semibold text-zinc-950">{weather.data.current.relative_humidity_percent}%</p></div><div><CloudRain className="mb-2 size-4 text-blue-800" />Precipitation<p className="mt-1 font-semibold text-zinc-950">{weather.data.current.precipitation_mm} mm</p></div></div><div className="mt-3">{weather.data.days.slice(0, 3).map((day) => <div key={day.date} className="flex items-center justify-between gap-2 border-b py-3 text-xs text-zinc-700"><span>{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</span><span className="font-medium text-zinc-950">{day.temperature_min_c.toFixed(0)} / {day.temperature_max_c.toFixed(0)} C</span><span className="flex items-center gap-1"><Droplets className="size-3 text-blue-700" />{day.precipitation_probability_percent}%</span></div>)}</div><p className="mt-4 text-xs leading-5 text-zinc-700">{weather.data.source} / {weather.data.timezone}<br />Weather estimates, not on-farm sensor readings.</p><Button asChild variant="ghost" size="sm" className="mt-2 -ml-3"><Link href="/weather">Seven-day forecast<ArrowRight className="size-4" /></Link></Button></>}</section>;
}

function SoilEntry({ farm, open, onOpenChange, onSaved }: { farm: Farm; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const values = new FormData(event.currentTarget);
    const readings = soilFields.flatMap((metric) => { const value = String(values.get(metric) ?? "").trim(); return value === "" ? [] : [{ metric, value }]; });
    if (!readings.length) { setError("Enter at least one soil-test value."); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/farms/${farm.id}/readings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readings }) });
      if (response.status === 401) { router.replace("/login"); router.refresh(); throw new Error("Please sign in again."); }
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save soil test. Check the values and try again.");
      onSaved();
    } catch (failure) { setError((failure as Error).message); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) { setError(""); onOpenChange(next); } }}><DialogContent className="sm:max-w-lg"><form onSubmit={save}><DialogHeader><DialogTitle>Add soil test</DialogTitle><DialogDescription>{farm.name}. Saved as manual soil-test results, not device measurements.</DialogDescription></DialogHeader><div className="my-6 grid gap-4 sm:grid-cols-2">{soilFields.map((metric) => <div key={metric} className="space-y-2"><Label htmlFor={`dashboard-${metric}`}>{dashboardMetrics[metric].label}{metric !== "ph" ? " (mg/kg)" : ""}</Label><Input id={`dashboard-${metric}`} name={metric} type="number" min="0" max={metric === "ph" ? "14" : "10000"} step="0.0001" disabled={saving} /></div>)}</div>{error && <p role="alert" className="mb-4 text-sm text-red-800">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Save readings</Button></DialogFooter></form></DialogContent></Dialog>;
}