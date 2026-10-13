"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAiVisibility, setAiVisibilityQuestions, type AiVisibilityRun } from "@/lib/agent-client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Flower } from "../flower";

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * AI search visibility for one site (engine v2): every week Olmene asks an AI
 * assistant with Google Search (Gemini) the questions the site's buyers ask,
 * and records whether the answer mentions the site, cites it, and who else it
 * names. Wording rule: never "ChatGPT"; that isn't what is measured.
 */
export function AiVisibilityPanel({ siteId }: { siteId: string }) {
  const q = useQuery({ queryKey: ["ai-visibility", siteId], queryFn: () => getAiVisibility(siteId) });

  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Flower size={36} variant="breathe" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-[14px] text-muted-foreground">
        Could not load AI search results for this site.{" "}
        <button type="button" onClick={() => q.refetch()} className="text-foreground underline underline-offset-4">
          Try again
        </button>
      </p>
    );
  }

  const { site, runs } = q.data;
  const latest = runs[0];
  const previous = runs[1];

  return (
    <div className="grid gap-5">
      <section className="grid gap-5 rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="o-display flex items-center gap-2 text-2xl">
              <Sparkles className="size-5 text-muted-foreground" aria-hidden /> AI search visibility
            </h2>
            <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
              Every week Olmene asks an AI assistant with Google Search (Gemini) the questions your buyers ask, and checks
              whether the answer mentions {site.host}, links to it, and which competitors it names instead.
            </p>
          </div>
          {latest && <p className="font-mono text-[11.5px] text-faint">checked {fmtDateTime(latest.checked_at)}</p>}
        </div>

        {latest ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Share label="Answers that mention you" value={latest.mention_share} prev={previous?.mention_share} />
              <Share label="Answers that link to your site" value={latest.cite_share} prev={previous?.cite_share} />
            </div>
            {runs.length > 1 && <Trend runs={runs} />}
            <Competitors run={latest} host={site.host} />
          </>
        ) : (
          <div className="o-well grid gap-2 rounded-xl p-5 text-[14px]">
            <p className="font-medium">Olmene hasn&apos;t run an AI search check for this site yet.</p>
            <p className="text-muted-foreground">
              When it does, the results show up here every week. You can set the questions it will ask now.
            </p>
          </div>
        )}
      </section>

      {latest && latest.results.length > 0 && <Answers run={latest} />}

      <QuestionsEditor siteId={siteId} questions={site.questions} />
    </div>
  );
}

function Share({ label, value, prev }: { label: string; value: number; prev?: number }) {
  const delta = prev == null ? null : Math.round((value - prev) * 100);
  return (
    <div className="o-well grid gap-2 rounded-xl p-4">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className="o-readout-strong text-[28px] leading-none">{pct(value)}</span>{" "}
        {delta != null && delta !== 0 && (
          <span className={cn("font-mono text-[12px]", delta > 0 ? "text-tel-emerald" : "text-tel-rose")}>
            {delta > 0 ? "+" : ""}
            {delta} pts vs last week
          </span>
        )}
      </p>
      <span className="block h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        <span className="block h-full rounded-full bg-foreground" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </span>
    </div>
  );
}

