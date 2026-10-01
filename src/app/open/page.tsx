import type { Metadata } from "next";
import { OpenMetrics } from "./open-metrics";

export const metadata: Metadata = {
  title: "Open metrics",
  description: "Olmene's live numbers: free scans, fixes shipped as pull requests, merge rate and measured outcomes.",
};

export default function OpenPage() {
  return <OpenMetrics />;
}
