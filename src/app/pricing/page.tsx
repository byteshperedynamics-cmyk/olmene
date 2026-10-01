import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing-content";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/config";
import type { Plan } from "@/lib/data";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Olmene plans: a free scan, then fixes shipped as pull requests and a weekly re-check of your site. Cancel any time.",
};

/**
 * Plans are read at build time so the prices are in the HTML that search
 * engines, AI search and link previews see; the grid still refreshes from the
 * database in the browser. Any failure falls back to the client fetch.
 */
async function loadPlans(): Promise<Plan[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/plans?select=*&active=eq.true&order=sort_order`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as Plan[];
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const plans = await loadPlans();
  return <PricingContent initialPlans={plans} />;
}
