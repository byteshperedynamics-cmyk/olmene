/**
 * Agencies on the Worker: clients, which site belongs to which client, the
 * agency's branding, and client portal links (/c/<slug>/). Service-role
 * client only; every change takes an Actor from requireActor().
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/agent/env";
import { loadSiteProgress } from "@/lib/account/server";
import { ensureWorkspace, ownerPlanSlug, TeamError, type Actor } from "@/lib/workspace/server";
import { canWhiteLabel, LOGO_MAX_BYTES, newPortalSlug, sniffImage, type BrandInput, type ClientInput } from "./rules";
import type { Brand, Client, ClientSite, ClientsView, PortalView } from "./types";

export { cleanBrandInput, cleanClientInput, isPortalSlug } from "./rules";

export const BRAND_BUCKET = "brand-assets";

export function brandAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${supabaseUrl().replace(/\/+$/, "")}/storage/v1/object/public/${BRAND_BUCKET}/${path}`;
}

interface WorkspaceBrandRow {
  id: string;
  kind: "company" | "agency";
  brand_name: string | null;
  brand_color: string | null;
  brand_url: string | null;
  logo_path: string | null;
  white_label: boolean;
}

async function brandRow(db: SupabaseClient, ownerId: string): Promise<WorkspaceBrandRow | null> {
  const { data } = await db
    .from("workspaces")
    .select("id, kind, brand_name, brand_color, brand_url, logo_path, white_label")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return (data as WorkspaceBrandRow | null) ?? null;
}

function toBrand(row: WorkspaceBrandRow | null, whiteLabelAllowed: boolean): Brand {
  return {
    name: row?.brand_name ?? null,
    color: row?.brand_color ?? null,
    url: row?.brand_url ?? null,
    logoUrl: brandAssetUrl(row?.logo_path),
    // Only honoured while the plan includes it, so a downgrade brings the credit back.
    whiteLabel: !!row?.white_label && whiteLabelAllowed,
  };
}

/** The agency's branding as client pages show it; null for workspaces that aren't agencies. */
export async function publicBrandOf(db: SupabaseClient, ownerId: string): Promise<Brand | null> {
  const row = await brandRow(db, ownerId);
  if (!row || row.kind !== "agency") return null;
  return toBrand(row, canWhiteLabel(await ownerPlanSlug(db, ownerId)));
}

// ── The Clients page ───────────────────────────────────────────────────────

interface SiteRow {
  id: string;
  host: string;
  url: string;
  last_score: number | null;
  client_id: string | null;
}

export async function clientsView(db: SupabaseClient, actor: Actor): Promise<ClientsView> {
  const ownerId = actor.ownerId;
  const [row, plan, clientsRes, sitesRes, portalsRes] = await Promise.all([
    brandRow(db, ownerId),
    ownerPlanSlug(db, ownerId),
    db.from("clients").select("id, name, website, contact_email, created_at").eq("user_id", ownerId).order("name").limit(500),
    db.from("sites").select("id, host, url, last_score, client_id").eq("user_id", ownerId).order("host").limit(1000),
    db.from("client_portals").select("client_id, slug, views, created_at").eq("user_id", ownerId).limit(500),
  ]);
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const portals = new Map(
    ((portalsRes.data ?? []) as { client_id: string; slug: string; views: number; created_at: string }[]).map((p) => [p.client_id, p]),
  );
  const site = (s: SiteRow): ClientSite => ({ id: s.id, host: s.host, url: s.url, lastScore: s.last_score });
  const clients: Client[] = ((clientsRes.data ?? []) as { id: string; name: string; website: string | null; contact_email: string | null; created_at: string }[]).map(
    (c) => {
      const p = portals.get(c.id);
      return {
        id: c.id,
        name: c.name,
        website: c.website,
        contactEmail: c.contact_email,
        createdAt: c.created_at,
        sites: sites.filter((s) => s.client_id === c.id).map(site),
        portal: p ? { slug: p.slug, views: p.views, createdAt: p.created_at } : null,
      };
    },
  );
  const whiteLabelAvailable = canWhiteLabel(plan);
  return {
    kind: row?.kind ?? "company",
    role: actor.role,
    brand: toBrand(row, whiteLabelAvailable),
    whiteLabelAvailable,
    clients,
    unassigned: sites.filter((s) => !s.client_id).map(site),
  };
}

