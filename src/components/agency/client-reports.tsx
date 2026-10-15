"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/workspace/field-styles";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { TeamApiError } from "@/lib/workspace/client";
import { addReportRecipient, removeReportRecipient, sendReportTest, setReportCadence } from "@/lib/agency/client";
import { RECIPIENTS_PER_CLIENT, type ReportCadence } from "@/lib/agency/rules";
import type { Client, ClientsView } from "@/lib/agency/types";

const message = (e: unknown, fallback: string) => (e instanceof TeamApiError || e instanceof Error ? e.message : fallback);

const CADENCES: { value: ReportCadence; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** "Bakery Co's", "Bakery Brothers'". */
const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** "Mon, 20 Oct": reports go out at 08:00 UTC, the same day almost everywhere. */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * A client's emailed report, inside their card: how often (off, weekly,
 * monthly), who gets it, when the next one goes, and a test to yourself.
 * Viewers see it read-only; members and up change it (the Worker checks too).
 */
export function ClientReports({ client, canEdit, onView }: { client: Client; canEdit: boolean; onView: (v: ClientsView) => void }) {
  const r = client.report;
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = r.recipients.filter((x) => !x.unsubscribedAt);
  const scored = client.sites.some((s) => s.lastScore != null);
  const full = active.length >= RECIPIENTS_PER_CLIENT;
  const suggestion = client.contactEmail && !r.recipients.some((x) => x.email === client.contactEmail) ? client.contactEmail : null;
  const on = r.cadence !== "off";

  async function run<T>(key: string, fn: () => Promise<T>, fallback: string): Promise<T | null> {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(message(e, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function choose(cadence: ReportCadence) {
    const v = await run("cadence", () => setReportCadence(client.id, cadence), "Couldn't change how often it goes out.");
    if (!v) return;
    onView(v);
    const next = v.clients.find((c) => c.id === client.id)?.report.nextAt;
    toast.success(cadence === "off" ? `${possessive(client.name)} report is off` : `The first one goes out ${next ? day(next) : "soon"}`);
  }

  async function add(address: string) {
    const v = await run("add", () => addReportRecipient(client.id, address), "Couldn't add them.");
    if (!v) return;
    onView(v);
    setEmail("");
  }

  async function remove(id: string, address: string) {
    const v = await run(id, () => removeReportRecipient(client.id, id), "Couldn't remove them.");
    if (!v) return;
    onView(v);
    toast(`${address} won't get ${possessive(client.name)} report any more`);
  }

  async function test() {
    const res = await run("test", () => sendReportTest(client.id), "Couldn't send the test.");
    if (res) toast.success(`Test on its way to ${res.to}`);
  }

  const status =
    on && r.nextAt ? `${r.cadence === "weekly" ? "Weekly" : "Monthly"} · next ${day(r.nextAt)}` : on ? (r.cadence === "weekly" ? "Weekly" : "Monthly") : "Off";

  return (
    <section className="grid gap-3 rounded-xl border border-edge bg-chip/40 p-4" aria-label={`${possessive(client.name)} emailed report`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-[14px] font-medium">
          <Mail className="size-4" aria-hidden /> Email report
        </h3>
        <span className="text-[12.5px] text-muted-foreground">{status}</span>
      </div>

      {!on && r.recipients.length === 0 && (
        <p className="max-w-md text-[13px] text-muted-foreground">
          A short email each week or month with every site&apos;s score and what changed, under your name. Recipients can unsubscribe in one click.
        </p>
      )}

      {canEdit && (
        // Looks like the app's tabs: a muted track, the chosen one raised. (Not a
        // fieldset: Chrome sizes those by their hidden legend and the card overflows on phones.)
        <div role="radiogroup" aria-label={`How often ${client.name} gets it`} className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
          {CADENCES.map((c) => (
            <label
              key={c.value}
              className="cursor-pointer rounded-md border border-transparent px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-default dark:has-[:checked]:border-input dark:has-[:checked]:bg-input/30 pointer-coarse:py-2.5"
            >
              <input
                type="radio"
                name={`cadence-${client.id}`}
                value={c.value}
                checked={r.cadence === c.value}
                onChange={() => void choose(c.value)}
                disabled={busy !== null}
                className="sr-only"
              />
              {c.label}
            </label>
          ))}
        </div>
      )}

      {r.recipients.length > 0 && (
        <ul className="divide-y divide-[var(--edge)] rounded-lg border border-edge bg-background" aria-label="Who gets it">
          {r.recipients.map((x) => (
            <li key={x.id} className="flex min-h-11 items-center justify-between gap-3 py-1 ps-3 pe-1">
              <span className={cn("min-w-0 flex-1 truncate text-[13.5px] [contain:inline-size]", x.unsubscribedAt && "text-muted-foreground")} dir="ltr">
                {x.email}
              </span>
              {x.unsubscribedAt ? (
                <span className="shrink-0 pe-2 text-[12px] text-muted-foreground">Unsubscribed {fmtDate(x.unsubscribedAt)}</span>
              ) : canEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label={`Remove ${x.email}`}
                  disabled={busy !== null}
                  onClick={() => void remove(x.id, x.email)}
                >
                  <X className="size-4 text-muted-foreground" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !full && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void add(email.trim());
          }}
        >
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Email address to send {possessive(client.name)} report to</span>
              <input
                className={cn(inputClass, "h-10")}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="name@client.com"
                inputMode="email"
                autoComplete="off"
                dir="ltr"
                required
                aria-invalid={error ? true : undefined}
                disabled={busy !== null}
              />
            </label>
            <Button type="submit" variant="hairline" className="h-10 shrink-0" disabled={busy !== null}>
              <Plus className="size-4" aria-hidden /> {busy === "add" ? "Adding…" : "Add"}
            </Button>
          </div>
          {suggestion && (
            <button
              type="button"
              className="o-hit w-fit text-start text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
              onClick={() => void add(suggestion)}
              disabled={busy !== null}
            >
              Add their contact, <span dir="ltr">{suggestion}</span>
            </button>
          )}
        </form>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-tel-rose">
          {error}
        </p>
      )}

      {on && (active.length === 0 || !scored) && (
        <p className="text-[13px] text-muted-foreground">
          {active.length === 0 ? "Add someone to send it to." : `Nothing goes out until one of ${possessive(client.name)} sites has a finished scan.`}
        </p>
      )}

      {(r.sentAt || (canEdit && scored)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-muted-foreground">{r.sentAt ? `Last sent ${fmtDate(r.sentAt)}` : ""}</span>
          {canEdit && scored && (
            <Button variant="ghost" size="sm" onClick={() => void test()} disabled={busy !== null}>
              <Send className="size-3.5" aria-hidden /> {busy === "test" ? "Sending…" : "Send me a test"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
