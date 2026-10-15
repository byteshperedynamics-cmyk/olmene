import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { PublicProgress } from "@/components/account/public-progress";
import { getServiceDb } from "@/lib/agent/db";
import { isShareSlug, scoreDelta } from "@/lib/account/progress";
import { loadPublicShare, type PublicShare } from "@/lib/account/server";
import { publicBrandOf } from "@/lib/agency/server";
import type { Brand } from "@/lib/agency/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

// One database read per request, shared by the metadata and the page.
// Links an agency workspace shares carry its branding instead of Olmene's.
const load = cache(async (slug: string): Promise<(PublicShare & { brand: Brand | null }) | null> => {
  if (!isShareSlug(slug)) return null;
  try {
    const db = getServiceDb();
    const share = await loadPublicShare(db, slug);
    if (!share) return null;
    const brand = await publicBrandOf(db, share.ownerId).catch(() => null);
    return { ...share, brand };
  } catch {
    return null; // not configured (local dev) or the database is unreachable: show "not available"
  }
});

/** Link previews (chat apps, social) read these: the score and how far it moved. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const s = await load(slug);
  if (!s) return { title: "Link not available", robots: { index: false, follow: false } };
  const { site, owner, brand } = s;
  const d = scoreDelta(site);
  // White-labelled agency links don't name Olmene; other agency links name the agency.
  const by = brand?.whiteLabel ? (brand.name ? ` · ${brand.name}` : "") : brand?.name ? ` · ${brand.name}` : " on Olmene";
  const title =
    d != null && d > 0 && site.history.length > 1
      ? `${site.host}: from ${site.scoreFirst} to ${site.scoreNow}${by}`
      : `${site.host}${site.scoreNow != null ? `: ${site.scoreNow}/100` : ""}${by}`;
  const who = owner.name ? `${owner.name} is improving ${site.host}` : `${site.host} is improving`;
  const tool = brand?.name ? ` with ${brand.name}` : brand?.whiteLabel ? "" : " with Olmene";
  const description = `${who}${tool}. ${site.checksPassing} of ${site.checksTotal} checks pass, ${site.checksFixed} fixed since the first scan.`;
  const siteName = brand?.whiteLabel ? (brand.name ?? undefined) : (brand?.name ?? "Olmene");
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: `/p/${slug}/` },
    openGraph: { title, description, url: `/p/${slug}/`, type: "website", siteName },
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
  return <PublicProgress share={s ? { owner: s.owner, site: s.site, brand: s.brand } : null} />;
}
