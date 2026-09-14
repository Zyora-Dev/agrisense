import { redirect } from "next/navigation";
import { FarmManager } from "@/components/farm-manager";
import { getFarms, getProfile } from "@/lib/auth";

export default async function FarmsPage() {
  const [profile, farms] = await Promise.all([getProfile(), getFarms()]);
  if (!profile || !farms) redirect("/login");
  return <FarmManager profile={profile} initialFarms={farms} />;
}