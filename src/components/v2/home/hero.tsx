"use client";

import { FreeAuditInput, FreeAuditResult } from "@/components/free-audit-form";
import { featureAgentEnabled } from "@/lib/agent-client";
import { useI18n, Tx } from "@/i18n/provider";
import { LivePill } from "../atoms";
import { InView } from "../in-view";
import { ScanPreview } from "../scan-preview";

/**
 * Hero — the agent visibly working within five seconds. The H1 is the LCP
 * element: server-rendered, fully opaque from the first paint (the entrance is
 * transform-only via .hero-in).
 */
export function HomeHero() {
  const { t } = useI18n();
  const agentOn = featureAgentEnabled();

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="o-grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(90%_80%_at_50%_0%,black,transparent)]"
        />
        <div aria-hidden className="o-wash-hero pointer-events-none absolute inset-0 -z-10" />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="min-w-0">
            {agentOn && (
              <div className="hero-in" style={{ animationDelay: "0.02s" }}>
                <LivePill tone="live">{t("hero.pill")}</LivePill>
              </div>
            )}
            <h1
              className="hero-in o-display mt-5 text-[40px] leading-[1.03] sm:text-[52px] lg:text-[62px]"
              style={{ animationDelay: "0.05s" }}
            >
              <Tx k="hero.title" />
            </h1>
            <p
              className="hero-in mt-5 max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground"
              style={{ animationDelay: "0.12s" }}
            >
              {t("hero.subtitle")}
            </p>
            <div id="free-diagnosis" className="hero-in mt-8 scroll-mt-24" style={{ animationDelay: "0.2s" }}>
              <FreeAuditInput variant="hero" />
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[11px] text-faint">
              {["hero.trust1", "hero.trust2", "hero.trust3"].map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden className="size-1 rounded-full bg-primary/70" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <InView className="min-w-0 lg:ps-4">
            <ScanPreview
              pins={[t("scan.pin1"), t("scan.pin2"), t("scan.pin3")]}
              toastTitle={t("scan.toast")}
              toastMeta={`${t("scan.toastMeta")} →`}
              previewLabel={t("scan.preview")}
            />
          </InView>
        </div>
      </section>

      <FreeAuditResultSection />
    </>
  );
}

/** Full-width home for the diagnosis card, directly under the hero. */
function FreeAuditResultSection() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 empty:hidden sm:px-6 [&:has(#diagnosis)]:py-12">
      <FreeAuditResult />
    </div>
  );
}
