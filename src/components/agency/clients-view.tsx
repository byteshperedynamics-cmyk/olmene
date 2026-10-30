"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Check, Copy, ExternalLink, Globe, Link2, Mail, Palette, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { inputClass, selectClass } from "@/components/workspace/field-styles";
import { cn } from "@/lib/utils";
import { atLeast } from "@/lib/workspace/roles";
import { TeamApiError, updateWorkspace } from "@/lib/workspace/client";
import { addClient, clientPageUrl, editClient, moveSite, removeClient, turnOffClientPage, turnOnClientPage, type ClientFields } from "@/lib/agency/client";
import type { Client, ClientSite, ClientsView } from "@/lib/agency/types";
import { BrandSettings } from "./brand-settings";
import { ClientReports } from "./client-reports";

const message = (e: unknown, fallback: string) => (e instanceof TeamApiError || e instanceof Error ? e.message : fallback);

/** Client pages show this many sites at most (loadPortal). */
const PAGE_SITE_LIMIT = 12;

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Small pieces ───────────────────────────────────────────────────────────

function Score({ score }: { score: number | null }) {
  const tone = score == null ? "" : score >= 75 ? "bg-tel-emerald" : score >= 50 ? "bg-tel-amber" : "bg-tel-rose";
  return (
    <span className="flex w-20 shrink-0 items-center gap-2 sm:w-28">
      <span className="o-readout-strong w-7 text-end text-[15px] leading-none" aria-hidden>
        {score ?? "–"}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        {score != null && <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(2, score)}%` }} />}
      </span>
      <span className="sr-only">{score == null ? "Not scored yet" : `Readiness ${score} of 100`}</span>
    </span>
  );
}

const NO_CLIENT = "none";

/**
 * Give a site to a client, or move it: a select that reads "Move…" in a
 * client's card (other clients, or no client) and "Give to a client…" for
 * sites without one. Nothing for viewers.
 */
function ClientPicker({ site, current, clients, canEdit, onView }: { site: ClientSite; current: Client | null; clients: Client[]; canEdit: boolean; onView: (v: ClientsView) => void }) {
  const [busy, setBusy] = useState(false);
  const others = clients.filter((c) => c.id !== current?.id);
  if (!canEdit || (!others.length && !current)) return null;
  async function move(choice: string) {
    if (!choice) return;
    const to = choice === NO_CLIENT ? null : choice;
    setBusy(true);
    try {
      onView(await moveSite(site.id, to));
      const name = clients.find((c) => c.id === to)?.name;
      toast.success(name ? `${site.host} now belongs to ${name}` : `${site.host} no longer belongs to ${current?.name ?? "a client"}`);
    } catch (e) {
      toast.error(message(e, "Couldn't move the site."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <select
      className={cn(selectClass, "max-w-[12rem]")}
      value=""
      disabled={busy}
      aria-label={current ? `Move ${site.host} to another client` : `Give ${site.host} to a client`}
      onChange={(e) => void move(e.target.value)}
    >
      <option value="">{busy ? "Moving…" : current ? "Move…" : "Give to a client…"}</option>
      {others.map((c) => (
        <option key={c.id} value={c.id}>
          {current ? `To ${c.name}` : c.name}
        </option>
      ))}
      {current && <option value={NO_CLIENT}>No client</option>}
    </select>
  );
}

function SiteLine({ site, client, clients, canEdit, onView }: { site: ClientSite; client: Client; clients: Client[]; canEdit: boolean; onView: (v: ClientsView) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <a
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-[9rem] flex-1 truncate text-[14px] font-medium underline-offset-4 hover:underline"
        dir="ltr"
      >
        {site.host}
      </a>
      <Score score={site.lastScore} />
      <ClientPicker site={site} current={client} clients={clients} canEdit={canEdit} onView={onView} />
    </li>
  );
}

// ── Adding and editing a client ────────────────────────────────────────────

function ClientForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  initial: ClientFields;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (f: ClientFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: keyof ClientFields | null; text: string } | null>(null);
  const set = (k: keyof ClientFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError(null);
  };
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: f.name.trim(), website: f.website.trim(), contactEmail: f.contactEmail.trim() });
    } catch (e) {
      const code = e instanceof TeamApiError ? e.code : "";
      setError({
        field: code === "bad_name" ? "name" : code === "bad_website" ? "website" : code === "bad_email" ? "contactEmail" : null,
        text: message(e, "Couldn't save the client."),
      });
      setBusy(false);
    }
  }
  const invalid = (k: keyof ClientFields) => (error?.field === k ? true : undefined);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-[13px]">
          <span className="text-muted-foreground">Client name</span>
          <input className={inputClass} value={f.name} onChange={set("name")} maxLength={80} required autoComplete="organization" aria-invalid={invalid("name")} />
        </label>
        <label className="grid gap-1.5 text-[13px]">
          <span className="text-muted-foreground">Website (optional)</span>
          <input className={inputClass} value={f.website} onChange={set("website")} placeholder="client.com" inputMode="url" autoComplete="url" dir="ltr" aria-invalid={invalid("website")} />
        </label>
        <label className="grid gap-1.5 text-[13px]">
          <span className="text-muted-foreground">Contact email (optional)</span>
          <input
            className={inputClass}
            type="email"
            value={f.contactEmail}
            onChange={set("contactEmail")}
            placeholder="name@client.com"
            inputMode="email"
            autoComplete="off"
            dir="ltr"
            aria-invalid={invalid("contactEmail")}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-tel-rose">
          {error.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="sheen" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── A client's page link ───────────────────────────────────────────────────

function ClientPageLink({ client, canEdit, onView }: { client: Client; canEdit: boolean; onView: (v: ClientsView) => void }) {
  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  const [askOff, setAskOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = client.portal ? clientPageUrl(client.portal.slug) : null;

  async function turnOn() {
    setBusy("on");
    try {
      onView(await turnOnClientPage(client.id));
      toast.success(`${client.name}'s page is ready. Copy the link and send it to them.`);
    } catch (e) {
      toast.error(message(e, "Couldn't create the page."));
    } finally {
      setBusy(null);
    }
  }
  async function turnOff() {
    setBusy("off");
    try {
      onView(await turnOffClientPage(client.id));
      setAskOff(false);
      toast(`${client.name}'s page is off. The link no longer opens.`);
    } catch (e) {
      toast.error(message(e, "Couldn't turn the page off."));
    } finally {
      setBusy(null);
    }
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-edge bg-chip/40 p-4" aria-label={`${client.name}'s client page`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-[14px] font-medium">
          <Link2 className="size-4" aria-hidden /> Client page
        </h3>
        <span className="text-[12.5px] text-muted-foreground">
          {client.portal ? (client.portal.views === 0 ? "On · not opened yet" : `On · opened ${client.portal.views} ${client.portal.views === 1 ? "time" : "times"}`) : "Off"}
        </span>
      </div>
      {client.portal && url ? (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              aria-label={`Link to ${client.name}'s page`}
              onFocus={(e) => e.currentTarget.select()}
              dir="ltr"
              className={cn(inputClass, "h-10 min-w-0 flex-1 font-mono text-[12.5px]")}
            />
            <Button variant="hairline" className="h-10 shrink-0" onClick={() => void copy()} aria-live="polite">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="hairline" size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => setAskOff(true)} disabled={busy !== null}>
                Turn off
              </Button>
            )}
            {client.sites.length > PAGE_SITE_LIMIT && (
              <span className="text-[12.5px] text-muted-foreground">The page shows the first {PAGE_SITE_LIMIT} sites.</span>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-[13px] text-muted-foreground">
            One page with each site&apos;s score and progress, under your name. Only people with the link can open it, and it updates every week.
          </p>
          {canEdit && (
            <Button variant="hairline" size="sm" onClick={() => void turnOn()} disabled={busy !== null}>
              {busy === "on" ? "Creating…" : "Create link"}
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={askOff} onOpenChange={(o) => !busy && setAskOff(o)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-[28rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off {client.name}&apos;s page?</AlertDialogTitle>
            <AlertDialogDescription>
              The link stops working straight away. If you create one again later, it will have a new address you&apos;ll need to send them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={(e) => {
                e.preventDefault();
                void turnOff();
              }}
              className="bg-tel-rose text-white hover:bg-tel-rose/90"
            >
              {busy === "off" ? "Turning off…" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ── One client ─────────────────────────────────────────────────────────────

function ClientCard({
  client,
  view,
  onView,
  onAskRemove,
}: {
  client: Client;
  view: ClientsView;
  onView: (v: ClientsView) => void;
  onAskRemove: (c: Client) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const canEdit = atLeast(view.role, "member");
  const admin = atLeast(view.role, "admin");
  const site = hostOf(client.website);

  async function addSite(siteId: string) {
    if (!siteId) return;
    setAdding(true);
    try {
      onView(await moveSite(siteId, client.id));
      const host = view.unassigned.find((s) => s.id === siteId)?.host ?? "The site";
      toast.success(`${host} now belongs to ${client.name}`);
    } catch (e) {
      toast.error(message(e, "Couldn't add the site."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="grid gap-5 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby={`client-${client.id}`}>
      {editing ? (
        <div className="grid gap-4">
          <h2 id={`client-${client.id}`} className="text-[15px] font-medium">
            Edit {client.name}
          </h2>
          <ClientForm
            initial={{ name: client.name, website: client.website ?? "", contactEmail: client.contactEmail ?? "" }}
            submitLabel="Save"
            busyLabel="Saving…"
            onCancel={() => setEditing(false)}
            onSubmit={async (f) => {
              onView(await editClient(client.id, f));
              setEditing(false);
              toast.success("Client saved");
            }}
          />
        </div>
      ) : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h2 id={`client-${client.id}`} className="truncate text-[18px] font-medium">
              {client.name}
            </h2>
            {(site || client.contactEmail) && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                {site && client.website && (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground" dir="ltr">
                    <Globe className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{site}</span>
                  </a>
                )}
                {client.contactEmail && (
                  <span className="inline-flex min-w-0 items-center gap-1.5" dir="ltr">
                    <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{client.contactEmail}</span>
                  </span>
                )}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" aria-label={`Edit ${client.name}`} onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden /> Edit
              </Button>
              {admin && (
                <Button variant="ghost" size="sm" aria-label={`Remove ${client.name}`} onClick={() => onAskRemove(client)}>
                  <Trash2 className="size-4 text-muted-foreground" aria-hidden />
                </Button>
              )}
            </div>
          )}
        </header>
      )}

      <div className="grid gap-2">
        <h3 className="text-[12.5px] text-muted-foreground">
          {client.sites.length === 0 ? "No sites yet" : `${client.sites.length} ${client.sites.length === 1 ? "site" : "sites"}`}
        </h3>
        {client.sites.length > 0 && (
          <ul className="divide-y divide-[var(--edge)] rounded-xl border border-edge">
            {client.sites.map((s) => (
              <SiteLine key={s.id} site={s} client={client} clients={view.clients} canEdit={canEdit} onView={onView} />
            ))}
          </ul>
        )}
        {canEdit && view.unassigned.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Plus className="size-3.5" aria-hidden />
            <span className="sr-only">Add a site to {client.name}</span>
            <select className={cn(selectClass, "max-w-full")} value="" disabled={adding} onChange={(e) => void addSite(e.target.value)}>
              <option value="">{adding ? "Adding…" : "Add a site…"}</option>
              {view.unassigned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.host}
                </option>
              ))}
            </select>
          </label>
        )}
        {client.sites.length === 0 && !view.unassigned.length && (
          <p className="text-[13px] text-muted-foreground">
            {canEdit ? "Run an analysis of their site; when the report is ready, the site appears here to add." : "Their sites show here once they're added."}
          </p>
        )}
      </div>

      <ClientPageLink client={client} canEdit={canEdit} onView={onView} />
      <ClientReports client={client} canEdit={canEdit} onView={onView} />
    </article>
  );
}

// ── Sites not given to anyone ──────────────────────────────────────────────

function UnassignedSites({ view, onView }: { view: ClientsView; onView: (v: ClientsView) => void }) {
  const canEdit = atLeast(view.role, "member");
  const none = view.unassigned.length === 0;
  const anySites = !none || view.clients.some((c) => c.sites.length > 0);
  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="unassigned">
      <h2 id="unassigned" className="border-b px-5 py-3.5 text-[14px] font-medium">
        Sites without a client
      </h2>
      {none ? (
        <p className="px-5 py-4 text-[13.5px] text-muted-foreground">
          {anySites ? "Every site belongs to a client." : "Sites appear here when their first report is ready."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--edge)]">
          {view.unassigned.map((s) => (
            <li key={s.id} className="grid gap-2 px-5 py-3">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-[13.5px] font-medium" dir="ltr">
                  {s.host}
                </span>
                <Score score={s.lastScore} />
              </span>
              <ClientPicker site={s} current={null} clients={view.clients} canEdit={canEdit} onView={onView} />
            </li>
          ))}
        </ul>
      )}
      {!none && canEdit && view.clients.length === 0 && <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">Add a client first, then give them their sites.</p>}
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-5" aria-labelledby="how-pages">
      <h2 id="how-pages" className="text-[14px] font-medium">
        How it works for your clients
      </h2>
      <ol className="grid gap-2.5 text-[13px] text-muted-foreground">
        <li className="flex gap-2.5">
          <span className="o-readout-strong w-4 shrink-0 text-[12px]">1</span> Give each site to a client.
        </li>
        <li className="flex gap-2.5">
          <span className="o-readout-strong w-4 shrink-0 text-[12px]">2</span> Create the client&apos;s page link and send it to them.
        </li>
        <li className="flex gap-2.5">
          <span className="o-readout-strong w-4 shrink-0 text-[12px]">3</span> They see each site&apos;s score and progress, updated every week, under your name. Reports, findings and fixes stay private.
        </li>
        <li className="flex gap-2.5">
          <span className="o-readout-strong w-4 shrink-0 text-[12px]">4</span> Turn on an email report, and the people you add get the same numbers every Monday or on the 1st.
        </li>
      </ol>
    </section>
  );
}

// ── Not an agency yet ──────────────────────────────────────────────────────

function AgencyIntro({ view, onOn }: { view: ClientsView; onOn: () => void }) {
  const [busy, setBusy] = useState(false);
  const admin = atLeast(view.role, "admin");
  async function turnOn() {
    setBusy(true);
    try {
      await updateWorkspace({ kind: "agency" });
      toast.success("Agency features are on");
      onOn();
    } catch (e) {
      toast.error(message(e, "Couldn't turn on agency features."));
      setBusy(false);
    }
  }
  return (
    <section className="o-well grid justify-items-start gap-4 rounded-2xl p-6 sm:p-8" aria-labelledby="agency-intro">
      <span className="grid size-12 place-items-center rounded-2xl border border-rim bg-chip">
        <Building2 className="size-5" aria-hidden />
      </span>
      <h2 id="agency-intro" className="o-display text-[26px] leading-tight">
        Looking after websites for clients?
      </h2>
      <ul className="grid max-w-xl gap-2 text-[15px] text-muted-foreground">
        {[
          "Group sites by client.",
          "Give each client a page with their sites' scores and progress, updated every week.",
          "Email each client a short report every week or month, under your name.",
          "Put your agency's name, logo and colour on everything clients see.",
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <Check className="mt-1 size-4 shrink-0 text-tel-emerald" aria-hidden /> {line}
          </li>
        ))}
      </ul>
      {admin ? (
        <Button variant="sheen" size="xl" onClick={() => void turnOn()} disabled={busy}>
          {busy ? "Turning on…" : "Turn on agency features"}
        </Button>
      ) : (
        <p className="text-[14px]">Ask an admin of this workspace to turn on agency features on the Team page.</p>
      )}
      <p className="text-[12.5px] text-muted-foreground">You can switch back on the Team page. Nothing is deleted either way.</p>
    </section>
  );
}

// ── The page body ──────────────────────────────────────────────────────────

/**
 * /app/clients/: an agency's clients, each with their sites and page link,
 * sites not given to anyone, and the agency's branding. Viewers look;
 * members manage clients, sites and links; admins also branding and removing
 * clients (the Worker checks each of these too).
 */
export function ClientsScreen({ view, onView, onKindChanged }: { view: ClientsView; onView: (v: ClientsView) => void; onKindChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Phones show the list or one client, never both.
  const [openOnPhone, setOpenOnPhone] = useState(false);
  // #branding opens the branding area (old links and the setup banner use it).
  const [section, setSection] = useState<"clients" | "branding">("clients");
  useEffect(() => {
    const read = () => setSection(window.location.hash === "#branding" ? "branding" : "clients");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const canEdit = atLeast(view.role, "member");
  const admin = atLeast(view.role, "admin");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return view.clients;
    return view.clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.website ?? "").toLowerCase().includes(q) ||
        (c.contactEmail ?? "").toLowerCase().includes(q) ||
        c.sites.some((s) => s.host.toLowerCase().includes(q)),
    );
  }, [query, view.clients]);
  const selected = view.clients.find((c) => c.id === selectedId) ?? view.clients[0] ?? null;

  const go = (tab: "clients" | "branding") => {
    setSection(tab);
    history.replaceState(null, "", tab === "branding" ? "#branding" : window.location.pathname + window.location.search);
  };
  const pick = (id: string) => {
    setSelectedId(id);
    setAdding(false);
    setOpenOnPhone(true);
  };
  const startAdding = () => {
    setAdding(true);
    setOpenOnPhone(true);
  };

  if (view.kind !== "agency") return <AgencyIntro view={view} onOn={onKindChanged} />;

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      onView(await removeClient(removing.id));
      toast(`${removing.name} removed. Their sites are still here, without a client.`);
      setRemoving(null);
    } catch (e) {
      toast.error(message(e, "Couldn't remove the client."));
    } finally {
      setBusy(false);
    }
  }

  const brandMissing = !view.brand.name && !view.brand.logoUrl;

  return (
    <div className="grid gap-6">
      {/* Daily client work and the agency's branding are separate areas (refinement 2026-10-30). */}
      <div role="tablist" aria-label="Clients sections" className="flex w-fit gap-1 rounded-lg border bg-card p-1">
        {(["clients", "branding"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={section === tab}
            aria-controls={`clients-panel-${tab}`}
            onClick={() => go(tab)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13.5px] transition-colors duration-[var(--dur-hover)] pointer-coarse:h-11",
              section === tab ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "clients" ? "Clients" : "Branding"}
            {tab === "branding" && brandMissing && <span className="size-1.5 rounded-full bg-tel-amber" aria-label="not set up" />}
          </button>
        ))}
      </div>

      {section === "branding" ? (
        <div id="clients-panel-branding" role="tabpanel" className="grid gap-4">
          <BrandSettings view={view} onView={onView} />
        </div>
      ) : (
        <div id="clients-panel-clients" role="tabpanel" className="grid gap-6">
          {brandMissing && admin && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rim bg-chip/50 px-4 py-3">
              <p className="flex items-center gap-3 text-[14px]">
                <Palette className="size-4 shrink-0" aria-hidden /> Put your agency&apos;s name and logo on the pages clients see.
              </p>
              <Button variant="hairline" size="sm" onClick={() => go("branding")}>
                Set up branding <ArrowRight className="size-3.5 rtl-flip" aria-hidden />
              </Button>
            </div>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* The list: compact and searchable. On phones it hides while a client is open. */}
            <section className={cn("grid gap-3", openOnPhone && "hidden lg:grid")} aria-labelledby="clients-list">
              <div className="flex items-center justify-between gap-3">
                <h2 id="clients-list" className="text-[15px] font-medium">
                  {view.clients.length === 0 ? "No clients yet" : `${view.clients.length} ${view.clients.length === 1 ? "client" : "clients"}`}
                </h2>
                {canEdit && (
                  <Button size="sm" onClick={() => startAdding()}>
                    <Plus className="size-4" aria-hidden /> Add client
                  </Button>
                )}
              </div>
              {view.clients.length > 3 && (
                <label className="relative block">
                  <span className="sr-only">Search clients</span>
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by client, site or email"
                    className={cn(inputClass, "w-full ps-9")}
                  />
                </label>
              )}
              {view.clients.length > 0 && (
                <ul className="grid overflow-hidden rounded-xl border bg-card" aria-label="Clients">
                  {shown.map((c) => (
                    <li key={c.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => pick(c.id)}
                        aria-current={selected?.id === c.id && !adding ? "true" : undefined}
                        className={cn(
                          "grid w-full gap-0.5 px-4 py-3 text-start transition-colors duration-[var(--dur-hover)] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          selected?.id === c.id && !adding && "bg-secondary",
                        )}
                      >
                        <span className="truncate text-[14px] font-medium">{c.name}</span>
                        <span className="flex flex-wrap gap-x-2.5 text-[12.5px] text-muted-foreground">
                          <span>
                            {c.sites.length} {c.sites.length === 1 ? "site" : "sites"}
                          </span>
                          <span>{c.portal ? "page on" : "page off"}</span>
                          <span>{c.report.cadence === "off" ? "no emailed report" : `${c.report.cadence} report`}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-4 py-4 text-[13.5px] text-muted-foreground">No client matches &ldquo;{query}&rdquo;.</li>}
                </ul>
              )}
              <UnassignedSites view={view} onView={onView} />
              <HowItWorks />
            </section>

            {/* The open client: sites, page sharing, emailed reports */}
            <section className={cn("grid min-w-0 gap-4", !openOnPhone && "hidden lg:grid")} aria-label="Selected client">
              {(openOnPhone || adding) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenOnPhone(false);
                    setAdding(false);
                  }}
                  className="o-hit relative inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-3.5 rtl-flip" aria-hidden /> All clients
                </button>
              )}
              {adding ? (
                <div className="rounded-xl border border-rim bg-card p-5 sm:p-6">
                  <h3 className="mb-4 text-[15px] font-medium">New client</h3>
                  <ClientForm
                    initial={{ name: "", website: "", contactEmail: "" }}
                    submitLabel="Add client"
                    busyLabel="Adding…"
                    onCancel={() => {
                      setAdding(false);
                      setOpenOnPhone(false);
                    }}
                    onSubmit={async (f) => {
                      const r = await addClient(f);
                      onView(r.view);
                      setAdding(false);
                      setSelectedId(r.id);
                      toast.success(`${f.name} added`);
                    }}
                  />
                </div>
              ) : selected ? (
                <ClientCard key={selected.id} client={selected} view={view} onView={onView} onAskRemove={setRemoving} />
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="font-medium">Add your first client</p>
                  <p className="mx-auto mt-1 max-w-md text-[14px] text-muted-foreground">
                    {view.unassigned.length
                      ? "Then give them their sites, and create a page link to send them."
                      : "Sites appear here when their first full analysis is ready; then you can give each one to a client."}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => !busy && !o && setRemoving(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-[28rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.sites.length
                ? `Their ${removing.sites.length === 1 ? "site stays" : `${removing.sites.length} sites stay`} in this workspace without a client, with every report and fix.`
                : "Nothing else changes."}
              {removing?.portal ? " Their client page stops working straight away." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
              className="bg-tel-rose text-white hover:bg-tel-rose/90"
            >
              {busy ? "Removing…" : "Remove client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
