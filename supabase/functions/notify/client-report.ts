// What a client report says, read when notify sends it (so a test and the
// scheduled one are the same email): the client, the agency's branding,
// each site's score now against the start of the period, and the client
// page link when it's on. Rows are the workspace owner's (user_id).
import { type Cadence, canWhiteLabel, emailSafeLogo, periodPhrase, periodStart, REPORT_SITES, type ReportSite, senderName, summarizeSite } from "../_shared/client-report.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface ClientReportView {
  client: string;
  agency: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  whiteLabel: boolean;
  /** "this week" / "in October" / "this month". */
  period: string;
  cadence: Cadence;
  sites: ReportSite[];
  /** The client's page (/c/<slug>/) when it's on. */
  pageUrl: string | null;
  fromName: string;
  /** The workspace owner's address, so replies reach the agency. */
  replyTo: string | null;
}

async function ownerPlanSlug(db: Db, ownerId: string): Promise<string | null> {
  const { data: subs } = await db.from("subscriptions").select("polar_product_id, status, current_period_end").eq("user_id", ownerId).in("status", ["active", "trialing", "past_due"]).limit(5);
  const now = Date.now();
  const live = ((subs ?? []) as { polar_product_id: string; current_period_end: string | null }[]).find((s) => !s.current_period_end || Date.parse(s.current_period_end) > now);
  if (!live) return null;
  const { data: plan } = await db.from("plans").select("slug").eq("polar_product_id", live.polar_product_id).maybeSingle();
  return (plan?.slug as string | undefined) ?? null;
}

/** The report for one client, or null when there's nothing to send (client gone, not an agency, no scored sites). */
export async function loadClientReport(
  db: Db,
  opts: { ownerId: string; clientId: string; cadence: Cadence; end: Date; appUrl: string; storageUrl: string },
): Promise<ClientReportView | null> {
  const [{ data: client }, { data: ws }, { data: portal }, { data: siteRows }, plan, { data: owner }] = await Promise.all([
    db.from("clients").select("name").eq("id", opts.clientId).eq("user_id", opts.ownerId).maybeSingle(),
    db.from("workspaces").select("kind, brand_name, brand_color, logo_path, white_label").eq("owner_id", opts.ownerId).maybeSingle(),
    db.from("client_portals").select("slug").eq("client_id", opts.clientId).maybeSingle(),
    db.from("sites").select("id, host, last_score, last_checklist").eq("user_id", opts.ownerId).eq("client_id", opts.clientId).not("last_score", "is", null)
      .order("created_at", { ascending: true }).limit(REPORT_SITES),
    ownerPlanSlug(db, opts.ownerId),
    db.from("profiles").select("email").eq("id", opts.ownerId).maybeSingle(),
  ]);
  if (!client || ws?.kind !== "agency" || !siteRows?.length) return null;

  const start = periodStart(opts.cadence, opts.end);
  const sites: ReportSite[] = await Promise.all(
    (siteRows as { id: string; host: string; last_score: unknown; last_checklist: unknown }[]).map(async (s) => {
      const { data: before } = await db.from("scans").select("score:result->scores->overall, checklist:result->checklist")
        .eq("site_id", s.id).lt("created_at", start.toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return summarizeSite(s, before ?? null);
    }),
  );

  const agency = typeof ws.brand_name === "string" && ws.brand_name.trim() ? ws.brand_name.trim() : null;
  const whiteLabel = !!ws.white_label && canWhiteLabel(plan);
  const app = opts.appUrl.replace(/\/$/, "");
  return {
    client: client.name as string,
    agency,
    brandColor: typeof ws.brand_color === "string" ? ws.brand_color : null,
    logoUrl: ws.logo_path ? emailSafeLogo(`${opts.storageUrl.replace(/\/$/, "")}/storage/v1/object/public/brand-assets/${ws.logo_path}`) : null,
    whiteLabel,
    period: periodPhrase(opts.cadence, start),
    cadence: opts.cadence,
    sites,
    pageUrl: portal?.slug ? `${app}/c/${portal.slug}/` : null,
    fromName: senderName(agency, whiteLabel),
    replyTo: typeof owner?.email === "string" && owner.email.includes("@") ? owner.email : null,
  };
}
