"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, LogOut, MailPlus, RotateCw, ShieldCheck, Trash2, UsersRound } from "lucide-react";
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
import { UserAvatar } from "@/components/account/user-avatar";
import { initials } from "@/lib/account/progress";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INVITABLE_ROLES, ROLE_COPY, atLeast, type InvitableRole } from "@/lib/workspace/roles";
import { changeMemberRole, inviteToWorkspace, removeMember, revokeInvite, TeamApiError, updateWorkspace } from "@/lib/workspace/client";
import type { WorkspaceInvite, WorkspaceKind, WorkspaceMember, WorkspaceView } from "@/lib/workspace/types";
import { inputClass, selectClass } from "./field-styles";

const input = inputClass;
const select = selectClass;

const message = (e: unknown, fallback: string) => (e instanceof TeamApiError || e instanceof Error ? e.message : fallback);

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5));
}

// ── Workspace name ────────────────────────────────────────────────────────

function NameForm({ view, onSaved }: { view: WorkspaceView; onSaved: (v: WorkspaceView) => void }) {
  const [name, setName] = useState(view.name);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== view.name && name.trim().length > 0;
  async function save() {
    setBusy(true);
    try {
      onSaved(await updateWorkspace({ name: name.trim() }));
      toast.success("Workspace renamed");
    } catch (e) {
      toast.error(message(e, "Couldn't rename the workspace."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) void save();
      }}
    >
      <label htmlFor="ws-name" className="text-[13px] text-muted-foreground">
        Workspace name
      </label>
      <div className="flex gap-2">
        <input id="ws-name" className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
        <Button type="submit" variant="hairline" className="h-11 shrink-0" disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">People see it in their workspace switcher and in invitation emails.</p>
    </form>
  );
}

// ── Company or agency ─────────────────────────────────────────────────────

const KINDS: { kind: WorkspaceKind; label: string; blurb: string }[] = [
  { kind: "company", label: "Company", blurb: "Your organisation's own websites." },
  {
    kind: "agency",
    label: "Agency",
    blurb: "Websites you look after for clients. Adds a Clients page: sites grouped by client, and pages to share with them under your name.",
  },
];

