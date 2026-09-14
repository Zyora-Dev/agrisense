import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getProfile } from "@/lib/auth";

export default async function RegisterPage() {
  if (await getProfile()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}