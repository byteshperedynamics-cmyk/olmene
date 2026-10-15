import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { ClientPortal } from "@/components/agency/client-portal";
import { getServiceDb } from "@/lib/agent/db";
import { isPortalSlug, loadPortal } from "@/lib/agency/server";
import type { PortalView } from "@/lib/agency/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

// One database read per request, shared by the metadata and the page.
const load = cache(async (slug: string): Promise<PortalView | null> => {
  if (!isPortalSlug(slug)) return null;
  try {
    return await loadPortal(getServiceDb(), slug);
  } catch {
    return null; // not configured (local dev) or the database is unreachable: show "not available"
  }
});

/** Never indexed; link previews show the client and who prepared it. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const v = await load(slug);
  if (!v) return { title: "Link not available", robots: { index: false, follow: false } };
  const title = `${v.client.name}: website progress${v.brand.name ? ` · ${v.brand.name}` : ""}`;
  const description = `${v.sites.length} ${v.sites.length === 1 ? "site" : "sites"}, updated every week${v.brand.name ? `. Prepared by ${v.brand.name}.` : "."}`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, description, url: `/c/${slug}/`, type: "website", siteName: v.brand.whiteLabel && v.brand.name ? v.brand.name : "Olmene" },
  };
}

const PREVIEW_BOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|skype|embedly|vkshare|quora|pinterest|bing|google/i;

export default async function ClientPortalPage({ params }: Params) {
  const { slug } = await params;
  const v = await load(slug);
  if (v) {
    // Count people, not link-preview fetchers.
    const ua = (await headers()).get("user-agent") ?? "";
    if (ua && !PREVIEW_BOTS.test(ua)) {
      await Promise.resolve(getServiceDb().rpc("bump_portal_views", { p_slug: slug })).catch(() => {});
    }
  }
  return <ClientPortal view={v} />;
}
