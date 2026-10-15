"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleAlert, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Enter } from "@/components/motion";
import { LogoLoader } from "@/components/logo-loader";
import { useSession } from "@/lib/session";
import { ROLE_COPY } from "@/lib/workspace/roles";
import { acceptInvite, previewInvite, setActiveWorkspace, TeamApiError } from "@/lib/workspace/client";
import type { InvitePreview } from "@/lib/workspace/types";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <Enter className="w-full max-w-[26rem]">
      <div className="o-artifact grid gap-5 rounded-[24px] p-6 text-center sm:p-8">{children}</div>
    </Enter>
  );
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-rim bg-chip">
        <CircleAlert className="size-5" aria-hidden />
      </span>
      <div className="grid gap-2">
        <h1 className="o-display text-[26px] leading-tight">{title}</h1>
        <p className="text-[15px] text-muted-foreground">{body}</p>
      </div>
      <Button asChild size="xl" variant="hairline" className="w-full">
        <Link href="/app/">Go to Olmene</Link>
      </Button>
    </Card>
  );
}

function Invitation() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const { session, loading, signOut } = useSession();
  const [invite, setInvite] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    previewInvite(token)
      .then((i) => live && setInvite(i))
      .catch(() => live && setInvite(null));
    return () => {
      live = false;
    };
  }, [token]);

  // After signing in (or signing up) the login page sends people back here.
  const here = `/invite/?t=${encodeURIComponent(token)}`;
  const signedInAs = session?.user.email?.toLowerCase() ?? null;

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const ws = await acceptInvite(token);
      setActiveWorkspace(ws.ownerId, { to: "/app/" });
    } catch (e) {
      setError(e instanceof TeamApiError || e instanceof Error ? e.message : "Couldn't join. Try again in a moment.");
      setBusy(false);
    }
  }

  if (invite === undefined || loading) {
    return (
      <Card>
        <LogoLoader size={36} className="mx-auto" />
        <p className="text-[14px] text-muted-foreground">Opening the invitation…</p>
      </Card>
    );
  }
  if (invite === null) return <Problem title="This link isn't valid" body="It may have been withdrawn, or the address was cut short. Ask whoever invited you for a new one." />;
  if (invite.state === "used") return <Problem title="This invitation was already used" body="If that was you, you're in: open Olmene and pick the workspace from the switcher at the top." />;
  if (invite.state === "expired") return <Problem title="This invitation has expired" body={`Invitations work for 14 days. Ask ${invite.inviter ?? "whoever invited you"} to send a new one.`} />;

  const role = ROLE_COPY[invite.role];
  const mismatch = !!signedInAs && signedInAs !== invite.email.toLowerCase();

  return (
    <Card>
      <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-rim bg-chip">
        <UsersRound className="size-5" aria-hidden />
      </span>
      <div className="grid gap-2">
        <h1 className="o-display text-[28px] leading-tight">Join {invite.workspace}</h1>
        <p className="text-[15px] text-muted-foreground">
          {invite.inviter ? `${invite.inviter} invited you` : "You're invited"} as {invite.role === "admin" ? "an" : "a"} {role.label.toLowerCase()}. {role.you}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-tel-rose/30 bg-tel-rose/[0.06] p-3 text-[14px]">
          {error}
        </p>
      )}

      {!session ? (
        <div className="grid gap-2">
          <Button asChild size="xl" className="w-full">
            <Link href={`/login/?mode=signup&next=${encodeURIComponent(here)}`}>
              Create your account <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="xl" variant="hairline" className="w-full">
            <Link href={`/login/?next=${encodeURIComponent(here)}`}>I already have an account</Link>
          </Button>
          <p className="text-[13px] text-muted-foreground">
            Use <strong className="font-medium text-foreground">{invite.email}</strong>: the invitation only works for that address.
          </p>
        </div>
      ) : mismatch ? (
        <div className="grid gap-3">
          <p className="rounded-xl border border-tel-amber/40 bg-tel-amber/[0.07] p-3 text-[14px]">
            You&apos;re signed in as <strong className="font-medium">{signedInAs}</strong>, but this invitation is for{" "}
            <strong className="font-medium">{invite.email}</strong>.
          </p>
          <Button size="xl" className="w-full" onClick={() => signOut({ to: `/login/?next=${encodeURIComponent(here)}` })}>
            Sign in as {invite.email}
          </Button>
        </div>
      ) : (
        <Button size="xl" className="w-full" onClick={() => void join()} disabled={busy}>
          {busy ? (
            <>
              <LogoLoader size={16} /> Joining…
            </>
          ) : (
            <>
              Join {invite.workspace} <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      )}
    </Card>
  );
}

/** /invite/?t=… — accept a workspace invitation (sign in or sign up first if needed). */
export default function InvitePage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div aria-hidden className="o-hero-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh]" />
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-14 sm:py-20">
        <Suspense fallback={<div className="h-[24rem] w-full max-w-[26rem] animate-pulse rounded-[24px] border bg-card" />}>
          <Invitation />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
