import { redirect } from "next/navigation";
import { ReadingsWorkspace } from "@/components/readings-workspace";
import { getFarms, getProfile } from "@/lib/auth";

export default async function ReadingsPage() {
  const [profile, farms] = await Promise.all([getProfile(), getFarms()]);
  if (!profile || !farms) redirect("/login");
  return <ReadingsWorkspace profile={profile} farms={farms} />;
}