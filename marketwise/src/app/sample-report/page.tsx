import type { Metadata } from "next";
import { SampleReportContent } from "@/components/sample-report-content";

export const metadata: Metadata = {
  title: "Sample marketing report",
  description:
    "A full Marketwise report for a fictional brand — scores, cited market view, verified competitors, a five-part site audit, strategy and a 7/30/60/90-day roadmap.",
};

export default function SampleReportPage() {
  return <SampleReportContent />;
}