/** Weekly trend, oldest to newest: bar = mentions, inner bar = links. */
function Trend({ runs }: { runs: AiVisibilityRun[] }) {
  const weeks = [...runs].reverse();
  return (
    <figure className="grid gap-2">
      <figcaption className="flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
        <span>Weekly trend</span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-sm bg-foreground/35" aria-hidden /> mentioned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-sm bg-tel-sky" aria-hidden /> linked
        </span>
      </figcaption>
      <ol className="flex h-28 items-end gap-1.5" aria-label="Share of answers that mention and link to your site, by week">
        {weeks.map((r) => (
          <li key={r.id} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${fmtDate(r.checked_at)}: ${pct(r.mention_share)} mentioned, ${pct(r.cite_share)} linked`}>
            <span className="relative block w-full rounded-t bg-foreground/35" style={{ height: `${Math.max(3, r.mention_share * 100)}%` }}>
              <span className="absolute inset-x-1 bottom-0 block rounded-t bg-tel-sky" style={{ height: r.mention_share ? `${(r.cite_share / r.mention_share) * 100}%` : 0 }} />
            </span>
            <span className="sr-only">
              {fmtDate(r.checked_at)}: {pct(r.mention_share)} mentioned, {pct(r.cite_share)} linked
            </span>
          </li>
        ))}
      </ol>
      <div className="flex justify-between font-mono text-[11px] text-faint">
        <span>{fmtDate(weeks[0].checked_at)}</span>
        <span>{fmtDate(weeks[weeks.length - 1].checked_at)}</span>
      </div>
    </figure>
  );
}

function Competitors({ run, host }: { run: AiVisibilityRun; host: string }) {
  const n = run.results.length || 1;
  const named = Object.entries(run.competitor_mentions ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (!named.length) return null;
  const you = Math.round(run.mention_share * n);
  return (
    <div className="grid gap-2">
      <p className="text-[12.5px] text-muted-foreground">Named in the same answers</p>
      <ul className="flex flex-wrap gap-2">
        <li className="rounded-full border border-rim bg-chip px-2.5 py-1 font-mono text-[11.5px]">
          {host} <span className="text-faint">{you}/{n}</span>
        </li>
        {named.map(([name, count]) => (
          <li
            key={name}
            className={cn("rounded-full border px-2.5 py-1 font-mono text-[11.5px]", count > you ? "border-tel-amber/40 bg-tel-amber/10 text-tel-amber" : "border-rim text-muted-foreground")}
          >
            {name} <span className="opacity-70">{count}/{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answers({ run }: { run: AiVisibilityRun }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <h3 className="border-b px-5 py-4 o-display text-xl">The answers this week</h3>
      <ul className="divide-y divide-[var(--edge)]">
        {run.results.map((r) => (
          <li key={r.question} className="grid gap-2 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="min-w-0 text-[14.5px] font-medium">&ldquo;{r.question}&rdquo;</p>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Flag on={r.mentioned} label="mentioned" />{" "}
                <Flag on={r.cited} label="linked" />
                {r.rank != null && r.mentioned && (
                  <span className="rounded-full border border-rim bg-chip px-2 py-0.5 font-mono text-[11px] text-muted-foreground">#{r.rank} named</span>
                )}
              </div>
            </div>
            {r.excerpt && <p className="o-well rounded-lg px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">{r.excerpt}</p>}
            {(r.competitors.length > 0 || r.sources.length > 0) && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
                {r.competitors.length > 0 && <span>Also named: {r.competitors.join(", ")}</span>}
                {r.sources.slice(0, 3).map((s) => {
                  let label = s;
                  try {
                    label = new URL(s).hostname.replace(/^www\./, "");
                  } catch {
                    /* keep the raw string */
                  }
                  return (
                    <a key={s} href={s} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-mono text-tel-sky hover:underline">
                      {label} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  );
                })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
        on ? "border-tel-emerald/35 bg-tel-emerald/10 text-tel-emerald" : "border-rim text-faint",
      )}
    >
      {on ? <Check className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
      {on ? label : `not ${label}`}
    </span>
  );
}

function QuestionsEditor({ siteId, questions }: { siteId: string; questions: string[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState(questions.join("\n"));
  const [busy, setBusy] = useState(false);
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const bad = lines.filter((l) => l.length < 8 || l.length > 160);
  const valid = lines.length >= 3 && lines.length <= 10 && bad.length === 0;
  const changed = lines.join("\n") !== questions.join("\n");

  async function save() {
    setBusy(true);
    try {
      await setAiVisibilityQuestions(siteId, lines);
      await qc.invalidateQueries({ queryKey: ["ai-visibility", siteId] });
      toast.success("Saved. The next weekly check asks these questions.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the questions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-6">
      <div>
        <h3 className="o-display text-xl">Questions your buyers ask</h3>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          One per line, 3 to 10. {questions.length ? "" : "Leave it empty and Olmene writes them from your report on the first check."}
        </p>
      </div>
      <label htmlFor={`ai-q-${siteId}`} className="sr-only">
        Questions, one per line
      </label>
      <Textarea
        id={`ai-q-${siteId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(10, Math.max(4, lines.length + 1))}
        placeholder={"What is the best tool for …?\nWhich … do small teams use?\n… vs … for …?"}
        className="font-mono text-[13px] leading-relaxed"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("font-mono text-[11.5px]", valid || !changed ? "text-faint" : "text-tel-amber")}>
          {lines.length} {lines.length === 1 ? "question" : "questions"}
          {bad.length > 0 ? ` · ${bad.length} too short or too long (8–160 characters)` : ""}
          {lines.length > 10 ? " · at most 10" : ""}
        </p>
        <Button size="sm" disabled={!valid || !changed || busy} onClick={save}>
          {busy ? "Saving…" : "Save questions"}
        </Button>
      </div>
    </section>
  );
}
