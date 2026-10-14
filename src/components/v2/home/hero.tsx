"use client";

import { Check } from "lucide-react";
import { FreeAuditInput, FreeAuditResult } from "@/components/free-audit-form";
import { useI18n, Tx } from "@/i18n/provider";
import { ScanStage } from "./scan-stage";

/**
 * Hero: one centred statement, the scan box, then the signature 3D stage
 * (a homepage being scanned and fixed). The H1 is the LCP element:
 * server-rendered and fully opaque from the first paint (.hero-in moves it,
 * never hides it). The 3D scene loads after it, when the browser is idle.
 */
export function HomeHero() {
  const { t } = useI18n();

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="o-hero-backdrop pointer-events-none absolute inset-0 -z-10" />

        <div className="mx-auto w-full max-w-4xl px-4 pt-14 text-center sm:px-6 sm:pt-20 lg:pt-24">
          <h1
            className="hero-in o-display o-hero-title mx-auto text-[42px] leading-[1.02] sm:text-[60px] lg:text-[76px]"
            style={{ animationDelay: "0.05s" }}
          >
            <Tx k="hero.title" />
          </h1>
          <p
            className="hero-in mx-auto mt-6 max-w-[36rem] text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]"
            style={{ animationDelay: "0.12s" }}
          >
            {t("hero.subtitle")}
          </p>
          <div id="free-diagnosis" className="hero-in mx-auto mt-9 max-w-xl scroll-mt-28 text-center" style={{ animationDelay: "0.2s" }}>
            <FreeAuditInput variant="hero" />
          </div>
          <ul className="mx-auto mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] text-muted-foreground">
            {["hero.trust1", "hero.trust2", "hero.trust3"].map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-faint" strokeWidth={2.5} aria-hidden /> {t(k)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 px-2 pb-10 sm:mt-14 sm:px-6 md:pb-16">
          <ScanStage />
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
