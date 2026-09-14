import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

export default async function Home() {
  redirect((await getProfile()) ? "/dashboard" : "/login");
}
