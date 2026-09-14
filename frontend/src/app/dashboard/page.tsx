import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getProfile } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return <DashboardShell profile={profile} />;
}
