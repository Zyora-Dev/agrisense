import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "agrisense_session";
export const API_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

export type Farm = {
  id: string;
  name: string;
  location: string;
  latitude: string | null;
  longitude: string | null;
  area_hectares: string | null;
  soil_type: SoilType | null;
  detected_soil_type: SoilType | null;
  soil_type_confidence: string | null;
  soil_type_detected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SoilType = "sandy" | "clay" | "loamy" | "silty" | "peaty" | "chalky" | "mixed";

export type DeviceStatus = "connected" | "offline" | "never_connected";

export type IotDevice = {
  id: string;
  farm_id: string;
  name: string;
  serial_number: string;
  capabilities: string[];
  is_active: boolean;
  last_seen_at: string | null;
  connection_status: DeviceStatus;
  created_at: string;
};

export type ReadingMetric = "soil_moisture" | "temperature" | "humidity" | "ph" | "nitrogen" | "phosphorus" | "potassium";

export type SensorReading = {
  id: string;
  farm_id: string;
  device_id: string | null;
  metric: ReadingMetric;
  value: string;
  unit: string;
  source: "device" | "manual" | "simulated";
  recorded_at: string;
  created_at: string;
};

async function authenticatedGet<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("AgriSense service unavailable");
  return response.json();
}

export async function getProfile(): Promise<Profile | null> {
  return authenticatedGet<Profile>("/auth/me");
}

export async function getFarms(): Promise<Farm[] | null> {
  return authenticatedGet<Farm[]>("/farms/");
}