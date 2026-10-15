import { notFound } from "next/navigation";
import { PortalPreview } from "./preview";

export const metadata = { title: "client page states", robots: { index: false } };

/** Dev-only: a client's page (/c/[slug]/) with example data. 404 in production. */
export default function DevPortalPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PortalPreview />;
}
