import { nextReportAt } from "@/lib/agency/rules";
import type { Brand, ClientReport, ClientsView } from "@/lib/agency/types";
import type { WorkspaceRole } from "@/lib/workspace/roles";

// Example data only (an invented agency and invented clients), for the
// /dev/clients/, /dev/portal/ and /dev/share/ previews.

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64" viewBox="0 0 320 64"><rect x="4" y="12" width="40" height="40" rx="10" fill="#1f6feb"/><path d="M14 42V22l20 20V22" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="58" y="43" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#0b1b33" letter-spacing="1">NORTHWIND</text></svg>`;

/** A made-up agency logo (the real thing is a PNG, JPEG or WebP upload). */
export const LOGO_URL = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

export const BRAND: Brand = {
  name: "Northwind Studio",
  color: "#1f6feb",
  url: "https://northwind.example/",
  logoUrl: LOGO_URL,
  whiteLabel: false,
};

export const NO_BRAND: Brand = { name: null, color: null, url: null, logoUrl: null, whiteLabel: false };

const site = (id: string, host: string, lastScore: number | null) => ({ id, host, url: `https://${host}/`, lastScore });

const REPORT_OFF: ClientReport = { cadence: "off", nextAt: null, sentAt: null, recipients: [] };

export function clientsFixture(opts: { role?: WorkspaceRole; state?: string | null; brand?: string | null; plan?: string | null } = {}): ClientsView {
  const role = opts.role ?? "admin";
  const whiteLabelAvailable = opts.plan !== "fix";
  const brand = opts.brand === "none" ? NO_BRAND : { ...BRAND, whiteLabel: opts.brand === "wl" && whiteLabelAvailable };
  if (opts.state === "company") {
    return { kind: "company", role, brand: NO_BRAND, whiteLabelAvailable, clients: [], unassigned: [site("s4", "greenleaf-yoga.example", 71)] };
  }
  if (opts.state === "new") return { kind: "agency", role, brand: NO_BRAND, whiteLabelAvailable, clients: [], unassigned: [] };
  if (opts.state === "empty") {
    return {
      kind: "agency",
      role,
      brand: opts.brand ? brand : NO_BRAND,
      whiteLabelAvailable,
      clients: [],
      unassigned: [site("s4", "greenleaf-yoga.example", 71), site("s5", "citymotors.example", null)],
    };
  }
  return {
    kind: "agency",
    role,
    brand,
    whiteLabelAvailable,
    clients: [
      {
        id: "c1",
        name: "Atlas Logistics",
        website: null,
        contactEmail: null,
        createdAt: day(2),
        sites: [],
        portal: null,
        report: REPORT_OFF,
      },
      {
        id: "c2",
        name: "Bakery Brothers",
        website: "https://bakerybrothers.example/",
        contactEmail: "owner@bakerybrothers.example",
        createdAt: day(40),
        sites: [site("s1", "bakerybrothers.example", 82), site("s2", "shop.bakerybrothers.example", 64)],
        portal: { slug: "k7m2xq9pwdab", views: 14, createdAt: day(30) },
        report: {
          cadence: "weekly",
          nextAt: nextReportAt("weekly", new Date())!.toISOString(),
          sentAt: day(5),
          recipients: [
            { id: "r1", email: "owner@bakerybrothers.example", unsubscribedAt: null, createdAt: day(30) },
            { id: "r2", email: "finance@bakerybrothers.example", unsubscribedAt: day(9), createdAt: day(30) },
          ],
        },
      },
      {
        id: "c3",
        name: "Harbor Dental",
        website: "https://harbordental.example/",
        contactEmail: "office@harbordental.example",
        createdAt: day(12),
        sites: [site("s3", "harbordental.example", 47)],
        portal: null,
        report: REPORT_OFF,
      },
    ],
    unassigned: [site("s4", "greenleaf-yoga.example", 71), site("s5", "citymotors.example", null)],
  };
}
