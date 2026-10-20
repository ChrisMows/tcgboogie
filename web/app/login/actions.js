"use server";

import { redirect } from "next/navigation";
import { authEnabled, enabledProviders, signIn } from "@/auth";
import { demoMode, safeNext } from "@/lib/session";

// `next`: the member page they were trying to open (e.g. a deal from an alert); checked by safeNext.
export async function signInWith(provider, next) {
  if (demoMode) redirect(safeNext(next));
  if (!authEnabled || !enabledProviders.includes(provider)) redirect("/login?error=unavailable");
  await signIn(provider, { redirectTo: safeNext(next) });
}

export async function signInWithEmail(formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (demoMode) redirect(next);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) redirect("/login?error=email");
  if (!authEnabled || !enabledProviders.includes("email")) redirect("/login?error=unavailable");
  await signIn("email", { email, redirectTo: next });
}
