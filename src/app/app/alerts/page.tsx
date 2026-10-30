"use client";

/**
 * Alert channels (engine v2): Slack, Discord and webhooks that receive the
 * same events email gets. The masked URL is all this page ever sees; a
 * webhook's signing secret is shown exactly once, right after it's created.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, KeyRound, PauseCircle, Play, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addAlertChannel,
  deleteAlertChannel,
  getAlertChannels,
  testAlertChannel,
  updateAlertChannel,
  type AlertChannel,
} from "@/lib/agent-client";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/v2/atoms";

const input =
  "h-11 w-full rounded-md border border-line-strong bg-background px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const KIND_HINT: Record<AlertChannel["kind"], { label: string; placeholder: string; help: string }> = {
  slack: {
    label: "Slack",
    placeholder: "https://hooks.slack.com/services/…",
    help: "Slack → Apps → Incoming Webhooks → Add (choose a channel), then paste the URL.",
  },
  discord: {
    label: "Discord",
    placeholder: "https://discord.com/api/webhooks/…",
    help: "Discord → channel settings → Integrations → Webhooks → New Webhook → Copy URL.",
  },
  webhook: {
    label: "Webhook",
    placeholder: "https://yourapp.com/hooks/olmene",
    help: "Any public https endpoint. POSTs signed JSON (X-Olmene-Signature: sha256 HMAC with your signing secret).",
  },
};

function AddChannelForm({ kinds, onAdded }: { kinds: string[]; onAdded: () => void }) {
  const [kind, setKind] = useState<AlertChannel["kind"]>("slack");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  async function add() {
    setBusy(true);
    try {
      const r = await addAlertChannel({ kind, url: url.trim(), label: label.trim() || undefined, kinds: selected.size ? [...selected] : undefined });
      if (r.signingSecret) setSecret(r.signingSecret);
      else toast.success("Channel added. A test event is on its way.");
      setUrl("");
      setLabel("");
      setSelected(new Set());
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the channel. Check the URL.");
    } finally {
      setBusy(false);
    }
  }

  if (secret) {
    return (
      <div className="grid gap-3 rounded-xl border border-tel-amber/40 bg-tel-amber/[0.06] p-4" role="alert">
        <p className="flex items-center gap-2 text-[14px] font-medium">
          <KeyRound className="size-4 text-tel-amber" aria-hidden /> Your webhook signing secret — shown once
        </p>
        <p className="text-[13px] text-muted-foreground">
          Verify incoming deliveries with it (HMAC-SHA256 of the body). It&apos;s not retrievable later — store it now.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 font-mono text-[12.5px]" dir="ltr">
            {secret}
          </code>
          <Button
            variant="hairline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                toast.success("Copied.");
              } catch {
                toast.error("Could not copy — select the text manually.");
              }
            }}
          >
            Copy
          </Button>
          <Button variant="sheen" size="sm" onClick={() => setSecret(null)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-1" role="tablist" aria-label="Channel type">
        {(Object.keys(KIND_HINT) as AlertChannel["kind"][]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-lg px-3 py-1.5 text-[13px] capitalize transition-colors ${
              kind === k ? "bg-surface-2 font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {KIND_HINT[k].label}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5 text-[13px]">
        <span className="text-muted-foreground">{KIND_HINT[kind].label} URL</span>
        <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={KIND_HINT[kind].placeholder} dir="ltr" autoComplete="off" />
        <span className="text-[12px] text-muted-foreground">{KIND_HINT[kind].help}</span>
      </label>
      <label className="grid gap-1.5 text-[13px]">
        <span className="text-muted-foreground">Name (optional)</span>
        <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Team Slack" />
      </label>
      {kinds.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="text-[13px] text-muted-foreground">Send (nothing selected = everything)</legend>
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                aria-pressed={selected.has(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
                  selected.has(k) ? "border-rim bg-chip text-foreground" : "border-line-strong text-muted-foreground hover:text-foreground",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <Button variant="sheen" onClick={add} disabled={busy || !url.trim()}>
          {busy ? "Adding…" : "Add channel"}
        </Button>
      </div>
    </div>
  );
}

function ChannelRow({ ch, onChanged }: { ch: AlertChannel; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const hint = KIND_HINT[ch.kind];

  async function patch(p: Parameters<typeof updateAlertChannel>[1], name: string) {
    setBusy(name);
    try {
      await updateAlertChannel(ch.id, p);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the channel.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const r = await testAlertChannel(ch.id);
      if (r.ok || r.queued) toast.success("Test event sent — check the channel.");
      else toast.error("The test delivery failed. Check the URL, or remove and re-add the channel.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send a test.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await deleteAlertChannel(ch.id);
      toast("Channel removed.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the channel.");
      setBusy(null);
    }
  }

  return (
    <li className={cn("grid gap-2 rounded-xl border bg-background px-4 py-3.5", !ch.active && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
          <BellRing className="size-3.5 text-muted-foreground" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium">{ch.label ?? hint.label}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {ch.kind}
            </span>
            {!ch.active && (
              <span className="flex items-center gap-1 rounded bg-diff-del px-1.5 py-0.5 font-mono text-[11px] text-signal-rust">
                <PauseCircle className="size-3" aria-hidden /> paused after {ch.failures} failures
              </span>
            )}
          </span>
          <span className="block truncate font-mono text-[11.5px] text-muted-foreground" dir="ltr">
            {ch.url}
          </span>
        </span>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="hairline" size="sm" onClick={test} disabled={busy !== null}>
            {busy === "test" ? "Sending…" : "Test"}
          </Button>
          {!ch.active ? (
            <Button variant="hairline" size="sm" onClick={() => void patch({ active: true }, "resume")} disabled={busy !== null}>
              <Play className="size-3.5" aria-hidden /> Resume
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" aria-label={`Remove ${ch.label ?? hint.label}`} onClick={remove} disabled={busy !== null}>
            {busy === "delete" ? "…" : <Trash2 className="size-4 text-muted-foreground" aria-hidden />}
          </Button>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {ch.kinds.length ? `Events: ${ch.kinds.join(", ")}` : "Every event"}
        {ch.lastSentAt ? ` · last delivery ${fmtDateTime(ch.lastSentAt)}` : ""}
        {ch.lastError ? ` · last error: ${ch.lastError}` : ""}
      </p>
    </li>
  );
}

export default function AlertsPage() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["alert-channels"], queryFn: getAlertChannels });
  const channels = data?.channels ?? [];

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <Eyebrow>Alerts</Eyebrow>
        <h1 className="o-display text-[32px] leading-tight">Where notifications land</h1>
        <p className="max-w-xl text-[15px] text-muted-foreground">
          Send reports, pull requests, regressions and weekly digests to Slack, Discord or a webhook — next to
          email, or instead of it. One test click proves the plumbing.
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border bg-card p-6">
        <h2 className="o-display text-2xl">Channels</h2>
        {isLoading ? (
          <p className="text-[14px] text-muted-foreground">Loading…</p>
        ) : channels.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">No channels yet. Add one below — email keeps working either way.</p>
        ) : (
          <ul className="grid gap-2">
            {channels.map((c) => (
              <ChannelRow key={c.id} ch={c} onChanged={() => refetch()} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 rounded-2xl border bg-card p-6">
        <h2 className="o-display text-2xl">Add a channel</h2>
        <AddChannelForm kinds={data?.kinds ?? []} onAdded={() => refetch()} />
      </section>

      <p className="pb-6 text-[12px] text-muted-foreground">
        Webhooks receive the same JSON the emails are built from, signed so you can reject fakes. Manage email
        preferences in <Link href="/app/billing/" className="underline underline-offset-4">billing</Link>.
      </p>
    </div>
  );
}