// ── Clients ────────────────────────────────────────────────────────────────

export async function createClient(db: SupabaseClient, actor: Actor, input: ClientInput): Promise<string> {
  const { count } = await db.from("clients").select("id", { count: "exact", head: true }).eq("user_id", actor.ownerId);
  if ((count ?? 0) >= 500) throw new TeamError(409, "too_many_clients", "This workspace already has 500 clients.");
  const { data, error } = await db
    .from("clients")
    .insert({ user_id: actor.ownerId, name: input.name, website: input.website ?? null, contact_email: input.contactEmail ?? null })
    .select("id")
    .single();
  if (error || !data) throw new TeamError(500, "save_failed", "Couldn't add the client. Try again in a moment.");
  return (data as { id: string }).id;
}

export async function updateClient(db: SupabaseClient, actor: Actor, id: string, input: ClientInput): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.website !== undefined) patch.website = input.website;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  const { data } = await db.from("clients").update(patch).eq("id", id).eq("user_id", actor.ownerId).select("id");
  if (!data?.length) throw new TeamError(404, "not_found", "That client doesn't exist any more.");
}

/** Removes the client; its sites stay (unassigned) and its portal link stops working. */
export async function deleteClient(db: SupabaseClient, actor: Actor, id: string): Promise<void> {
  const { data } = await db.from("clients").delete().eq("id", id).eq("user_id", actor.ownerId).select("id");
  if (!data?.length) throw new TeamError(404, "not_found", "That client doesn't exist any more.");
}

/** Give a site to a client (or to none). Both must be the workspace's. */
export async function assignSite(db: SupabaseClient, actor: Actor, siteId: string, clientId: string | null): Promise<void> {
  if (clientId) {
    const { data: c } = await db.from("clients").select("id").eq("id", clientId).eq("user_id", actor.ownerId).maybeSingle();
    if (!c) throw new TeamError(404, "not_found", "That client doesn't exist any more.");
  }
  const { data } = await db.from("sites").update({ client_id: clientId }).eq("id", siteId).eq("user_id", actor.ownerId).select("id");
  if (!data?.length) throw new TeamError(404, "not_found", "That site isn't in this workspace.");
}

// ── Portal links ───────────────────────────────────────────────────────────

/** Turn on the client's page (or return the one that's on). */
export async function createPortal(db: SupabaseClient, actor: Actor, clientId: string): Promise<{ slug: string; views: number; createdAt: string }> {
  const { data: c } = await db.from("clients").select("id").eq("id", clientId).eq("user_id", actor.ownerId).maybeSingle();
  if (!c) throw new TeamError(404, "not_found", "That client doesn't exist any more.");
  const { data: existing } = await db.from("client_portals").select("slug, views, created_at").eq("client_id", clientId).maybeSingle();
  if (existing) {
    const e = existing as { slug: string; views: number; created_at: string };
    return { slug: e.slug, views: e.views, createdAt: e.created_at };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("client_portals")
      .insert({ user_id: actor.ownerId, client_id: clientId, slug: newPortalSlug() })
      .select("slug, views, created_at")
      .single();
    if (!error && data) {
      const d = data as { slug: string; views: number; created_at: string };
      return { slug: d.slug, views: d.views, createdAt: d.created_at };
    }
    if (error?.code !== "23505") break;
  }
  throw new TeamError(500, "portal_failed", "Couldn't create the link. Try again in a moment.");
}

export async function deletePortal(db: SupabaseClient, actor: Actor, clientId: string): Promise<void> {
  await db.from("client_portals").delete().eq("client_id", clientId).eq("user_id", actor.ownerId);
}

