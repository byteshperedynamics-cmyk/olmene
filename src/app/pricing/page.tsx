import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing-content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Olmene plans: a free scan, then fixes shipped as pull requests and a weekly re-check of your site. Cancel any time.",
};

export default function PricingPage() {
  return <PricingContent />;
}
