"use client";

import { useState } from "react";
import { Link2Off, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import type { UnsubscribeView } from "@/lib/agency/types";
import { BrandedPage } from "./client-portal";

const NO_BRAND = { name: null, color: null, url: null, logoUrl: null, whiteLabel: false };

/**
 * Stopping one client's emailed report: who it's about, which address gets
 * it, and one button. Under the agency's branding (the reader is their
 * client), so no Olmene banner or analytics (BrandedPage marks it).
 */
export function ReportUnsubscribe({ view, token }: { view: UnsubscribeView | null; token: string | null }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(view?.unsubscribed ? "done" : "idle");

  async function stop() {
    if (!token) return;
    setState("busy");
    try {
      const res = await fetch("/api/report-unsubscribe/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  const icon = (I: typeof MailX) => (
    <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-rim bg-secondary">
      <I className="size-6" aria-hidden />
    </span>
  );

  return (
    <BrandedPage brand={view?.brand ?? NO_BRAND}>
      <div className="mx-auto grid max-w-md justify-items-center gap-4 py-10 text-center" aria-live="polite">
        {!view ? (
          <>
            {icon(Link2Off)}
            <h1 className="o-display text-[28px] leading-tight">{t("unsub.invalid.title")}</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{t("unsub.invalid.body")}</p>
          </>
        ) : state === "done" ? (
          <>
            {icon(MailX)}
            <h1 className="o-display text-[28px] leading-tight">{t("unsub.done.title")}</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{t("unsub.done.body", { client: view.client })}</p>
          </>
        ) : (
          <>
            {icon(MailX)}
            <h1 className="o-display text-balance text-[28px] leading-tight">{t("unsub.title", { client: view.client })}</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {t("unsub.body", { client: view.client })}{" "}
              <strong className="font-medium text-foreground" dir="ltr">
                {view.email}
              </strong>
            </p>
            {state === "error" && (
              <p role="alert" className="text-[14px] text-tel-rose">
                {t("unsub.error")}
              </p>
            )}
            <Button size="xl" className="mt-2" onClick={() => void stop()} disabled={state === "busy"}>
              {state === "busy" ? t("unsub.busy") : t("unsub.cta")}
            </Button>
          </>
        )}
      </div>
    </BrandedPage>
  );
}