function KindForm({ view, onSaved }: { view: WorkspaceView; onSaved: (v: WorkspaceView) => void }) {
  const [busy, setBusy] = useState(false);
  async function choose(kind: WorkspaceKind) {
    if (kind === view.kind || busy) return;
    setBusy(true);
    try {
      onSaved(await updateWorkspace({ kind }));
      toast.success(kind === "agency" ? "Agency features are on. Find them under Clients." : "Now a company workspace. Your clients are kept if you switch back.");
    } catch (e) {
      toast.error(message(e, "Couldn't change it."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="grid gap-2" disabled={busy}>
      <legend className="mb-2 text-[13px] text-muted-foreground">What it's for</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((k) => (
          <label
            key={k.kind}
            className="flex cursor-pointer gap-3 rounded-xl border border-edge p-4 transition-colors hover:bg-chip/40 has-[:checked]:border-rim has-[:checked]:bg-chip/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-default"
          >
            <input
              type="radio"
              name="ws-kind"
              value={k.kind}
              checked={view.kind === k.kind}
              onChange={() => void choose(k.kind)}
              className="mt-1 size-4 shrink-0 accent-[var(--foreground)] focus-visible:outline-none"
            />
            <span className="grid content-start gap-0.5">
              <span className="text-[14px] font-medium">{k.label}</span>
              <span className="text-[13px] text-muted-foreground">{k.blurb}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ── Inviting ──────────────────────────────────────────────────────────────

function InviteForm({ view, onInvited }: { view: WorkspaceView; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; link: string; emailed: boolean; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const full = view.seats.used >= view.seats.limit;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await inviteToWorkspace(email.trim(), role);
      setSent({ email: r.invite.email, link: r.link, emailed: r.emailed, expiresAt: r.invite.expiresAt });
      setEmail("");
      setCopied(false);
      onInvited();
    } catch (e) {
      setError(message(e, "Couldn't send the invitation."));
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  if (full) {
    return (
      <div className="grid gap-3 rounded-xl border border-dashed border-line-strong p-4">
        <p className="text-[14px]">
          {view.seats.limit <= 1
            ? "Your plan is for one person. Inviting your team starts with the Fix plan (2 people) or Agency (5)."
            : `All ${view.seats.limit} places on your plan are taken. Remove someone, withdraw an invitation, or move to a bigger plan.`}
        </p>
        {view.role === "owner" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button asChild variant="sheen" size="sm">
              <Link href="/app/billing/">See plans</Link>
            </Button>
            {view.seats.limit <= 1 && (
              <Link href="/business/#trial" className="text-[13px] font-medium underline underline-offset-4">
                Or try the Agency plan with your team, free for 14 days
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="grid gap-1.5 text-[13px]">
          <span className="text-muted-foreground">Email</span>
          <input
            className={input}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby="invite-help"
            dir="ltr"
            required
          />
        </label>
        <label className="grid gap-1.5 text-[13px]">
          <span className="text-muted-foreground">Role</span>
          <select className={cn(select, "h-11")} value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_COPY[r].label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="sheen" className="h-11" disabled={busy}>
          <MailPlus className="size-4" aria-hidden /> {busy ? "Sending…" : "Send invitation"}
        </Button>
      </form>
      <p id="invite-help" className={cn("text-[12.5px]", error ? "text-tel-rose" : "text-muted-foreground")}>
        {error ?? `${ROLE_COPY[role].label}: ${ROLE_COPY[role].blurb} The link works for 14 days and only for that address.`}
      </p>
      {sent && (
        <div className="grid gap-2 rounded-xl border border-rim bg-chip/60 p-4" role="status">
          <p className="flex items-center gap-2 text-[14px] font-medium">
            <Check className="size-4 text-tel-emerald" aria-hidden />
            {sent.emailed ? `Invitation emailed to ${sent.email}` : `Invitation ready for ${sent.email}`}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {sent.emailed ? "You can also send them this link yourself." : "Send them this link."} It works until {fmtDate(sent.expiresAt)}.
          </p>
          <div className="flex gap-2">
            <input className={cn(input, "h-10 font-mono text-[12px]")} value={sent.link} readOnly aria-label="Invitation link" dir="ltr" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="hairline" className="h-10 shrink-0" onClick={() => void copy(sent.link)}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── People ────────────────────────────────────────────────────────────────

function MemberRow({ m, view, onChanged, onAskRemove }: { m: WorkspaceMember; view: WorkspaceView; onChanged: () => void; onAskRemove: (m: WorkspaceMember) => void }) {
  const [busy, setBusy] = useState(false);
  const canManage = atLeast(view.role, "admin") && m.role !== "owner";
  async function setRole(role: InvitableRole) {
    setBusy(true);
    try {
      await changeMemberRole(m.userId, role);
      const who = m.you ? "You are" : `${m.name ?? m.email ?? "They"} is`;
      toast.success(`${who} now ${role === "admin" ? "an" : "a"} ${ROLE_COPY[role].label.toLowerCase()}`);
      onChanged();
    } catch (e) {
      toast.error(message(e, "Couldn't change the role."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <UserAvatar src={m.avatarUrl} initials={initials(m.name, m.email)} size={36} />
      <span className="grid min-w-[9rem] flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-medium">{m.name ?? m.email ?? "Someone"}</span>
          {m.you && <span className="shrink-0 rounded-full border border-rim px-1.5 py-px text-[11px] text-muted-foreground">You</span>}
        </span>
        {m.name && m.email && (
          <span className="truncate text-[12.5px] text-muted-foreground" dir="ltr">
            {m.email}
          </span>
        )}
      </span>
      <span className="ms-12 flex shrink-0 items-center gap-1.5 sm:ms-0">
        {canManage ? (
          <select
            className={select}
            value={m.role}
            disabled={busy}
            aria-label={`Role for ${m.name ?? m.email ?? "this person"}`}
            onChange={(e) => void setRole(e.target.value as InvitableRole)}
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_COPY[r].label}
              </option>
            ))}
          </select>
        ) : (
          <span className="px-1 text-[13px] text-muted-foreground">{ROLE_COPY[m.role].label}</span>
        )}
        {canManage && !m.you && (
          <Button variant="ghost" size="sm" aria-label={`Remove ${m.name ?? m.email ?? "this person"}`} onClick={() => onAskRemove(m)} disabled={busy}>
            <Trash2 className="size-4 text-muted-foreground" aria-hidden />
          </Button>
        )}
      </span>
    </li>
  );
}

function InviteRow({ inv, onChanged }: { inv: WorkspaceInvite; onChanged: () => void }) {
  const [busy, setBusy] = useState<"again" | "withdraw" | null>(null);
  async function again() {
    setBusy("again");
    try {
      const r = await inviteToWorkspace(inv.email, inv.role);
      toast.success(r.emailed ? `New link emailed to ${inv.email}` : `New link ready for ${inv.email}`);
      onChanged();
    } catch (e) {
      toast.error(message(e, "Couldn't send it again."));
    } finally {
      setBusy(null);
    }
  }
  async function withdraw() {
    setBusy("withdraw");
    try {
      await revokeInvite(inv.id);
      toast(`Invitation for ${inv.email} withdrawn`);
      onChanged();
    } catch (e) {
      toast.error(message(e, "Couldn't withdraw it."));
      setBusy(null);
    }
  }
  const left = daysLeft(inv.expiresAt);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-line-strong">
        <MailPlus className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="grid min-w-[12rem] flex-1 gap-0.5">
        <span className="truncate text-[14px]" dir="ltr">
          {inv.email}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {ROLE_COPY[inv.role].label}
          {inv.invitedBy ? ` · invited by ${inv.invitedBy}` : ""}
          {" · "}
          <span className={inv.expired ? "text-tel-amber" : undefined}>
            {inv.expired ? "link expired" : left <= 1 ? "link expires today" : `link works ${left} more days`}
          </span>
        </span>
      </span>
      <span className="ms-12 flex shrink-0 gap-1.5 sm:ms-0">
        <Button variant="hairline" size="sm" onClick={() => void again()} disabled={busy !== null}>
          <RotateCw className="size-3.5" aria-hidden /> {busy === "again" ? "Sending…" : "Send again"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void withdraw()} disabled={busy !== null}>
          {busy === "withdraw" ? "…" : "Withdraw"}
        </Button>
      </span>
    </li>
  );
}

// ── The page body ─────────────────────────────────────────────────────────

export function TeamView({ view, onChanged, onLeft }: { view: WorkspaceView; onChanged: (next?: WorkspaceView) => void; onLeft: () => void }) {
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const admin = atLeast(view.role, "admin");
  const me = view.members.find((m) => m.you);
  const owner = view.members.find((m) => m.role === "owner");

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeMember(removing.userId);
      toast(`${removing.name ?? removing.email ?? "They"} no longer has access`);
      setRemoving(null);
      onChanged();
    } catch (e) {
      toast.error(message(e, "Couldn't remove them."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmLeave() {
    if (!me) return;
    setBusy(true);
    try {
      await removeMember(me.userId);
      onLeft();
    } catch (e) {
      toast.error(message(e, "Couldn't leave the workspace."));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-5 rounded-2xl border bg-card p-6" aria-labelledby="people">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="people" className="o-display text-2xl">
              People
            </h2>
            <p className="text-[13.5px] text-muted-foreground">
              {view.seats.used} of {view.seats.limit} {view.seats.limit === 1 ? "place" : "places"} on {owner?.you ? "your" : `${owner?.name ?? "the owner"}'s`} plan
              {view.invites.length ? `, ${view.invites.filter((i) => !i.expired).length} waiting on an invitation` : ""}
            </p>
          </div>
          <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${Math.min(100, (view.seats.used / Math.max(1, view.seats.limit)) * 100)}%` }} />
          </div>
        </div>
        <ul className="divide-y divide-border">
          {view.members.map((m) => (
            <MemberRow key={m.userId} m={m} view={view} onChanged={() => onChanged()} onAskRemove={setRemoving} />
          ))}
        </ul>
        {admin && view.invites.length > 0 && (
          <div className="grid gap-1">
            <h3 className="text-[13px] font-medium text-muted-foreground">Invited</h3>
            <ul className="divide-y divide-border">
              {view.invites.map((inv) => (
                <InviteRow key={inv.id} inv={inv} onChanged={() => onChanged()} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {admin && (
        <section className="grid gap-4 rounded-2xl border bg-card p-6" aria-labelledby="invite">
          <div className="grid gap-1">
            <h2 id="invite" className="o-display text-2xl">
              Invite someone
            </h2>
            <p className="text-[13.5px] text-muted-foreground">They join this workspace and share its plan, sites, reports and fixes.</p>
          </div>
          <InviteForm view={view} onInvited={() => onChanged()} />
        </section>
      )}

      <section className="grid gap-4 rounded-2xl border bg-card p-6" aria-labelledby="roles">
        <h2 id="roles" className="o-display text-2xl">
          What each role can do
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {(["owner", "admin", "member", "viewer"] as const).map((r) => (
            <li key={r} className={cn("grid gap-1 rounded-xl border border-edge p-4", view.role === r && "border-rim bg-chip/60")}>
              <span className="flex items-center gap-2 text-[14px] font-medium">
                {r === "owner" ? <ShieldCheck className="size-4" aria-hidden /> : <UsersRound className="size-4" aria-hidden />}
                {ROLE_COPY[r].label}
                {view.role === r && <span className="rounded-full border border-rim px-1.5 py-px text-[11px] font-normal text-muted-foreground">You</span>}
              </span>
              <span className="text-[13px] text-muted-foreground">{ROLE_COPY[r].blurb}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted-foreground">
          Nothing Olmene changes in code merges without someone approving the pull request on GitHub, whatever their role here.
        </p>
      </section>

      {admin && (
        <section className="grid gap-4 rounded-2xl border bg-card p-6" aria-labelledby="settings">
          <h2 id="settings" className="o-display text-2xl">
            Workspace
          </h2>
          <NameForm key={view.name} view={view} onSaved={(v) => onChanged(v)} />
          <KindForm view={view} onSaved={(v) => onChanged(v)} />
        </section>
      )}

      {view.role !== "owner" && me && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-tel-rose/30 p-6" aria-labelledby="leave">
          <div className="grid gap-1">
            <h2 id="leave" className="text-[15px] font-medium">
              Leave {view.name}
            </h2>
            <p className="text-[13.5px] text-muted-foreground">You lose access straight away. Your own account stays as it is.</p>
          </div>
          <Button variant="outline" className="border-tel-rose/40 text-tel-rose hover:bg-tel-rose/10" onClick={() => setLeaving(true)}>
            <LogOut className="size-4" aria-hidden /> Leave workspace
          </Button>
        </section>
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => !busy && !o && setRemoving(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-[28rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name ?? removing?.email ?? "this person"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to {view.name} straight away. What they did here (reports, fixes, approvals) stays, and you can invite them again later.
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
              {busy ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaving} onOpenChange={(o) => !busy && setLeaving(o)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-[28rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {view.name}?</AlertDialogTitle>
            <AlertDialogDescription>You lose access straight away. To come back, someone there has to invite you again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Stay</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmLeave();
              }}
              className="bg-tel-rose text-white hover:bg-tel-rose/90"
            >
              {busy ? "Leaving…" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
