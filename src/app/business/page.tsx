import type { Metadata } from "next";
import { BusinessContent } from "@/components/business/business-content";

export const metadata: Metadata = {
  title: "For teams and agencies",
  description:
    "Try the Olmene Team plan free for 14 days: up to 5 people, client pages and email reports under your agency's name, and every fix reviewed before it ships.",
  alternates: { canonical: "/business/" },
};

/** /business/: Olmene for companies and agencies, and the free-trial request. */
export default function BusinessPage() {
  return <BusinessContent />;
}
