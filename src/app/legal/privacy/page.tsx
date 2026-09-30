import type { Metadata } from "next";
import { LegalContent } from "@/components/legal-content";
import { LP_SECTIONS } from "@/components/legal-content";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalContent variant="privacy" sections={LP_SECTIONS} />;
}
