"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Github, HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function InstallPageInner() {
  const params = useSearchParams();
  const state = params.get("state") ?? "";
  // GitHub's post-install redirect (the app's Setup URL) carries
  // ?installation_id&setup_action but no state. The raw id is never trusted:
  // it only means "re-verify", so restart the OAuth round-trip, which returns
  // here with a state once GitHub confirms this user's installations.
  const fromGithubInstall = !state && params.has("installation_id");
  const [reconnecting, setReconnecting] = useState(fromGithubInstall);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [installations, setInstallations] = useState<Array<{ id: number; login: string; type: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function reconnect() {
    setReconnecting(true);
    try {
      const { connectGithub } = await import("@/lib/agent-client");
      const { url } = await connectGithub();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach GitHub. Try again.");
      setReconnecting(false);
    }
  }

  useEffect(() => {
    if (fromGithubInstall) {
      void reconnect();
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { fetchGithubInstallations } = await import("@/lib/agent-client");
        const res = await fetchGithubInstallations(state);
        if (alive) {
          setInstallations(res.installations);
          // One installation (the usual case): nothing to choose, pre-select it.
          if (res.installations.length === 1) setPicked(res.installations[0].id);
        }
      } catch {
        /* the card below explains the empty case */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [state]);

  async function link() {
    if (picked == null) return;
    setBusy(true);
    setLinkError(null);
    try {
      const { linkGithubInstallation } = await import("@/lib/agent-client");
      const res = await linkGithubInstallation(state, picked);
      toast.success(`Connected to ${res.account} (${res.repos.length} repos).`);
      window.location.href = "/app/agent/?connected=1";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not link that installation.";
      toast.error(msg);
      setLinkError(msg); // stays visible next to the button (a toast is easy to miss)
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Github className="size-4" aria-hidden /> Choose the account to connect
          </CardTitle>
          <CardDescription>
            We verified these installations through your GitHub login — only they can be linked (spoofed IDs are
            rejected by design).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reconnecting ? (
            <p className="text-sm text-muted-foreground">Confirming your installation with GitHub…</p>
          ) : !loaded ? (
            <p className="text-sm text-muted-foreground">Loading your installations…</p>
          ) : installations.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No installations were found for your GitHub login. Install the app on your repository, then connect
                again.
              </p>
              <Button variant="outline" size="sm" onClick={() => void reconnect()}>
                Connect again
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {installations.map((i) => (
                <li key={i.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 p-3 text-sm transition-colors hover:bg-muted/40 has-[:checked]:border-foreground/40 has-[:checked]:bg-muted/50">
                    <input
                      type="radio"
                      name="installation"
                      className="size-4 accent-foreground"
                      checked={picked === i.id}
                      onChange={() => setPicked(i.id)}
                    />
                    <span className="flex-1">
                      <span className="font-mono font-medium">{i.login}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{i.type}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={link} disabled={picked == null || busy}>
              {busy ? "Linking…" : "Link this account"}
              <ArrowRight className="ml-1 size-4" aria-hidden />
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app/agent/">Cancel</Link>
            </Button>
          </div>
          {linkError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {linkError} Try again, or start over from the Fix runs page.
            </p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <HardDriveDownload className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            The app gets Contents + Pull requests (write) permission on the repositories you select during install —
            nothing else. Uninstall any time from GitHub → Settings → Applications.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InstallPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-muted-foreground">Loading…</div>}>
      <InstallPageInner />
    </Suspense>
  );
}
