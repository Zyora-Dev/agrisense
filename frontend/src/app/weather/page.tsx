import { redirect } from "next/navigation";
import { WeatherWorkspace } from "@/components/weather-workspace";
import { getFarms, getProfile } from "@/lib/auth";

export default async function WeatherPage() {
  const [profile, farms] = await Promise.all([getProfile(), getFarms()]);
  if (!profile || !farms) redirect("/login");
  return <WeatherWorkspace profile={profile} farms={farms} />;
}