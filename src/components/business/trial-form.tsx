"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass, selectClass } from "@/components/workspace/field-styles";
import { useI18n } from "@/i18n/provider";
import { SUPPORT_EMAIL } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";
import { track } from "@/lib/track";
import { cleanTrialRequest, TEAM_SIZES, TrialInputError, type TrialField, type TrialKind } from "@/lib/trial/rules";
import { cn } from "@/lib/utils";

const SIZE_LABEL: Record<(typeof TEAM_SIZES)[number], string> = { "1": "trial.size.1", "2-5": "trial.size.2", "6-20": "trial.size.6", "21+": "trial.size.21" };

type Fields = { name: string; email: string; company: string; website: string; kind: TrialKind | ""; teamSize: string; note: string };
const EMPTY: Fields = { name: "", email: "", company: "", website: "", kind: "", teamSize: "", note: "" };

/** 16 px on phones, so iOS doesn't zoom into the field. */
const field = cn(inputClass, "text-[16px] sm:text-[14px]");

/**
 * The free-trial request (/business/#trial). Checks fields here with the
 * same rules as the Worker, shows each problem at its field and focuses the
 * first; the button stays enabled until sending starts. A hidden field and
 * the time since the form appeared keep bots out quietly.
 */
export function TrialForm() {
  const { t, lang } = useI18n();
  const [f, setF] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<TrialField | "form", string>>>({});
  const [state, setState] = useState<"idle" | "busy" | { done: "created" | "duplicate"; name: string; email: string }>("idle");
  const shownAt = useRef(0);
  const hp = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (errors[k as TrialField] || errors.form) setErrors({ ...errors, [k]: undefined, form: undefined });
  };

  function focusField(field: string) {
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
    el?.focus();
  }

  async function submit() {
    if (state === "busy") return;
    const raw = { ...f, teamSize: f.teamSize || null, kind: f.kind || undefined };
    try {
      cleanTrialRequest(raw);
    } catch (e) {
      if (e instanceof TrialInputError) {
        setErrors({ [e.field]: t(`trial.err.${e.code}`) });
        focusField(e.field);
        return;
      }
      throw e;
    }
    setState("busy");
    setErrors({});
    try {
      const session = (await getSupabase()?.auth.getSession())?.data.session;
      const res = await fetch("/api/trial-request/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ ...raw, language: lang, hp: hp.current?.value ?? "", elapsedMs: Date.now() - shownAt.current }),
      });
      const data = (await res.json().catch(() => null)) as { duplicate?: boolean; error?: { code?: string; field?: TrialField } } | null;
      if (res.ok) {
        track("trial_request", { kind: f.kind || "unknown" });
        setState({ done: data?.duplicate ? "duplicate" : "created", name: f.name.trim().split(/\s+/)[0] ?? "", email: f.email.trim().toLowerCase() });
        return;
      }
      const code = data?.error?.code ?? "";
      const field = data?.error?.field;
      if (field) {
        setErrors({ [field]: t(`trial.err.${code}`) });
        setState("idle");
        focusField(field);
        return;
      }
      setErrors({ form: code === "slow_down" ? t("trial.err.slow_down") : t("trial.err.generic", { email: SUPPORT_EMAIL ?? "" }) });
    } catch {
      setErrors({ form: t("trial.err.generic", { email: SUPPORT_EMAIL ?? "" }) });
    }
    setState("idle");
  }

  if (typeof state === "object") {
    return (
      <div className="grid justify-items-start gap-4" role="status" aria-live="polite">
        <CircleCheck className="size-8 text-tel-emerald" aria-hidden />
        <h3 className="o-display text-[26px] leading-tight">{t("trial.done.title", { name: state.name })}</h3>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {state.done === "duplicate" ? t("trial.done.dup", { email: state.email }) : t("trial.done.body", { email: state.email })}
        </p>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t("trial.done.next")}</p>
        <Button asChild variant="hairline">
          <Link href="/sample-report/">{t("trial.done.cta")}</Link>
        </Button>
      </div>
    );
  }

  const busy = state === "busy";
  const err = (k: TrialField) =>
    errors[k] ? (
      <span id={`trial-${k}-error`} className="text-[13px] text-tel-rose">
        {errors[k]}
      </span>
    ) : null;
  const a11y = (k: TrialField, hint?: string) => ({
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `trial-${k}-error` : hint,
    "data-field": k,
  });

  return (
    <form
      ref={formRef}
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid content-start gap-1.5 text-[14px]">
          <span className="font-medium">{t("trial.name")}</span>
          <input className={field} value={f.name} onChange={set("name")} autoComplete="name" maxLength={100} {...a11y("name")} />
          {err("name")}
        </label>
        <label className="grid content-start gap-1.5 text-[14px]">
          <span className="font-medium">{t("trial.email")}</span>
          <input
            className={field}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            dir="ltr"
            value={f.email}
            onChange={set("email")}
            maxLength={254}
            {...a11y("email")}
          />
          {err("email")}
        </label>
        <label className="grid content-start gap-1.5 text-[14px]">
          <span className="font-medium">{t("trial.company")}</span>
          <input className={field} value={f.company} onChange={set("company")} autoComplete="organization" maxLength={120} {...a11y("company")} />
          {err("company")}
        </label>
        <label className="grid content-start gap-1.5 text-[14px]">
          <span className="font-medium">{t("trial.website")}</span>
          <input
            className={field}
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            dir="ltr"
            placeholder="company.com"
            value={f.website}
            onChange={set("website")}
            maxLength={300}
            {...a11y("website", "trial-website-hint")}
          />
          {err("website") ?? (
            <span id="trial-website-hint" className="text-[13px] text-muted-foreground">
              {t("trial.websiteHint")}
            </span>
          )}
        </label>
      </div>

      <div role="radiogroup" aria-labelledby="trial-kind-label" aria-describedby={errors.kind ? "trial-kind-error" : undefined} className="grid gap-2">
        <span id="trial-kind-label" className="text-[14px] font-medium">
          {t("trial.kind")}
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["company", "agency"] as const).map((k, i) => (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border border-edge p-4 transition-colors hover:bg-chip/40 has-[:checked]:border-rim has-[:checked]:bg-chip/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                errors.kind && "border-tel-rose/60",
              )}
            >
              <input
                type="radio"
                name="trial-kind"
                value={k}
                checked={f.kind === k}
                onChange={set("kind")}
                className="mt-1 size-4 shrink-0 accent-[var(--foreground)] focus-visible:outline-none"
                {...(i === 0 ? { "data-field": "kind" } : {})}
              />
              <span className="grid content-start gap-0.5">
                <span className="text-[14px] font-medium">{t(`trial.kind.${k}`)}</span>
                <span className="text-[13px] text-muted-foreground">{t(`trial.kind.${k}Hint`)}</span>
              </span>
            </label>
          ))}
        </div>
        {err("kind")}
      </div>

      <label className="grid gap-1.5 text-[14px] sm:max-w-[16rem]">
        <span className="font-medium">{t("trial.size")}</span>
        <select className={cn(selectClass, "h-11 text-[16px] sm:text-[14px]")} value={f.teamSize} onChange={set("teamSize")} {...a11y("teamSize")}>
          <option value="">{t("trial.size.choose")}</option>
          {TEAM_SIZES.map((s) => (
            <option key={s} value={s}>
              {t(SIZE_LABEL[s])}
            </option>
          ))}
        </select>
        {err("teamSize")}
      </label>

      <label className="grid content-start gap-1.5 text-[14px]">
        <span className="font-medium">{t("trial.note")}</span>
        <textarea
          className={cn(field, "h-auto min-h-28 py-2.5 leading-relaxed")}
          rows={4}
          maxLength={1000}
          placeholder={t("trial.notePlaceholder")}
          value={f.note}
          onChange={set("note")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          {...a11y("note")}
        />
        {err("note")}
      </label>

      {/* For bots only: people never see or reach this field. */}
      {/* Clipped, not pushed off-screen: off to the left would scroll sideways in Arabic and Urdu. */}
      <div aria-hidden className="sr-only">
        <label>
          Website address
          <input ref={hp} name="website_url" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {errors.form && (
        <p role="alert" className="rounded-xl border border-tel-rose/30 bg-tel-rose/[0.06] p-3 text-[14px]">
          {errors.form}
        </p>
      )}

      <div className="grid gap-3">
        <Button type="submit" variant="sheen" size="xl" className="w-full sm:w-fit" disabled={busy}>
          {busy ? t("trial.sending") : t("trial.submit")}
        </Button>
        <p className="text-[13px] text-muted-foreground">
          {t("trial.privacy")}{" "}
          <Link href="/legal/privacy/" className="underline underline-offset-4 hover:text-foreground">
            {t("trial.privacyLink")}
          </Link>
        </p>
      </div>
    </form>
  );
}
