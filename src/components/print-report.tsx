"use client";

import {
  SummarySection,
  ProductSection,
  MarketSection,
  CompetitorsSection,
  AuditSection,
  StrategySection,
  RoadmapSection,
  RisksSection,
  SourcesSection,
} from "@/components/report-viewer";
import { scoreLabelKey } from "@/i18n/keys";
import { useI18n } from "@/i18n/provider";
import type { ReportData } from "@/lib/report-types";

/**
 * PrintReport — the premium print/PDF face of a Olmene report.
 *
 * Hidden on screen; rendered in full when the user prints or saves as PDF.
 * A branded cover page leads into nine numbered sections, each starting on
 * a fresh page under a hairline-ruled heading, with the flower mark and
 * site URL repeated in the footer of every printed page.
 */

/** The flower mark, traced from the official logo — prints in brand terracotta. */
function PrintFlower({ size = 28, className }: { size?: number; className?: string }) {
  const D =
    "M-64.4 -63.9 C-67.3 -69.0 -77.2 -85.4 -81.4 -94.4 C-85.6 -103.5 -87.9 -110.7 -89.8 -118.1 C-91.7 -125.5 -92.6 -132.5 -92.8 -138.9 C-93.0 -145.2 -92.3 -150.4 -91.1 -156.2 C-89.9 -162.0 -88.2 -168.0 -85.6 -173.5 C-83.0 -179.1 -79.7 -184.6 -75.7 -189.6 C-71.6 -194.6 -66.8 -199.6 -61.2 -203.5 C-55.7 -207.3 -48.6 -210.5 -42.3 -212.7 C-36.0 -214.8 -30.9 -216.2 -23.7 -216.4 C-16.5 -216.6 -6.2 -215.7 0.9 -213.8 C8.0 -212.0 12.8 -209.5 18.9 -205.3 C25.0 -201.1 33.0 -193.7 37.5 -188.6 C42.1 -183.6 43.6 -180.7 46.1 -175.0 C48.6 -169.3 51.3 -162.1 52.4 -154.3 C53.5 -146.6 53.6 -137.2 52.7 -128.8 C51.8 -120.4 47.9 -108.3 46.9 -104.2 L46.9 -104.2 C37.7 -88.6 14.1 -10.1 -8.2 -10.7 C-30.4 -11.3 -75.3 -95.7 -86.5 -107.8 C-97.7 -119.8 -84.7 -95.8 -75.2 -82.8 C-65.7 -69.8 -31.4 -33.0 -29.6 -29.8 C-27.8 -26.7 -58.6 -58.2 -64.4 -63.9 Z";
  return (
    <svg
      viewBox="-263 -263 526 526"
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k} transform={`rotate(${k * 72})`}>
          <path d={D} fill="#D97757" />
        </g>
      ))}
    </svg>
  );
}

function SectionHeading({ n, title }: { n: string; title: string }) {
  const { t } = useI18n();
  return (
    <header className="print-section-head">
      <p className="print-section-kicker">{t("print.section", { n })}</p>
      <h2 className="print-section-title">{title}</h2>
      <span className="print-section-rule" aria-hidden />
    </header>
  );
}

export function PrintReport({ data }: { data: ReportData }) {
  const { t, lang } = useI18n();
  const s = data.executiveSummary.scores;
  const date = new Date(data.meta.generatedAt).toLocaleDateString(lang === "en" ? undefined : lang, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="print-doc">
      {/* ── Repeating footer: the mark + site, on every printed page ── */}
      <footer className="print-footer" aria-hidden>
        <PrintFlower size={11} />
        <span>
          Olmene · {data.meta.siteUrl} · {date}
        </span>
      </footer>

      {/* ── Cover ── */}
      <section className="print-cover">
        <div className="print-cover-brand">
          <PrintFlower size={44} />
          <span className="print-cover-wordmark">Olmene</span>
        </div>

        <div className="print-cover-body">
          <p className="print-cover-kicker">{t("print.report")}</p>
          <h1 className="print-cover-title">{data.product.name}</h1>
          <p className="print-cover-oneliner">{data.product.oneLiner}</p>

          <div className="print-cover-score">
            <span className="print-cover-score-num">{s.overall}</span>
            <span className="print-cover-score-den">/ 100</span>
            <span className="print-cover-score-label">{t(scoreLabelKey(s.overall))}</span>
          </div>

          <dl className="print-cover-meta">
            <div>
              <dt>{t("print.website")}</dt>
              <dd>{data.meta.siteUrl}</dd>
            </div>
            <div>
              <dt>{t("print.category")}</dt>
              <dd>{data.product.category}</dd>
            </div>
            <div>
              <dt>{t("print.generated")}</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>{t("print.sourcesCited")}</dt>
              <dd>{data.sources.length}</dd>
            </div>
          </dl>
        </div>

        <p className="print-cover-foot">{t("print.note")}</p>
      </section>

      {/* ── Sections ── */}
      <section className="print-section">
        <SectionHeading n="01" title={t("print.s1")} />
        <SummarySection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="02" title={t("rv.tab.product")} />
        <ProductSection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="03" title={t("rv.tab.market")} />
        <MarketSection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="04" title={t("rv.tab.competitors")} />
        <CompetitorsSection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="05" title={t("print.s5")} />
        <AuditSection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="06" title={t("rv.tab.strategy")} />
        <StrategySection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="07" title={t("print.s7")} />
        <RoadmapSection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="08" title={t("print.s8")} />
        <RisksSection r={data} />
      </section>
      <section className="print-section">
        <SectionHeading n="09" title={t("rv.tab.sources")} />
        <SourcesSection r={data} />
      </section>
    </div>
  );
}
