import { redirect } from "next/navigation";
import { MarketplaceWorkspace } from "@/components/marketplace-workspace";
import { getFarms, getProfile } from "@/lib/auth";

export default async function MarketplacePage() {
  const [profile, farms] = await Promise.all([getProfile(), getFarms()]);
  if (!profile || !farms) redirect("/login");
  return <MarketplaceWorkspace profile={profile} farms={farms} />;
}