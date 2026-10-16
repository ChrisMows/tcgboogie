"use server";

import { redirect } from "next/navigation";
import { authEnabled, enabledProviders, signIn } from "@/auth";
import { demoMode } from "@/lib/session";

export async function signInWith(provider) {
  if (demoMode) redirect("/app");
  if (!authEnabled || !enabledProviders.includes(provider)) redirect("/login?error=unavailable");
  await signIn(provider, { redirectTo: "/app" });
}

export async function signInWithEmail(formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (demoMode) redirect("/app");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) redirect("/login?error=email");
  if (!authEnabled || !enabledProviders.includes("email")) redirect("/login?error=unavailable");
  await signIn("email", { email, redirectTo: "/app" });
}
