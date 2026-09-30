import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing-content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Olmene plans — counted in reports, not seats. Starter and Pro, cancel any time. Failed analyses never count against your quota.",
};

export default function PricingPage() {
  return <PricingContent />;
}
