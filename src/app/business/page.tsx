import type { Metadata } from "next";
import { BusinessContent } from "@/components/business/business-content";

export const metadata: Metadata = {
  title: "For agencies",
  description:
    "Fixes and white-label reports for up to 5 client sites, €149 a month or about €30 per site. Try the Team plan free for 14 days. Every fix is reviewed before it ships.",
  alternates: { canonical: "/business/" },
};

/** /business/: Olmene for companies and agencies, and the free-trial request. */
export default function BusinessPage() {
  return <BusinessContent />;
}
