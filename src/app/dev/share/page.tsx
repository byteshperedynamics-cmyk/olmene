import { notFound } from "next/navigation";
import { SharePreview } from "./preview";

export const metadata = { title: "share states", robots: { index: false } };

type Props = { searchParams: Promise<{ state?: string | string[] }> };

/**
 * Dev-only: the public progress page with example data (?state=new|anon|gone|agency|agency-wl). 404 in production.
 * Server-rendered like the real page, so agency links carry data-agency-page from the start.
 */
export default async function DevSharePage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return <SharePreview state={typeof state === "string" ? state : null} />;
}
