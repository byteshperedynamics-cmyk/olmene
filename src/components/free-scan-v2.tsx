"use client";

/**
 * Free scan v2 visuals (engine/v2 contract): the detected business category,
 * the "how you show up" preview cards (Google result + shared-link card),
 * the annotated first-screen screenshot, and the on-demand head-tag
 * proposals ("Show me the fix"). Rendered inside <FreeAuditResult/>.
 *
 * Honesty rules carried over from the scan card: everything shown comes from
 * the payload; `snippet`/`html` strings from the engine are escaped text and
 * are rendered as text, never as HTML; a hypothesis is labelled as one.
 */

import { useState } from "react";
import { Camera, CheckCircle2, ChevronDown, Copy, ExternalLink, Search, Share2, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getScanProposals, type FreeAuditCategory, type FreeAuditPin, type FreeAuditPreview, type FreeAuditProposals, type FreeAuditShot } from "@/lib/api";
import { useI18n } from "@/i18n/provider";

/* ── Business category ─────────────────────────────────────────────────── */

export function CategoryBadge({ category }: { category: FreeAuditCategory }) {
  const { t } = useI18n();
  const title = t("form.categoryHint", { confidence: category.confidence });
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-background px-3 py-1 font-mono text-xs text-muted-foreground"
      title={title}
    >
      <Sparkles className="size-3" aria-hidden /> {category.label}
      {category.confidence !== "high" && <span aria-hidden>· {category.confidence}</span>}
    </span>
  );
}

/* ── Preview cards: Google result + shared link ────────────────────────── */

function TruncatedLine({ text, className }: { text: string | null; className: string }) {
  if (!text) return null;
  const lines = className.includes("line-clamp-1") ? 1 : 2;
  const capped = text.length > 60 * lines ? `${text.slice(0, 60 * lines - 1).trimEnd()}…` : text;
  return <span className={className}>{capped}</span>;
}

