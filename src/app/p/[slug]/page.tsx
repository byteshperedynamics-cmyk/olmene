import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { PublicProgress } from "@/components/account/public-progress";
import { getServiceDb } from "@/lib/agent/db";
import { isShareSlug, scoreDelta } from "@/lib/account/progress";
import { loadPublicShare, type PublicShare } from "@/lib/account/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

// One database read per request, shared by the metadata and the page.
const load = cache(async (slug: string): Promise<PublicShare | null> => {
  if (!isShareSlug(slug)) return null;
  try {
    return await loadPublicShare(getServiceDb(), slug);
  } catch {
    return null; // not configured (local dev) or the database is unreachable: show "not available"
  }
});

/** Link previews (chat apps, social) read these: the score and how far it moved. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const s = await load(slug);
  if (!s) return { title: "Link not available", robots: { index: false, follow: false } };
  const { site, owner } = s;
  const d = scoreDelta(site);
  const title =
    d != null && d > 0 && site.history.length > 1
      ? `${site.host}: from ${site.scoreFirst} to ${site.scoreNow} on Olmene`
      : `${site.host} on Olmene${site.scoreNow != null ? `: ${site.scoreNow}/100` : ""}`;
  const who = owner.name ? `${owner.name} is improving ${site.host}` : `${site.host} is improving`;
  const description = `${who} with Olmene. ${site.checksPassing} of ${site.checksTotal} checks pass, ${site.checksFixed} fixed since the first scan.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: `/p/${slug}/` },
    openGraph: { title, description, url: `/p/${slug}/`, type: "website", siteName: "Olmene" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const PREVIEW_BOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|discord|skype|embedly|vkshare|quora|pinterest|bing|google/i;

export default async function SharedProgressPage({ params }: Params) {
  const { slug } = await params;
  const s = await load(slug);
  if (s) {
    // Count people, not link-preview fetchers.
    const ua = (await headers()).get("user-agent") ?? "";
    if (ua && !PREVIEW_BOTS.test(ua)) {
      await Promise.resolve(getServiceDb().rpc("bump_share_views", { p_slug: slug })).catch(() => {});
    }
  }
  return <PublicProgress share={s ? { owner: s.owner, site: s.site } : null} />;
}
