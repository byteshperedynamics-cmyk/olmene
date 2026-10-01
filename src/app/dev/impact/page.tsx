import { notFound } from "next/navigation";
import { ImpactPreview } from "./preview";

export const metadata = { title: "impact states", robots: { index: false } };

/** Dev-only: the impact dashboard in each state, with example data. 404 in production. */
export default function DevImpactPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ImpactPreview />;
}
