import type { Metadata } from "next";
import { ReportUnsubscribe } from "@/components/agency/report-unsubscribe";
import { getServiceDb } from "@/lib/agent/db";
import { isUnsubToken, loadUnsubscribe } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // No " — Olmene" suffix: white-label agencies' clients land here too.
  title: { absolute: "Email reports" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { searchParams: Promise<{ t?: string | string[] }> };

/**
 * /unsubscribe/?t=…: the "Unsubscribe" link in a client report. It asks
 * before stopping anything; the button does it (mail scanners open every
 * link in an email, so a link alone must never unsubscribe anyone).
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const { t } = await searchParams;
  const token = typeof t === "string" && isUnsubToken(t) ? t : null;
  const view = token ? await loadUnsubscribe(getServiceDb(), token).catch(() => null) : null;
  return <ReportUnsubscribe view={view} token={token} />;
}
