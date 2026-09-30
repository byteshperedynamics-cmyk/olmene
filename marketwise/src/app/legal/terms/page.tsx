import type { Metadata } from "next";
import { LegalContent } from "@/components/legal-content";
import { LT_SECTIONS } from "@/components/legal-content";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalContent variant="terms" sections={LT_SECTIONS} />;
}
