"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useI18n, Tx, usePageMeta } from "@/i18n/provider";
import { SUPPORT_EMAIL } from "@/lib/config";

/**
 * Legal pages (Privacy Policy / Terms of Service).
 *
 * Server page.tsx files keep their metadata export and render this client
 * component; all body copy comes from the active language dictionary.
 * Paragraph strings may carry {{bold}} / [[em]] markers.
 */

export type LegalSection = { h: string; p: string[] };

export const LP_SECTIONS: LegalSection[] = [
  { h: "lp.s1.h", p: ["lp.s1.p", "lp.s1.trial", "lp.s1.recipients"] },
  { h: "lp.s2.h", p: ["lp.s2.p"] },
  { h: "lp.s3.h", p: ["lp.s3.p"] },
  { h: "lp.s4.h", p: ["lp.s4.p"] },
  { h: "lp.s5.h", p: ["lp.s5.p"] },
  { h: "lp.s6.h", p: ["lp.s6.p"] },
  { h: "lp.s7.h", p: ["lp.s7.p"] },
  { h: "lp.s8.h", p: ["lp.s8.p"] },
];

export const LT_SECTIONS: LegalSection[] = [
  { h: "lt.s1.h", p: ["lt.s1.p"] },
  { h: "lt.s2.h", p: ["lt.s2.p"] },
  { h: "lt.s3.h", p: ["lt.s3.p", "lt.s3.refund"] },
  { h: "lt.s4.h", p: ["lt.s4.p"] },
  { h: "lt.s5.h", p: ["lt.s5.p"] },
  { h: "lt.s6.h", p: ["lt.s6.p"] },
  { h: "lt.s7.h", p: ["lt.s7.p"] },
  { h: "lt.s8.h", p: ["lt.s8.p"] },
];

export function LegalContent({ variant, sections }: { variant: "privacy" | "terms"; sections: LegalSection[] }) {
  const { t } = useI18n();
  usePageMeta(variant === "privacy" ? "meta.title.privacy" : "meta.title.terms");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t(variant === "privacy" ? "lp.h1" : "lt.h1")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(variant === "privacy" ? "lp.updated" : "lt.updated")}
          </p>
          <div className="mt-8 space-y-6 leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_strong]:text-foreground">
            {sections.map((s) => (
              <section key={s.h}>
                <h2>{t(s.h)}</h2>
                {s.p.map((k) => (
                  <p key={k}>
                    <Tx k={k} />
                  </p>
                ))}
              </section>
            ))}
            {SUPPORT_EMAIL && (
              <section>
                <h2>{t("footer.contact")}</h2>
                <p>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
