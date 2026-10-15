import { notFound } from "next/navigation";
import { PortalPreview } from "./preview";

export const metadata = { title: "client page states", robots: { index: false } };

type Props = { searchParams: Promise<{ state?: string | string[] }> };

/**
 * Dev-only: a client's page (/c/[slug]/) with example data. 404 in production.
 * Server-rendered like the real page, so data-agency-page is there before the
 * cookie banner looks for it.
 */
export default async function DevPortalPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return <PortalPreview state={typeof state === "string" ? state : null} />;
}
