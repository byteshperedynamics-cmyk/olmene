"use client";

/**
 * Site connections (engine v2): Webflow site token, WordPress application
 * password. Connecting lets Olmene apply approved guided fixes on the
 * platform for the customer and undo them. Secrets are validated by the
 * server, stored server-side, and never rendered; the list shows host,
 * provider and last verification only.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentApiError,
  disconnectSiteConnection,
  connectWebflowSite,
  connectWordpressSite,
  getSiteConnections,
} from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";
import { Eyebrow } from "@/components/v2/atoms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const input =
  "h-11 w-full rounded-[10px] border border-line-strong bg-background px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SiteConnectionsPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["site-connections"], queryFn: getSiteConnections });
  const [tab, setTab] = useState<"webflow" | "wordpress">("webflow");
  const [busy, setBusy] = useState(false);

  // Webflow: API token + site URL.
  const [wfToken, setWfToken] = useState("");
  const [wfUrl, setWfUrl] = useState("");
  // WordPress: admin username + application password (https only).
  const [wpUrl, setWpUrl] = useState("");
  const [wpUser, setWpUser] = useState("");
  const [wpPass, setWpPass] = useState("");

  async function connect() {
    setBusy(true);
    try {
      if (tab === "webflow") {
        const r = await connectWebflowSite(wfToken.trim(), wfUrl.trim());
        toast.success(`Connected to ${r.connection.siteName ?? r.connection.host}.`);
        setWfToken("");
        setWfUrl("");
      } else {
        const r = await connectWordpressSite(wpUrl.trim(), wpUser.trim(), wpPass.trim());
        toast.success(`Connected to ${r.connection.host} as ${r.connection.user}.`);
        setWpUrl("");
        setWpUser("");
        setWpPass("");
      }
      refetch();
    } catch (e) {
      if (e instanceof AgentApiError && e.code === "site_not_yours") {
        toast.error("Connect a site Olmene has scanned from this account first. Run a free scan on it, then try again.", {
          duration: 10000,
        });
      } else {
        toast.error(e instanceof AgentApiError ? e.message : "Could not connect. Check the values and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const connections = data?.connections ?? [];

  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-6">
      <div>
        <Eyebrow>Direct connections</Eyebrow>
        <h2 className="o-display mt-1 text-2xl">Let Olmene apply fixes for you</h2>
        <p className="mt-1 max-w-xl text-[14px] text-muted-foreground">
          Webflow and WordPress sites don&apos;t need GitHub. Connect yours and Olmene applies the approved
          title, description and image fixes directly — and puts the old values back if you ask.
        </p>
      </div>

      {isLoading ? (
        <p className="text-[14px] text-muted-foreground">Loading connections…</p>
      ) : connections.length > 0 ? (
        <ul className="grid gap-2">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-background px-4 py-3">
              <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">
                  <span className="font-mono">{c.host}</span>
                  <span className="ms-2 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    {c.provider}
                  </span>
                </span>
                <span className="block text-[12.5px] text-muted-foreground">
                  Verified {c.lastVerifiedAt ? fmtDateTime(c.lastVerifiedAt) : "at connect"} · the secret stays on the server
                </span>
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="hairline" size="sm">
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <DisconnectDialog id={c.id} host={c.host} onDone={() => refetch()} />
              </AlertDialog>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">No sites connected yet.</p>
      )}

      <details open={defaultOpen} className="group rounded-xl border border-dashed px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          Connect a site
          <span className="font-mono text-[11px] text-muted-foreground group-open:hidden">webflow / wordpress</span>
        </summary>
        <div className="mt-3 grid gap-3">
          <div className="flex gap-1" role="tablist" aria-label="Platform">
            {(["webflow", "wordpress"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-[13px] capitalize transition-colors ${
                  tab === k ? "bg-surface-2 font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {tab === "webflow" ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-[13px]">
                <span className="text-muted-foreground">Site URL</span>
                <input className={input} value={wfUrl} onChange={(e) => setWfUrl(e.target.value)} placeholder="https://yoursite.webflow.io" dir="ltr" autoComplete="url" />
              </label>
              <label className="grid gap-1.5 text-[13px]">
                <span className="text-muted-foreground">Webflow API token</span>
                <input className={input} value={wfToken} onChange={(e) => setWfToken(e.target.value)} placeholder="Site settings → Apps &amp; Integrations → API access" type="password" dir="ltr" autoComplete="off" />
              </label>
              <p className="text-[12px] text-muted-foreground">
                Create the token in Webflow under Site settings → Apps &amp; integrations → API access. Olmene stores
                it on the server and never shows it again.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-[13px]">
                <span className="text-muted-foreground">Site URL</span>
                <input className={input} value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://yoursite.com" dir="ltr" autoComplete="url" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[13px]">
                  <span className="text-muted-foreground">Username</span>
                  <input className={input} value={wpUser} onChange={(e) => setWpUser(e.target.value)} autoComplete="username" />
                </label>
                <label className="grid gap-1.5 text-[13px]">
                  <span className="text-muted-foreground">Application password</span>
                  <input className={input} value={wpPass} onChange={(e) => setWpPass(e.target.value)} type="password" autoComplete="off" />
                </label>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Create the application password in WordPress under Users → Profile → Application passwords (https
                sites only). Olmene stores it on the server and never shows it again.
              </p>
            </div>
          )}

          <div>
            <Button variant="sheen" onClick={connect} disabled={busy || (tab === "webflow" ? !wfToken.trim() || !wfUrl.trim() : !wpUrl.trim() || !wpUser.trim() || !wpPass.trim())}>
              {busy ? "Connecting…" : `Connect ${tab === "webflow" ? "Webflow" : "WordPress"}`}
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}

function DisconnectDialog({ id, host, onDone }: { id: string; host: string; onDone: () => void }) {
  const [result, setResult] = useState<{ verified: boolean; manualSteps: string[] } | null>(null);
  return (
    <AlertDialogContent>
      {result ? (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {result.verified ? (
                <>
                  <ShieldCheck className="size-4 text-primary" aria-hidden /> Disconnected and verified
                </>
              ) : (
                <>
                  <ShieldX className="size-4 text-signal-amber" aria-hidden /> One more step to fully remove access
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-start">
                {result.verified ? (
                  <p>Olmene confirmed with {host} that it can no longer reach the site.</p>
                ) : (
                  <div className="grid gap-2">
                    <p>Olmene deleted the connection and its stored secret, but the credential still exists on the platform. Remove it there:</p>
                    <ol className="list-decimal space-y-1 ps-5">
                      {result.manualSteps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onDone}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </>
      ) : (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {host}?</AlertDialogTitle>
            <AlertDialogDescription>
              Olmene deletes the stored credential and can no longer apply or revert fixes on this site. Changes
              already applied stay on your site; you can always undo them here first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const r = await disconnectSiteConnection(id);
                  setResult({ verified: r.ok && (r.manualSteps?.length ?? 0) === 0, manualSteps: r.manualSteps ?? [] });
                  toast.success("Disconnected.");
                } catch (e) {
                  toast.error(e instanceof AgentApiError ? e.message : "Could not disconnect. Try again.");
                }
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </>
      )}
    </AlertDialogContent>
  );
}
