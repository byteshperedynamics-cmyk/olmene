"use client";

/**
 * Dev-only stand-in for the Clients API, so /dev/clients/ works without a
 * backend: it answers the same routes with the same shapes and refusals as
 * the Worker (src/app/api/clients, sites/[id]/client, workspace/brand), from
 * memory. Installed by the preview, removed when it unmounts.
 */

import {
  canWhiteLabel,
  cleanBrandInput,
  cleanClientInput,
  cleanRecipientEmail,
  LOGO_MAX_BYTES,
  newPortalSlug,
  nextReportAt,
  RECIPIENTS_PER_CLIENT,
  sniffImage,
} from "@/lib/agency/rules";
import type { Client, ClientSite, ClientsView } from "@/lib/agency/types";
import { atLeast, roleRequiredMessage, TeamError, type WorkspaceRole } from "@/lib/workspace/roles";

type Site = ClientSite & { clientId: string | null };

export function installFakeClientsApi(initial: ClientsView): () => void {
  const view = structuredClone(initial);
  const sites: Site[] = [
    ...view.clients.flatMap((c) => c.sites.map((s) => ({ ...s, clientId: c.id }))),
    ...view.unassigned.map((s) => ({ ...s, clientId: null })),
  ];
  const clients: Omit<Client, "sites">[] = view.clients.map(({ sites: _sites, ...c }) => c);

  const snapshot = (): ClientsView => ({
    ...view,
    clients: [...clients]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ ...c, sites: sites.filter((s) => s.clientId === c.id).map(({ clientId: _c, ...s }) => s) })),
    unassigned: sites.filter((s) => !s.clientId).map(({ clientId: _c, ...s }) => s),
  });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const refuse = (status: number, code: string, msg: string) => json({ error: { code, message: msg } }, status);
  const need = (role: WorkspaceRole) => {
    if (!atLeast(view.role, role)) throw new TeamError(403, "forbidden", roleRequiredMessage(role));
  };
  const client = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (!c) throw new TeamError(404, "not_found", "That client doesn't exist any more.");
    return c;
  };

  async function handle(method: string, path: string, init?: RequestInit): Promise<Response | null> {
    const body = async () => (typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {});
    let m: RegExpMatchArray | null;
    if (path === "/api/clients/" && method === "GET") return json(snapshot());
    if (path === "/api/clients/" && method === "POST") {
      need("member");
      const input = cleanClientInput(await body(), true);
      const id = `c${Date.now()}`;
      clients.push({
        id,
        name: input.name!,
        website: input.website ?? null,
        contactEmail: input.contactEmail ?? null,
        createdAt: new Date().toISOString(),
        portal: null,
        report: { cadence: "off", nextAt: null, sentAt: null, recipients: [] },
      });
      return json({ id, view: snapshot() }, 201);
    }
    if ((m = path.match(/^\/api\/clients\/([^/]+)\/portal\/$/))) {
      need("member");
      const c = client(m[1]);
      if (method === "POST") c.portal ??= { slug: newPortalSlug(), views: 0, createdAt: new Date().toISOString() };
      else c.portal = null;
      return json({ view: snapshot() }, method === "POST" ? 201 : 200);
    }
    if ((m = path.match(/^\/api\/clients\/([^/]+)\/recipients\/$/)) && method === "POST") {
      need("member");
      const c = client(m[1]);
      const email = cleanRecipientEmail((await body()).email);
      const existing = c.report.recipients.find((r) => r.email === email);
      if (existing?.unsubscribedAt) throw new TeamError(409, "unsubscribed", `${email} unsubscribed from these reports, so Olmene won't email them again.`);
      if (existing) throw new TeamError(409, "already_added", `${email} already gets this report.`);
      if (c.report.recipients.filter((r) => !r.unsubscribedAt).length >= RECIPIENTS_PER_CLIENT) {
        throw new TeamError(409, "too_many_recipients", `A report can go to ${RECIPIENTS_PER_CLIENT} people. Remove someone first.`);
      }
      c.report.recipients.push({ id: `r${Date.now()}`, email, unsubscribedAt: null, createdAt: new Date().toISOString() });
      return json({ view: snapshot() }, 201);
    }
    if ((m = path.match(/^\/api\/clients\/([^/]+)\/recipients\/([^/]+)\/$/)) && method === "DELETE") {
      need("member");
      const c = client(m[1]);
      const r = c.report.recipients.find((x) => x.id === m![2]);
      if (!r) throw new TeamError(404, "not_found", "They aren't on this report any more.");
      if (r.unsubscribedAt) throw new TeamError(409, "unsubscribed", "They unsubscribed, so they stay on the list to make sure they aren't added back.");
      c.report.recipients.splice(c.report.recipients.indexOf(r), 1);
      return json({ view: snapshot() });
    }
    if ((m = path.match(/^\/api\/clients\/([^/]+)\/report-test\/$/)) && method === "POST") {
      need("member");
      const c = client(m[1]);
      if (!sites.some((s) => s.clientId === c.id && s.lastScore != null)) {
        throw new TeamError(409, "nothing_to_report", `Give ${c.name} a site with a finished scan first.`);
      }
      return json({ to: "you@northwind.example" }, 202);
    }
    if ((m = path.match(/^\/api\/clients\/([^/]+)\/$/))) {
      if (method === "PATCH") {
        need("member");
        const c = client(m[1]);
        const input = cleanClientInput(await body(), false);
        if (input.name !== undefined) c.name = input.name;
        if (input.website !== undefined) c.website = input.website;
        if (input.contactEmail !== undefined) c.contactEmail = input.contactEmail;
        if (input.reportCadence !== undefined && input.reportCadence !== c.report.cadence) {
          c.report.cadence = input.reportCadence;
          c.report.nextAt = nextReportAt(input.reportCadence, new Date())?.toISOString() ?? null;
        }
        return json({ view: snapshot() });
      }
      if (method === "DELETE") {
        need("admin");
        const c = client(m[1]);
        clients.splice(clients.indexOf(c), 1);
        for (const s of sites) if (s.clientId === c.id) s.clientId = null;
        return json({ view: snapshot() });
      }
    }
    if ((m = path.match(/^\/api\/sites\/([^/]+)\/client\/$/)) && method === "PUT") {
      need("member");
      const { clientId } = (await body()) as { clientId?: string | null };
      if (clientId) client(clientId);
      const s = sites.find((x) => x.id === m![1]);
      if (!s) throw new TeamError(404, "not_found", "That site isn't in this workspace.");
      s.clientId = clientId ?? null;
      return json({ view: snapshot() });
    }
    if (path === "/api/workspace/brand/" && method === "PATCH") {
      need("admin");
      const input = cleanBrandInput(await body());
      if (input.whiteLabel && !view.whiteLabelAvailable) throw new TeamError(402, "plan_required", "Hiding Olmene's name on client pages comes with the Team plan.");
      if (input.name !== undefined) view.brand.name = input.name;
      if (input.color !== undefined) view.brand.color = input.color;
      if (input.url !== undefined) view.brand.url = input.url;
      if (input.whiteLabel !== undefined) view.brand.whiteLabel = input.whiteLabel && canWhiteLabel("team");
      view.kind = "agency";
      return json({ view: snapshot() });
    }
    if (path === "/api/workspace/brand/logo/") {
      need("admin");
      if (method === "DELETE") {
        view.brand.logoUrl = null;
        return json({ view: snapshot() });
      }
      const blob = init?.body instanceof Blob ? init.body : null;
      const bytes = new Uint8Array(blob ? await blob.arrayBuffer() : new ArrayBuffer(0));
      if (bytes.byteLength > LOGO_MAX_BYTES) throw new TeamError(413, "too_large", "Logos can be up to 512 KB. Export a smaller PNG or WebP.");
      const type = sniffImage(bytes);
      if (!type) throw new TeamError(415, "bad_image", "Use a PNG, JPEG or WebP logo.");
      view.brand.logoUrl = URL.createObjectURL(new Blob([bytes], { type }));
      return json({ view: snapshot() });
    }
    if (path === "/api/workspace/" && method === "PATCH") {
      need("admin");
      const { kind } = (await body()) as { kind?: "company" | "agency" };
      if (kind) view.kind = kind;
      return json({ workspace: { kind: view.kind } });
    }
    return null;
  }

  const original = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
      await new Promise((r) => setTimeout(r, 250)); // feel the busy states
      try {
        const res = await handle((init?.method ?? "GET").toUpperCase(), url.pathname, init);
        if (res) return res;
      } catch (e) {
        if (e instanceof TeamError) return refuse(e.status, e.code, e.message);
        throw e;
      }
    }
    return original(input, init);
  };
  return () => {
    window.fetch = original;
  };
}
