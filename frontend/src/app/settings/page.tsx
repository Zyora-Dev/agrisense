import { redirect } from "next/navigation";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { getProfile } from "@/lib/auth";

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return <SettingsWorkspace profile={profile} />;
}