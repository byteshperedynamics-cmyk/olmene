"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BellRing, Download, KeyRound, LogOut, Mail, MonitorSmartphone, Share2, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogoLoader } from "@/components/logo-loader";
import { createPortalSession } from "@/lib/api";
import {
  AccountError,
  deleteMyAccount,
  deleteMyData,
  downloadMyData,
  updateProfile,
  type AccountOverview,
  type Identity,
  type ProfileRow,
  type ShareLink,
} from "@/lib/account-client";
import { accountMilestones, cleanDisplayName, nextMilestone, scoreDelta, type SiteProgress } from "@/lib/account/progress";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AvatarEditor } from "./avatar-editor";
import { MilestoneGrid, MilestoneRing } from "./milestones";
import { ScoreTrend } from "./score-trend";
import { ShareDialog } from "./share-dialog";
import { UserAvatar } from "./user-avatar";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "progress", label: "Progress" },
  { id: "email", label: "Email" },
  { id: "security", label: "Sign-in" },
  { id: "data", label: "Your data" },
];

const field =
  "h-11 w-full rounded-[10px] border border-rim bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-tel-rose";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-28 gap-5">
      <header className="grid gap-1">
        <h2 id={`${id}-title`} className="text-[20px] font-medium tracking-tight">
          {title}
        </h2>
        {description && <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("o-artifact rounded-2xl p-5 sm:p-6", className)}>{children}</div>;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const PROVIDER_LABEL: Record<string, string> = { google: "Google", email: "Email link" };

// ── Profile ────────────────────────────────────────────────────────────────