export function PreviewCards({ preview, after }: { preview: FreeAuditPreview; after?: FreeAuditProposals["previewAfter"] | null }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Search className="size-3.5" aria-hidden /> {t("form.previewGoogle")}
        </p>
        <div className="rounded-xl border border-line-strong bg-background p-3.5">
          <div className="flex items-center gap-2">
            {preview.serp.favicon ? (
              <img src={preview.serp.favicon} alt="" className="size-4 rounded-sm" />
            ) : (
              <span className="grid size-4 place-items-center rounded-sm bg-surface-2 text-[13px] text-faint font-medium">
                {(preview.serp.siteName ?? preview.serp.displayUrl)[0]?.toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] leading-tight text-foreground">{preview.serp.siteName ?? preview.serp.displayUrl}</span>
              <span className="block truncate font-mono text-[11px] leading-tight text-faint" dir="ltr">{preview.serp.displayUrl}</span>
            </span>
          </div>
          <TruncatedLine text={preview.serp.title} className="mt-1.5 line-clamp-1 block text-[15px] leading-snug text-primary" />
          <TruncatedLine text={preview.serp.description} className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted-foreground" />
          {after && (after.serp.title !== preview.serp.title || after.serp.description !== preview.serp.description) && (
            <p className="mt-2 border-t border-line-strong pt-2 text-[12px] leading-snug">
              <span className="me-1 text-[13px] text-tel-emerald font-medium">after</span>
              <TruncatedLine text={after.serp.title} className="line-clamp-1 text-[13.5px] text-primary" />
              <TruncatedLine text={after.serp.description} className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground" />
            </p>
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Share2 className="size-3.5" aria-hidden /> {t("form.previewSocial")}
          {preview.social.card && <span className="font-mono text-[11px] text-faint">({preview.social.card})</span>}
        </p>
        <div className="overflow-hidden rounded-xl border border-line-strong bg-background">
          {preview.social.image ? (
            <img src={preview.social.image} alt="" className="max-h-36 w-full object-cover" />
          ) : (
            <div className="grid h-20 place-items-center bg-surface-2/60 font-mono text-[11px] text-faint">{t("form.previewNoImage")}</div>
          )}
          <div className="p-3">
            <span className="block truncate text-[13px] text-faint font-medium" dir="ltr">{preview.social.host}</span>
            <TruncatedLine text={preview.social.title} className="mt-0.5 line-clamp-1 block text-[13.5px] font-medium leading-snug" />
            <TruncatedLine text={preview.social.description} className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted-foreground" />
            {after && (after.social.title !== preview.social.title || after.social.description !== preview.social.description) && (
              <p className="mt-2 border-t border-line-strong pt-2 text-[12px] leading-snug">
                <span className="me-1 text-[13px] text-tel-emerald font-medium">after</span>
                <TruncatedLine text={after.social.title} className="line-clamp-1 text-[12.5px]" />
                <TruncatedLine text={after.social.description} className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground" />
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Annotated screenshot ───────────────────────────────────────────────── */

function pinTone(status: FreeAuditPin["status"]): string {
  return status === "pass"
    ? "border-score-good bg-score-good"
    : status === "warn"
      ? "border-signal-amber bg-signal-amber"
      : "border-signal-rust bg-signal-rust";
}

export function ShotPanel({ shot }: { shot: FreeAuditShot }) {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);

  if (shot.status === "unavailable") return null;

  if (shot.status === "pending" || !shot.url) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-2/40 px-4 py-3.5 text-[13px] text-muted-foreground" role="status">
        <Camera className="size-4 shrink-0" aria-hidden /> {t("form.shotPending")}
      </div>
    );
  }

  const w = shot.width ?? 1280;
  const h = shot.height ?? 800;
  const pins = shot.pins ?? [];
  const sel = active !== null ? pins[active] : null;

  return (
    <div className="grid gap-3">
      <div className="relative overflow-hidden rounded-xl border border-line-strong bg-surface-2" dir="ltr">
        <img src={shot.url} alt={t("form.shotAlt")} className="block w-full" width={w} height={h} />
        {/* Pins are pixel boxes in the screenshot's own coordinates (w×h), so a percentage overlay scales with the responsive image. */}
        {pins.map((p, i) => (
          <button
            key={`${p.kind}-${i}`}
            type="button"
            onClick={() => setActive(active === i ? null : i)}
            aria-label={p.label}
            aria-pressed={active === i}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_2px_10px_rgb(0_0_0/0.4)] transition-transform duration-150 hover:scale-110 ${pinTone(p.status)} ${active === i ? "size-5 ring-2 ring-white/70" : "size-4"}`}
            style={{ left: `${((p.box.x + p.box.w / 2) / w) * 100}%`, top: `${((p.box.y + p.box.h / 2) / h) * 100}%` }}
          />
        ))}
      </div>
      {sel ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-line-strong bg-background px-3.5 py-3 text-[13px]">
          {sel.status === "pass" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 score-good" aria-hidden />
          ) : sel.status === "warn" ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 score-mid" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 score-bad" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="font-medium">{sel.label}</span>
            {sel.text && <span className="block truncate text-muted-foreground" title={sel.text}>“{sel.text}”</span>}
          </span>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {pins.map((p, i) => (
            <li key={`${p.kind}-${i}`}>
              <button
                type="button"
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                  p.status === "pass"
                    ? "border-line-strong text-muted-foreground"
                    : "border-signal-amber/40 bg-signal-amber/[0.06] text-foreground hover:bg-signal-amber/10"
                }`}
              >
                <span className={`size-1.5 rounded-full ${pinTone(p.status)}`} aria-hidden />
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Proposals: "Show me the fix" ───────────────────────────────────────── */

function CopyChip({ label, text }: { label: string; text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error(t("rv.toastCopyFail"));
        }
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied ? <CheckCircle2 className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      {copied ? t("rv.copied") : label}
    </button>
  );
}

export function ProposalsPanel({ scanId, onProposals }: { scanId: string; onProposals?: (p: FreeAuditProposals) => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "loading" | "done" | "nothing" | "error">("idle");
  const [proposals, setProposals] = useState<FreeAuditProposals | null>(null);
  const [openTags, setOpenTags] = useState(false);

  async function load() {
    setState("loading");
    try {
      const r = await getScanProposals(scanId);
      if (r.nothingToFix || !r.proposals.fields.length) {
        setState("nothing");
        return;
      }
      setProposals(r.proposals);
      onProposals?.(r.proposals);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "idle" || state === "loading") {
    return (
      <button
        type="button"
        onClick={load}
        disabled={state === "loading"}
        className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-leaf-soft px-3.5 py-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
      >
        <Sparkles className="size-3.5" aria-hidden />
        {state === "loading" ? t("form.proposeLoading") : t("form.proposeCta")}
      </button>
    );
  }

  if (state === "nothing") {
    return <p className="text-[13px] text-muted-foreground">{t("form.proposeNothing")}</p>;
  }
  if (state === "error") {
    return <p className="text-[13px] text-signal-rust">{t("form.proposeError")}</p>;
  }
  if (!proposals) return null;

  return (
    <div className="grid gap-4">
      {proposals.fields.map((f) => (
        <div key={f.field} className="rounded-xl border border-line-strong bg-background p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] tracking-[0.1em] text-faint font-medium">{f.field}</p>
            <CopyChip label={t("rv.copyText")} text={f.after} />
          </div>
          {f.before && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <span className="line-through decoration-muted-foreground/50">{f.before}</span>
            </p>
          )}
          <p className="mt-1 text-[13.5px] font-medium leading-relaxed">{f.after}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/70">{t("rv.copyWhy")}</span> {f.rationale}
          </p>
        </div>
      ))}

      <div className="overflow-hidden rounded-xl border border-line-strong bg-surface-2/60" dir="ltr">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
          <span className="text-[13px] tracking-[0.1em] text-faint font-medium">&lt;head&gt;</span>
          <CopyChip label={t("rv.copyHtml")} text={proposals.snippet} />
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
          <code>{proposals.snippet}</code>
        </pre>
      </div>

      {proposals.tags.length > 0 && (
        <details open={openTags} onToggle={(e) => setOpenTags((e.target as HTMLDetailsElement).open)} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            {t("form.proposeTags", { n: proposals.tags.length })}
          </summary>
          <ul className="mt-2 grid gap-2">
            {proposals.tags.map((tag) => (
              <li key={tag.id} className="rounded-lg border border-line-strong bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-medium">{tag.why}</p>
                  <CopyChip label={t("rv.copyHtml")} text={tag.html} />
                </div>
                <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
                  <code>{tag.html}</code>
                </pre>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
        <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
        {t("form.proposeApplyHint")}
      </p>
    </div>
  );
}
