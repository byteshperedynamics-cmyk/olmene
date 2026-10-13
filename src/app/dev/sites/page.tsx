import { notFound } from "next/navigation";
import { SitesPreview } from "./preview";

export const metadata = { title: "sites states", robots: { index: false } };

/** Dev-only: Overview, AI search visibility and PR checks with example data. 404 in production. */
export default function DevSitesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SitesPreview />;
}
