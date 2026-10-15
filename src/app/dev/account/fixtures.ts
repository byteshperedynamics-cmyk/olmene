import type { AccountOverview, Identity, ProfileRow } from "@/lib/account-client";
import type { SiteProgress } from "@/lib/account/progress";

// Example data only (acme-analytics.com), for the /dev/account/ and /dev/share/ previews.
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const climb = [48, 48, 52, 55, 55, 61, 64, 70, 73, 79];

export const SITE_GROWING: SiteProgress = {
  siteId: "site-1",
  host: "acme-analytics.com",
  url: "https://acme-analytics.com/",
  since: day(66),
  monitor: true,
  scoreNow: 79,
  scoreFirst: 48,
  history: climb.map((score, i) => ({ at: day(63 - i * 7), score })),
  checksPassing: 18,
  checksTotal: 21,
  checksFixed: 7,
  aiMentionShare: 0.4,
};

export const SITE_NEW: SiteProgress = {
  siteId: "site-2",
  host: "shop.acme.example",
  url: "https://shop.acme.example/",
  since: day(2),
  monitor: true,
  scoreNow: 47,
  scoreFirst: 47,
  history: [{ at: day(2), score: 47 }],
  checksPassing: 11,
  checksTotal: 21,
  checksFixed: 0,
  aiMentionShare: null,
};

export const IDENTITY: Identity = {
  name: "Ada Lovelace",
  firstName: "Ada",
  email: "ada@acme-analytics.com",
  avatarUrl: null,
  providerAvatarUrl: null,
  initials: "AL",
  providers: ["google", "email"],
  createdAt: day(70),
  lastSignInAt: day(0),
};

export const PROFILE: ProfileRow = {
  display_name: "Ada Lovelace",
  avatar_path: null,
  notify_email: true,
  digest_email: false,
  onboarded_at: day(70),
  created_at: day(70),
};

export const OVERVIEW: AccountOverview = {
  sites: [SITE_GROWING, SITE_NEW],
  totals: { reports: 3, fixesShipped: 5, sites: 2 },
  shares: [{ siteId: "site-1", slug: "k7m2xq9pwd", showName: true, views: 12, createdAt: day(5) }],
  plan: { renews: true, renewsAt: day(-12) },
};
