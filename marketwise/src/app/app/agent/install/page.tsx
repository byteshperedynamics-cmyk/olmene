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
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [installations, setInstallations] = useState<Array<{ id: number; login: string; type: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { fetchGithubInstallations } = await import("@/lib/agent-client");
        const res = await fetchGithubInstallations(state);
        if (alive) setInstallations(res.installations);
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
    try {
      const { linkGithubInstallation } = await import("@/lib/agent-client");
      const res = await linkGithubInstallation(state, picked);
      toast.success(`Connected to ${res.account} (${res.repos.length} repos).`);
      window.location.href = "/app/agent/?connected=1";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link that installation.");
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
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading your installations…</p>
          ) : installations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No installations were found for your GitHub login. Go back and connect again after installing the app on
              your repository.
            </p>
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
