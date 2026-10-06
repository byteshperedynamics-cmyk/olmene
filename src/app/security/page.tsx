import type { Metadata } from "next";
import { SecurityContent } from "@/components/v2/security/security-content";

export const metadata: Metadata = {
  title: "Security & trust",
  description: "Exactly what Olmene's GitHub app can and cannot do, how your code and data are handled, and who operates Olmene.",
};

export default function SecurityPage() {
  return <SecurityContent />;
}
