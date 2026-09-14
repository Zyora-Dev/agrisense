import { redirect } from "next/navigation";
import { AssistantWorkspace } from "@/components/assistant-workspace";
import { getFarms, getProfile } from "@/lib/auth";

export default async function AssistantPage() {
  const [profile, farms] = await Promise.all([getProfile(), getFarms()]);
  if (!profile || !farms) redirect("/login");
  return <AssistantWorkspace profile={profile} farms={farms} />;
}