function NameField({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(current ?? ""), [current]);
  const dirty = (cleanDisplayName(value) ?? "") !== (current ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanDisplayName(value);
    if (value.trim() && !clean) return setError("Use up to 60 letters, numbers or spaces.");
    setSaving(true);
    try {
      await updateProfile({ displayName: clean });
      toast.success(clean ? "Name saved" : "Name removed");
      onSaved();
    } catch (err) {
      setError(err instanceof AccountError ? err.message : "Couldn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-2">
      <label htmlFor="account-name" className="text-[14px] font-medium">
        Name
      </label>
      <div className="flex gap-2">
        <input
          id="account-name"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          maxLength={80}
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={error ? true : undefined}
          aria-describedby="account-name-help"
          className={field}
        />
        <Button type="submit" size="xl" disabled={!dirty || saving} className="shrink-0">
          {saving ? <LogoLoader size={14} /> : null} Save
        </Button>
      </div>
      <p id="account-name-help" className={cn("text-[13px]", error ? "text-tel-rose" : "text-muted-foreground")}>
        {error ?? "Shown in Olmene, and on progress links you share if you choose."}
      </p>
    </form>
  );
}

// ── Progress ───────────────────────────────────────────────────────────────

function SiteRow({ site, share, onShare }: { site: SiteProgress; share: ShareLink | undefined; onShare: () => void }) {
  const d = scoreDelta(site);
  const tone = site.scoreNow == null ? "" : site.scoreNow >= 75 ? "text-tel-emerald" : site.scoreNow >= 50 ? "text-tel-amber" : "text-tel-rose";
  return (
    <li className="grid gap-4 rounded-2xl border border-edge p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium">{site.host}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground">
          <span className={cn("o-readout-strong text-[20px] tabular-nums", tone)}>{site.scoreNow ?? "–"}</span>
          {d != null && site.history.length > 1 && (
            <span className={d > 0 ? "text-tel-emerald" : d < 0 ? "text-tel-rose" : undefined}>
              {d > 0 ? `+${d}` : d} since {fmtDate(site.history[0].at)}
            </span>
          )}
          {site.history.length < 2 && <span>first check {fmtDate(site.since)}</span>}
        </p>
      </div>
      <ScoreTrend history={site.history} height={44} fit label={`${site.host} readiness score over time`} />
      <div className="flex items-center gap-2 sm:justify-end">
        {share ? (
          <Button variant="hairline" size="sm" onClick={onShare}>
            <Share2 className="size-3.5" aria-hidden /> Shared
            <span className="text-muted-foreground">{share.views ? `${share.views} ${share.views === 1 ? "view" : "views"}` : "new"}</span>
          </Button>
        ) : (
          <Button size="sm" onClick={onShare}>
            <Share2 className="size-3.5" aria-hidden /> Share progress
          </Button>
        )}
      </div>
    </li>
  );
}

// ── Delete dialogs ─────────────────────────────────────────────────────────

// Queries the account screen itself needs after "delete my data"; every other
// cached list (analyses, sites, reports) still holds the deleted rows.
const KEEP_AFTER_DATA_DELETE = new Set(["profile", "account-overview"]);

function DeleteDataDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setTyped("");
      setError(null);
    }
  }, [open]);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyData();
      // Drop them so the dashboard doesn't flash deleted reports before it refetches.
      qc.removeQueries({ predicate: (q) => !KEEP_AFTER_DATA_DELETE.has(String(q.queryKey[0])) });
      toast.success("Your data is deleted. Your account is ready for a fresh start.");
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(e instanceof AccountError ? e.message : "Couldn't delete your data. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[32rem] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your data?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-4 text-[14px] leading-relaxed">
              <div className="grid gap-1.5">
                <p className="font-medium text-foreground">Deleted for good</p>
                <p>Reports and analyses, watched sites and their weekly history, scans and screenshots, your activity feed, guided fixes, pull-request checks and progress links.</p>
              </div>
              <div className="grid gap-1.5">
                <p className="font-medium text-foreground">Kept</p>
                <p>
                  Your account, plan and receipts, connected accounts, alert channels, and the record of changes Olmene made to your code. Reports you used this
                  month still count toward your plan.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <label htmlFor="confirm-delete-data" className="text-[14px]">
            Type <span className="font-mono font-medium">delete</span> to confirm
          </label>
          <input id="confirm-delete-data" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className={field} />
          {error && (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-tel-rose">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={go} disabled={busy || typed.trim().toLowerCase() !== "delete"}>
            {busy ? <LogoLoader size={14} /> : <Trash2 className="size-4" aria-hidden />} Delete my data
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  plan,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string;
  plan: AccountOverview["plan"] | undefined;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"delete" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!open) {
      setTyped("");
      setError(null);
    }
    setBlocked(!!plan?.renews);
  }, [open, plan?.renews]);

  async function go() {
    setBusy("delete");
    setError(null);
    try {
      await deleteMyAccount(typed);
      onDeleted();
    } catch (e) {
      if (e instanceof AccountError && e.code === "plan_active") setBlocked(true);
      setError(e instanceof AccountError ? e.message : "Couldn't delete your account. Try again in a moment.");
      setBusy(null);
    }
  }

  async function portal() {
    setBusy("portal");
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      toast.error("Couldn't open the billing portal. Try again in a moment.");
      setBusy(null);
    }
  }

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[32rem] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? "Cancel your plan first" : "Delete your account?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {blocked ? (
              <div className="grid gap-3 text-[14px] leading-relaxed">
                <p>
                  Your plan renews{plan?.renewsAt ? ` on ${fmtDate(plan.renewsAt)}` : ""}. Cancel it in the billing portal so you aren&apos;t charged again, then come
                  back here. You keep access until the end of the period you&apos;ve paid for.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 text-[14px] leading-relaxed">
                <p>
                  This deletes your account and everything in it: reports, sites, history, connections, alert channels and progress links. You&apos;ll be signed out, and
                  it can&apos;t be undone.
                </p>
                <p>Payment receipts stay with our payment provider, Polar, as the law requires. If you installed the Olmene GitHub App, remove it from your GitHub settings too.</p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!blocked && (
          <div className="grid gap-2">
            <label htmlFor="confirm-delete-account" className="text-[14px]">
              Type your email, <span className="font-medium" dir="ltr">{email}</span>, to confirm
            </label>
            <input
              id="confirm-delete-account"
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              className={field}
            />
          </div>
        )}
        {error && !blocked && (
          <p role="alert" className="flex items-start gap-2 text-[13px] text-tel-rose">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!busy}>{blocked ? "Not now" : "Keep my account"}</AlertDialogCancel>
          {blocked ? (
            <Button onClick={portal} disabled={!!busy}>
              {busy === "portal" ? <LogoLoader size={14} /> : null} Open billing portal
            </Button>
          ) : (
            <Button variant="destructive" onClick={go} disabled={!!busy || !matches}>
              {busy === "delete" ? <LogoLoader size={14} /> : <Trash2 className="size-4" aria-hidden />} Delete account
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── The page ───────────────────────────────────────────────────────────────

/**
 * /app/account/: who you are, how far you've come, who can see it, what we
 * email you, how you sign in, and your data. Everything is on one scrolling
 * page with a section index, so nothing hides behind tabs.
 */
export function AccountView({
  identity,
  profile,
  overview,
  overviewError,
  onProfileChanged,
  onOverviewChanged,
  signOut,
}: {
  identity: Identity;
  profile: ProfileRow | null | undefined;
  overview: AccountOverview | undefined;
  overviewError?: boolean;
  onProfileChanged: () => void;
  onOverviewChanged: (next?: AccountOverview) => void;
  signOut: (opts?: { to?: string; everywhere?: boolean }) => void;
}) {
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [dlg, setDlg] = useState<"data" | "account" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [emailBusy, setEmailBusy] = useState<"notify" | "digest" | null>(null);

  const sites = overview?.sites ?? [];
  const shares = overview?.shares ?? [];
  const milestones = useMemo(
    () =>
      accountMilestones({
        createdAt: identity.createdAt,
        hasName: !!profile?.display_name,
        hasPhoto: !!profile?.avatar_path,
        reports: overview?.totals.reports ?? 0,
        sites,
        fixesShipped: overview?.totals.fixesShipped ?? 0,
        shares: shares.length,
      }),
    [identity.createdAt, profile?.display_name, profile?.avatar_path, overview, sites, shares.length],
  );
  const next = overview ? nextMilestone(milestones) : null;
  const earned = milestones.filter((m) => m.earned).length;
  const shareSite = sites.find((s) => s.siteId === shareFor) ?? null;

  function openFirstShare() {
    const target = sites.find((s) => !shares.some((x) => x.siteId === s.siteId)) ?? sites[0];
    if (target) setShareFor(target.siteId);
    else document.getElementById("progress")?.scrollIntoView({ behavior: "smooth" });
  }

  function onShareChanged(siteId: string, link: ShareLink | null) {
    if (!overview) return;
    const rest = overview.shares.filter((s) => s.siteId !== siteId);
    onOverviewChanged({ ...overview, shares: link ? [...rest, link] : rest });
  }

  async function setEmail(kind: "notify" | "digest", value: boolean) {
    setEmailBusy(kind);
    try {
      await updateProfile(kind === "notify" ? { notifyEmail: value } : { digestEmail: value });
      onProfileChanged();
      toast.success(value ? "Email turned on" : "Email turned off");
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "Couldn't save. Try again in a moment.");
    } finally {
      setEmailBusy(null);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      await downloadMyData();
      toast.success("Download started");
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "Couldn't prepare your download.");
    } finally {
      setExporting(false);
    }
  }

  const providers = identity.providers.length ? identity.providers : ["email"];

  return (
    <div className="mx-auto grid max-w-5xl gap-10">
      {/* Who you are, at a glance */}
      <header className="o-artifact grid gap-6 rounded-[22px] p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <UserAvatar src={identity.avatarUrl} initials={identity.initials} size={72} className="ring-2" />
          <div className="min-w-0">
            <p className="text-[14px] text-muted-foreground">{identity.firstName ? `${greeting()}, ${identity.firstName}` : greeting()}</p>
            <h1 className="o-display truncate text-[28px] leading-tight sm:text-[32px]">{identity.name ?? "Your account"}</h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-muted-foreground">
              <span className="truncate" dir="ltr">
                {identity.email}
              </span>
              {identity.createdAt && <span>Member since {new Date(identity.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-4 gap-4 border-t border-edge pt-5 md:flex md:items-center md:gap-7 md:border-0 md:pt-0">
          <div className="col-span-1 grid place-items-start md:place-items-center">
            <dt className="sr-only">Milestones</dt>
            <dd>
              <MilestoneRing earned={earned} total={milestones.length} size={56} />
            </dd>
          </div>
          {[
            { k: "Reports", v: overview?.totals.reports },
            { k: "Fixes shipped", v: overview?.totals.fixesShipped },
            { k: "Sites watched", v: overview?.totals.sites },
          ].map((s) => (
            <div key={s.k} className="grid gap-1">
              <dt className="order-2 text-[12.5px] text-muted-foreground">{s.k}</dt>
              <dd className="o-readout-strong text-[24px] leading-none tabular-nums">{s.v ?? <Skeleton className="h-6 w-8" />}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Account sections" className="hidden lg:block">
          <ul className="sticky top-24 grid gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-[14px] text-muted-foreground transition-colors hover:bg-chip hover:text-foreground">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-14">
          <Section id="profile" title="Profile" description="How you appear in Olmene and on anything you share.">
            <Panel className="grid gap-7">
              <AvatarEditor identity={identity} hasOwnPhoto={!!profile?.avatar_path} onChanged={onProfileChanged} />
              <NameField current={profile?.display_name ?? null} onSaved={onProfileChanged} />
              <div className="grid gap-2">
                <p className="text-[14px] font-medium">Email</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px]" dir="ltr">
                    {identity.email}
                  </span>
                  {providers.map((p) => (
                    <span key={p} className="rounded-full border border-rim bg-chip px-2.5 py-0.5 text-[12px] text-muted-foreground">
                      {PROVIDER_LABEL[p] ?? p}
                    </span>
                  ))}
                </div>
                <p className="text-[13px] text-muted-foreground">Your email is how you sign in. To use a different one, contact support.</p>
              </div>
            </Panel>
          </Section>

          <Section
            id="progress"
            title="Your progress"
            description="Milestones you've reached and how each site is doing. Share a site's progress with a link; friends see its score history, nothing else."
          >
            <Panel className="grid gap-6">
              {overview ? (
                <MilestoneGrid
                  list={milestones}
                  next={next}
                  onShare={openFirstShare}
                  todoOverride={profile?.display_name && !profile.avatar_path ? { profile: "Add a photo to finish your profile." } : undefined}
                />
              ) : overviewError ? (
                <p className="text-[14px] text-muted-foreground">Progress couldn&apos;t load right now. Refresh the page to try again.</p>
              ) : (
                <div className="grid gap-4">
                  <Skeleton className="h-[86px] rounded-2xl" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-[58px] rounded-xl" />
                    ))}
                  </div>
                </div>
              )}
            </Panel>
            {overview && (
              <Panel className="grid gap-4">
                <h3 className="text-[15px] font-medium">Sites</h3>
                {sites.length ? (
                  <ul className="grid gap-2.5">
                    {sites.map((s) => (
                      <SiteRow key={s.siteId} site={s} share={shares.find((x) => x.siteId === s.siteId)} onShare={() => setShareFor(s.siteId)} />
                    ))}
                  </ul>
                ) : (
                  <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-rim p-5">
                    <p className="text-[14px] text-muted-foreground">
                      A site appears here once its first full report is done. From then on Olmene re-checks it weekly and charts the score.
                    </p>
                    <Button asChild size="sm">
                      <Link href="/app/new/">
                        Start an analysis <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                )}
              </Panel>
            )}
          </Section>

          <Section id="email" title="Email" description={`What Olmene sends to ${identity.email ?? "you"}. Sign-in links and receipts always arrive.`}>
            <Panel className="grid gap-1 p-2 sm:p-2">
              {[
                {
                  k: "notify" as const,
                  title: "Updates on your work",
                  body: "A report is ready, a fix pull request opened, a fix went live, or a site got worse.",
                  on: profile?.notify_email ?? true,
                },
                { k: "digest" as const, title: "Weekly digest", body: "Monday's summary: each site's score, what changed and what's waiting for you.", on: profile?.digest_email ?? true },
              ].map((row) => (
                <label key={row.k} className="flex cursor-pointer items-start justify-between gap-6 rounded-xl px-4 py-4 hover:bg-chip/60">
                  <span className="grid gap-0.5">
                    <span className="text-[15px] font-medium">{row.title}</span>
                    <span className="text-[13.5px] leading-snug text-muted-foreground">{row.body}</span>
                  </span>
                  <Switch checked={row.on} disabled={emailBusy === row.k || !profile} onCheckedChange={(v) => setEmail(row.k, v)} aria-label={row.title} className="mt-0.5" />
                </label>
              ))}
              <Link
                href="/app/alerts/"
                className="flex items-center justify-between gap-4 rounded-xl px-4 py-4 text-[14px] text-muted-foreground transition-colors hover:bg-chip/60 hover:text-foreground"
              >
                <span className="flex items-center gap-2.5">
                  <BellRing className="size-4" aria-hidden /> Also send alerts to Slack, Discord or a webhook
                </span>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Panel>
          </Section>

          <Section id="security" title="Sign-in and security" description="Olmene never stores a password. You sign in with Google or a one-time email link.">
            <Panel className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="grid gap-0.5">
                    <p className="text-[14px] font-medium">Sign-in methods</p>
                    <p className="text-[13.5px] text-muted-foreground">{providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" and ")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="grid gap-0.5">
                    <p className="text-[14px] font-medium">Last sign-in</p>
                    <p className="text-[13.5px] text-muted-foreground">
                      {identity.lastSignInAt ? new Date(identity.lastSignInAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Just now"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-edge pt-5">
                <Button variant="hairline" onClick={() => signOut({ to: "/login/?signed_out=1" })}>
                  <LogOut className="size-4" aria-hidden /> Sign out
                </Button>
                <Button variant="ghost" onClick={() => signOut({ to: "/login/?signed_out=all", everywhere: true })}>
                  <ShieldCheck className="size-4" aria-hidden /> Sign out on every device
                </Button>
              </div>
            </Panel>
          </Section>

          <Section id="data" title="Your data" description="Take a copy of everything, clear it out and start fresh, or close your account.">
            <Panel className="grid divide-y divide-edge p-0 sm:p-0">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                <div className="grid max-w-md gap-0.5">
                  <p className="flex items-center gap-2 text-[15px] font-medium">
                    <Download className="size-4 text-muted-foreground" aria-hidden /> Download your data
                  </p>
                  <p className="text-[13.5px] text-muted-foreground">Reports, sites, scans, activity and settings in one JSON file.</p>
                </div>
                <Button variant="hairline" onClick={exportData} disabled={exporting}>
                  {exporting ? <LogoLoader size={14} /> : <Download className="size-4" aria-hidden />} Download
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                <div className="grid max-w-md gap-0.5">
                  <p className="flex items-center gap-2 text-[15px] font-medium">
                    <Trash2 className="size-4 text-muted-foreground" aria-hidden /> Delete your data
                  </p>
                  <p className="text-[13.5px] text-muted-foreground">Clear reports, sites and history. Your account and plan stay.</p>
                </div>
                <Button variant="hairline" onClick={() => setDlg("data")}>
                  Delete data
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                <div className="grid max-w-md gap-0.5">
                  <p className="flex items-center gap-2 text-[15px] font-medium text-tel-rose">
                    <TriangleAlert className="size-4" aria-hidden /> Delete your account
                  </p>
                  <p className="text-[13.5px] text-muted-foreground">Everything goes, for good. If you have a plan, cancel it first.</p>
                </div>
                <Button variant="hairline" onClick={() => setDlg("account")} className="border-tel-rose/40 text-tel-rose hover:bg-tel-rose/10">
                  Delete account
                </Button>
              </div>
            </Panel>
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              <span>
                Questions about your data? Read the{" "}
                <Link href="/legal/privacy/" className="text-foreground underline-offset-4 hover:underline">
                  privacy policy
                </Link>
                .
              </span>
            </p>
          </Section>
        </div>
      </div>

      {shareSite && (
        <ShareDialog
          site={shareSite}
          share={shares.find((s) => s.siteId === shareSite.siteId) ?? null}
          identity={identity}
          open={!!shareSite}
          onOpenChange={(o) => !o && setShareFor(null)}
          onChanged={(link) => onShareChanged(shareSite.siteId, link)}
        />
      )}
      <DeleteDataDialog open={dlg === "data"} onOpenChange={(o) => setDlg(o ? "data" : null)} onDone={() => onOverviewChanged()} />
      <DeleteAccountDialog
        open={dlg === "account"}
        onOpenChange={(o) => setDlg(o ? "account" : null)}
        email={identity.email ?? ""}
        plan={overview?.plan}
        onDeleted={() => signOut({ to: "/login/?deleted=1" })}
      />
    </div>
  );
}
