"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Camera, Check, ChevronDown, Copy, Cpu, EllipsisVertical, KeyRound, LoaderCircle,
  LocateFixed, LogOut, MapPin, Menu, Pencil, Plus, Radio, Router, Search, Trash2, Wifi, WifiOff,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Farm, IotDevice, Profile } from "@/lib/auth";

const capabilityOptions = [
  ["camera", "Crop camera"],
  ["soil_moisture", "Soil moisture"], ["temperature", "Temperature"], ["humidity", "Humidity"],
  ["ph", "Soil pH"], ["nitrogen", "Nitrogen"], ["phosphorus", "Phosphorus"], ["potassium", "Potassium"],
] as const;

type ProvisionedDevice = IotDevice & { device_key: string };

function errorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "detail" in data && typeof data.detail === "string") return data.detail;
  if (typeof data === "object" && data && "error" in data && typeof data.error === "string") return data.error;
  return fallback;
}

export function FarmManager({ profile, initialFarms }: { profile: Profile; initialFarms: Farm[] }) {
  const router = useRouter();
  const [farms, setFarms] = useState(initialFarms);
  const [selectedId, setSelectedId] = useState(initialFarms[0]?.id ?? "");
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [farmDialog, setFarmDialog] = useState<"create" | "edit" | null>(null);
  const [deviceDialog, setDeviceDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [provisioned, setProvisioned] = useState<ProvisionedDevice | null>(null);
  const [notice, setNotice] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const selectedFarm = farms.find((farm) => farm.id === selectedId) ?? null;
  const initials = profile.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    async function loadDevices() {
      setLoadingDevices(true);
      setNotice("");
      try {
        const response = await fetch(`/api/farms/${selectedId}/devices`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data, "Could not load devices."));
        setDevices(data);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setNotice((error as Error).message);
      } finally {
        setLoadingDevices(false);
      }
    }
    loadDevices();
    return () => controller.abort();
  }, [selectedId]);

  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out could not be confirmed. Please try again.");
      router.replace("/login"); router.refresh();
    } catch (failure) { setNotice((failure as Error).message);
    } finally { setLoggingOut(false); }
  }

  async function saveFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"), location: formData.get("location"),
      latitude: formData.get("latitude") || null, longitude: formData.get("longitude") || null,
      area_hectares: formData.get("area_hectares") || null,
      soil_type: formData.get("soil_type") || null,
    };
    const isEdit = farmDialog === "edit" && selectedFarm;
    const response = await fetch(isEdit ? `/api/farms/${selectedFarm.id}` : "/api/farms", {
      method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) { setNotice(errorMessage(data, "Could not save farm.")); return; }
    if (isEdit) setFarms((current) => current.map((farm) => farm.id === data.id ? data : farm));
    else { setFarms((current) => [...current, data]); setSelectedId(data.id); }
    setFarmDialog(null); setNotice("");
  }

  async function deleteFarm() {
    if (!selectedFarm) return;
    const response = await fetch(`/api/farms/${selectedFarm.id}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json(); setNotice(errorMessage(data, "Could not delete farm.")); return; }
    const remaining = farms.filter((farm) => farm.id !== selectedFarm.id);
    setFarms(remaining); setDevices([]); setSelectedId(remaining[0]?.id ?? ""); setDeleteDialog(false);
  }

  async function registerDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFarm) return;
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/farms/${selectedFarm.id}/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"), serial_number: formData.get("serial_number"),
        capabilities: formData.getAll("capabilities"),
      }),
    });
    const data = await response.json();
    if (!response.ok) { setNotice(errorMessage(data, "Could not register device.")); return; }
    const { device_key: _deviceKey, ...publicDevice } = data;
    void _deviceKey;
    setDevices((current) => [...current, publicDevice]);
    setDeviceDialog(false); setProvisioned(data); setNotice("");
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /><div className="mt-auto"><div className="mt-5 border-t border-white/20 pt-5 text-xs leading-5 text-white/90">Device registry<br /><span className="text-lime-200">Heartbeat monitoring active</span></div></div></aside>
      <main className="min-w-0 flex-1">
        <header className="dashboard-header">
          <div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="w-[290px] border-0 bg-[#123d2b] p-6 text-white"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand light /><WorkspaceNav /></SheetContent></Sheet><Brand /></div>
          <div className="hidden lg:block"><p className="text-xs font-semibold uppercase text-green-700">Farm workspace</p><h1 className="mt-1 text-xl font-semibold text-zinc-950">Farms & devices</h1></div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4"><Button variant="outline" size="icon" aria-label="Notifications"><Bell className="size-[18px]" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-11 gap-2 px-2 sm:px-3"><Avatar className="size-8"><AvatarFallback className="bg-green-100 text-xs font-semibold text-green-800">{initials}</AvatarFallback></Avatar><span className="hidden max-w-32 truncate text-sm sm:block">{profile.full_name}</span><ChevronDown className="hidden size-4 sm:block" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={logout} disabled={loggingOut}><LogOut className="size-4" />{loggingOut ? "Signing out..." : "Sign out"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        </header>

        <div className="dashboard-content">
          <section className="animate-enter flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">Operations</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-[30px]">Farm device registry</h2><p className="mt-2 text-sm text-zinc-600">Manage locations and provision the devices reporting from each farm.</p></div><Button className="h-10 self-start md:self-auto" onClick={() => setFarmDialog("create")}><Plus className="size-4" />Add farm</Button></section>

          {notice && <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{notice}</div>}

          {farms.length === 0 ? (
            <section className="farm-empty mt-8"><div className="metric-icon green mx-auto"><MapPin className="size-5" /></div><h3 className="mt-5 text-lg font-semibold text-zinc-950">Create your first farm</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">A farm groups its connected devices and future field readings under one location.</p><Button className="mt-6" onClick={() => setFarmDialog("create")}><Plus className="size-4" />Create farm</Button></section>
          ) : (
            <div className="farm-workspace mt-8">
              <aside className="farm-list-panel">
                <div className="flex items-center justify-between px-5 pb-4 pt-5"><div><p className="panel-title">Your farms</p><p className="panel-subtitle">{farms.length} location{farms.length === 1 ? "" : "s"}</p></div><Button variant="outline" size="icon-sm" aria-label="Add farm" onClick={() => setFarmDialog("create")}><Plus /></Button></div>
                <div className="farm-list">{farms.map((farm) => <button key={farm.id} type="button" className={`farm-list-item ${farm.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(farm.id)}><span className="farm-marker"><MapPin className="size-4" /></span><span className="min-w-0 text-left"><span className="block truncate text-sm font-semibold text-zinc-900">{farm.name}</span><span className="mt-1 block truncate text-xs text-zinc-600">{farm.location}</span></span></button>)}</div>
              </aside>

              {selectedFarm && <section className="min-w-0">
                <div className="panel farm-summary"><div className="flex min-w-0 items-start gap-4"><div className="metric-icon green shrink-0"><MapPin className="size-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-semibold text-zinc-950">{selectedFarm.name}</h3><Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">Active</Badge></div><p className="mt-1 text-sm text-zinc-600">{selectedFarm.location}{selectedFarm.area_hectares ? ` · ${selectedFarm.area_hectares} hectares` : ""}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">Recorded soil: {selectedFarm.soil_type?.replaceAll("_", " ") ?? "Not set"}</Badge><Badge variant="outline">Detected soil: {selectedFarm.detected_soil_type ? `${selectedFarm.detected_soil_type.replaceAll("_", " ")}${selectedFarm.soil_type_confidence ? ` (${Math.round(Number(selectedFarm.soil_type_confidence) * 100)}%)` : ""}` : "Not analyzed"}</Badge></div></div></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Farm actions"><EllipsisVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setFarmDialog("edit")}><Pencil className="size-4" />Edit farm</DropdownMenuItem><DropdownMenuItem className="text-red-700" onClick={() => setDeleteDialog(true)}><Trash2 className="size-4" />Delete farm</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>

                <div className="mt-4 panel"><div className="panel-heading"><div><p className="panel-title">IoT devices</p><p className="panel-subtitle">Connection status updates from device heartbeats</p></div><Button onClick={() => setDeviceDialog(true)}><Plus className="size-4" />Register device</Button></div>
                  {loadingDevices ? <div className="flex h-48 items-center justify-center text-sm text-zinc-600"><LoaderCircle className="mr-2 size-5 animate-spin" />Loading devices</div> : devices.length === 0 ? <div className="device-empty"><Router className="size-8 text-green-700" /><h4 className="mt-4 font-semibold text-zinc-950">No devices registered</h4><p className="mt-2 text-sm text-zinc-600">Register a device and select every capability it provides.</p><Button variant="outline" className="mt-5" onClick={() => setDeviceDialog(true)}><Cpu className="size-4" />Register device</Button></div> : <div className="device-grid mt-6">{devices.map((device) => <DeviceCard key={device.id} device={device} />)}</div>}
                </div>
              </section>}
            </div>
          )}
        </div>
      </main>

      <FarmDialog key={`${farmDialog}-${selectedFarm?.id ?? "new"}`} mode={farmDialog} farm={selectedFarm} onOpenChange={(open) => !open && setFarmDialog(null)} onSubmit={saveFarm} />
      <DeviceDialog open={deviceDialog} onOpenChange={setDeviceDialog} onSubmit={registerDevice} />
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}><DialogContent><DialogHeader><DialogTitle>Delete {selectedFarm?.name}?</DialogTitle><DialogDescription>This permanently removes the farm and all devices registered to it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancel</Button><Button variant="destructive" onClick={deleteFarm}><Trash2 />Delete farm</Button></DialogFooter></DialogContent></Dialog>
      <ProvisionDialog device={provisioned} onClose={() => setProvisioned(null)} />
    </div>
  );
}