/** Everything /c/<slug>/ shows, or null when the link is off or unknown. */
export async function loadPortal(db: SupabaseClient, slug: string): Promise<PortalView | null> {
  const { data: portal } = await db.from("client_portals").select("user_id, client_id").eq("slug", slug).maybeSingle();
  if (!portal) return null;
  const p = portal as { user_id: string; client_id: string };
  const [{ data: client }, { data: siteRows }, brand] = await Promise.all([
    db.from("clients").select("name").eq("id", p.client_id).maybeSingle(),
    db.from("sites").select("id").eq("user_id", p.user_id).eq("client_id", p.client_id).order("created_at", { ascending: true }).limit(12),
    publicBrandOf(db, p.user_id),
  ]);
  if (!client) return null;
  const ids = ((siteRows ?? []) as { id: string }[]).map((s) => s.id);
  const sites = ids.length ? await loadSiteProgress(db, p.user_id, ids) : [];
  return {
    client: { name: (client as { name: string }).name },
    brand: brand ?? { name: null, color: null, url: null, logoUrl: null, whiteLabel: false },
    sites,
  };
}

// ── Branding ───────────────────────────────────────────────────────────────

/** Change the agency's branding (admins and the owner). Turns the workspace into an agency. */
export async function updateBrand(db: SupabaseClient, actor: Actor, input: BrandInput): Promise<void> {
  const ws = await ensureWorkspace(db, actor.ownerId);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), kind: "agency" };
  if (input.name !== undefined) patch.brand_name = input.name;
  if (input.color !== undefined) patch.brand_color = input.color;
  if (input.url !== undefined) patch.brand_url = input.url;
  if (input.whiteLabel !== undefined) {
    if (input.whiteLabel && !canWhiteLabel(await ownerPlanSlug(db, actor.ownerId))) {
      throw new TeamError(402, "plan_required", "Hiding Olmene's name on client pages comes with the Team plan.");
    }
    patch.white_label = input.whiteLabel;
  }
  const { error } = await db.from("workspaces").update(patch).eq("id", ws.id);
  if (error) throw new TeamError(500, "save_failed", "Couldn't save the branding. Try again in a moment.");
}

export async function setBrandLogo(db: SupabaseClient, actor: Actor, bytes: Uint8Array): Promise<string> {
  if (!bytes.byteLength) throw new TeamError(400, "bad_image", "That file is empty.");
  if (bytes.byteLength > LOGO_MAX_BYTES) throw new TeamError(413, "too_large", "Logos can be up to 512 KB. Export a smaller PNG or WebP.");
  const type = sniffImage(bytes);
  if (!type) throw new TeamError(415, "bad_image", "Use a PNG, JPEG or WebP logo.");
  const ws = await ensureWorkspace(db, actor.ownerId);
  const before = await brandRow(db, actor.ownerId);
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type];
  const path = `${ws.id}/${crypto.randomUUID().slice(0, 12)}.${ext}`;
  const up = await db.storage.from(BRAND_BUCKET).upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) throw new TeamError(500, "upload_failed", "Couldn't save the logo. Try again in a moment.");
  const { error } = await db.from("workspaces").update({ logo_path: path, kind: "agency", updated_at: new Date().toISOString() }).eq("id", ws.id);
  if (error) {
    await db.storage.from(BRAND_BUCKET).remove([path]);
    throw new TeamError(500, "upload_failed", "Couldn't save the logo. Try again in a moment.");
  }
  if (before?.logo_path && before.logo_path !== path) await db.storage.from(BRAND_BUCKET).remove([before.logo_path]);
  return brandAssetUrl(path)!;
}

export async function removeBrandLogo(db: SupabaseClient, actor: Actor): Promise<void> {
  const row = await brandRow(db, actor.ownerId);
  if (!row?.logo_path) return;
  await db.from("workspaces").update({ logo_path: null, updated_at: new Date().toISOString() }).eq("id", row.id);
  await db.storage.from(BRAND_BUCKET).remove([row.logo_path]);
}