function DeviceCard({ device }: { device: IotDevice }) {
  const status = device.connection_status;
  const StatusIcon = status === "connected" ? Wifi : status === "offline" ? WifiOff : Radio;
  const DeviceIcon = device.capabilities.includes("camera") ? Camera : Cpu;
  const label = status === "never_connected" ? "Never connected" : status[0].toUpperCase() + status.slice(1);
  return <article className="device-card"><div className="flex items-start justify-between gap-3"><div className="metric-icon blue"><DeviceIcon className="size-5" /></div><Badge variant="outline" className={status === "connected" ? "border-green-200 bg-green-50 text-green-800" : status === "offline" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}><StatusIcon />{label}</Badge></div><h4 className="mt-5 font-semibold text-zinc-950">{device.name}</h4><p className="mt-1 text-xs font-medium uppercase text-zinc-600">{device.serial_number}</p><div className="mt-4 flex flex-wrap gap-1.5">{device.capabilities.map((capability) => <span key={capability} className="sensor-chip">{capability.replace("_", " ")}</span>)}</div>{device.capabilities.includes("camera") && <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-800">Captures crop images for YOLO disease analysis in web and mobile.</p>}<p className="mt-5 border-t pt-4 text-xs text-zinc-600">{device.last_seen_at ? `Last seen ${new Date(device.last_seen_at).toLocaleString()}` : "Awaiting first heartbeat"}</p></article>;
}

function FarmDialog({ mode, farm, onOpenChange, onSubmit }: { mode: "create" | "edit" | null; farm: Farm | null; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [location, setLocation] = useState(mode === "edit" ? farm?.location ?? "" : "");
  const [latitude, setLatitude] = useState(mode === "edit" ? farm?.latitude ?? "" : "");
  const [longitude, setLongitude] = useState(mode === "edit" ? farm?.longitude ?? "" : "");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locationError, setLocationError] = useState("");

  async function searchLocations() {
    if (location.trim().length < 2) return;
    setSearching(true); setLocationError("");
    try {
      const response = await fetch(`/api/weather/locations?query=${encodeURIComponent(location.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data, "Could not search locations."));
      setResults(data);
      if (data.length === 0) setLocationError("No matching locations found.");
    } catch (error) { setLocationError((error as Error).message); }
    finally { setSearching(false); }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setLocationError("Location access is not supported by this browser."); return; }
    setSearching(true); setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = coords.latitude.toFixed(6); const lon = coords.longitude.toFixed(6);
        setLatitude(lat); setLongitude(lon); setLocation(`Farm location (${lat}, ${lon})`);
        setResults([]); setSearching(false);
      },
      () => { setLocationError("Location access was unavailable or denied."); setSearching(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return <Dialog open={mode !== null} onOpenChange={onOpenChange}><DialogContent className="overflow-visible sm:max-w-xl"><form onSubmit={onSubmit}><DialogHeader><DialogTitle>{mode === "edit" ? "Edit farm" : "Add farm"}</DialogTitle><DialogDescription>Select the exact location used for seven-day weather forecasts.</DialogDescription></DialogHeader><div className="mt-6 space-y-4"><div className="space-y-2"><Label htmlFor="farm-name">Farm name</Label><Input id="farm-name" name="name" defaultValue={mode === "edit" ? farm?.name : ""} required maxLength={100} placeholder="Green Valley Farm" /></div><div className="space-y-2"><Label htmlFor="farm-location">Farm location</Label><div className="flex gap-2"><Input id="farm-location" name="location" value={location} onChange={(event) => { setLocation(event.target.value); setLatitude(""); setLongitude(""); setResults([]); }} required maxLength={200} placeholder="Search village, city, or postal code" /><Button type="button" variant="outline" size="icon" aria-label="Search locations" onClick={searchLocations} disabled={searching || location.trim().length < 2}>{searching ? <LoaderCircle className="animate-spin" /> : <Search />}</Button><Button type="button" variant="outline" size="icon" aria-label="Use current location" onClick={useCurrentLocation} disabled={searching}><LocateFixed /></Button></div><input type="hidden" name="latitude" value={latitude} /><input type="hidden" name="longitude" value={longitude} />{results.length > 0 && <div className="location-results">{results.map((result) => <button type="button" key={`${result.latitude}-${result.longitude}`} onClick={() => { setLocation(result.display_name); setLatitude(String(result.latitude)); setLongitude(String(result.longitude)); setResults([]); }}><MapPin className="size-4" /><span>{result.display_name}</span></button>)}</div>}{locationError && <p className="text-xs font-medium text-red-700">{locationError}</p>}{latitude && longitude ? <p className="text-xs font-medium text-green-800">Exact coordinates selected: {latitude}, {longitude}</p> : <p className="text-xs text-zinc-600">Choose a search result or use current location to enable weather.</p>}</div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="farm-area">Area in hectares <span className="font-normal text-zinc-500">(optional)</span></Label><Input id="farm-area" name="area_hectares" type="number" min="0.01" step="0.01" defaultValue={mode === "edit" ? farm?.area_hectares ?? "" : ""} placeholder="4.75" /></div><div className="space-y-2"><Label htmlFor="farm-soil-type">Recorded soil type <span className="font-normal text-zinc-500">(optional)</span></Label><select id="farm-soil-type" name="soil_type" defaultValue={mode === "edit" ? farm?.soil_type ?? "" : ""} className="h-9 w-full rounded-md border bg-white px-3 text-sm text-zinc-900"><option value="">Unknown / not tested</option><option value="sandy">Sandy</option><option value="clay">Clay</option><option value="loamy">Loamy</option><option value="silty">Silty</option><option value="peaty">Peaty</option><option value="chalky">Chalky</option><option value="mixed">Mixed</option></select></div></div><p className="text-xs leading-5 text-zinc-600">Use a farmer observation or soil test here. Automatic detection will be shown separately with confidence when a validated detector is available.</p></div><DialogFooter className="mt-7"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">{mode === "edit" ? "Save changes" : "Create farm"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

type LocationResult = {
  name: string;
  display_name: string;
  latitude: string;
  longitude: string;
  timezone: string | null;
};

function DeviceDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><form onSubmit={onSubmit}><DialogHeader><DialogTitle>Register IoT device</DialogTitle><DialogDescription>Identify the device and select every sensor or camera capability connected to it.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="device-name">Device name</Label><Input id="device-name" name="name" required maxLength={100} placeholder="North field device" /></div><div className="space-y-2"><Label htmlFor="serial-number">Serial number</Label><Input id="serial-number" name="serial_number" required minLength={3} maxLength={100} placeholder="FIELD-001" /></div></div><fieldset className="mt-5"><legend className="text-sm font-medium text-zinc-900">Device capabilities</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{capabilityOptions.map(([value, label]) => <label key={value} className="capability-option"><input type="checkbox" name="capabilities" value={value} /><span>{label}</span></label>)}</div></fieldset><p className="mt-3 text-xs leading-5 text-zinc-600">pH and NPK values are entered manually for now. Device or simulated input is selected when readings are added, not while registering the device.</p><DialogFooter className="mt-7"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit"><Cpu />Register device</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ProvisionDialog({ device, onClose }: { device: ProvisionedDevice | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyKey() { if (!device) return; await navigator.clipboard.writeText(device.device_key); setCopied(true); }
  return <Dialog open={device !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><div className="success-icon mb-4 size-12 shadow-none"><KeyRound className="size-5" /></div><DialogTitle>Device registered</DialogTitle><DialogDescription>This provisioning key is displayed once. Store it securely before closing.</DialogDescription></DialogHeader><div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4"><p className="text-xs font-semibold uppercase text-green-800">Device key</p><code className="mt-2 block break-all text-sm font-semibold text-zinc-950">{device?.device_key}</code></div><DialogFooter className="mt-3"><Button variant="outline" onClick={copyKey}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy key"}</Button><Button onClick={onClose}>Done</Button></DialogFooter></DialogContent></Dialog>;
}