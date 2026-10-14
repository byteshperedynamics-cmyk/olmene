"use client";

import { useI18n } from "@/i18n/provider";
import { PLATFORM_MARKS } from "./platform-marks";

/** Which kinds of sites Olmene works on: code frameworks get pull requests, hosted platforms get guided fixes. */
export function WorksWith() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="works-with-title" className="border-y border-edge">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-14">
        <h2 id="works-with-title" className="text-center text-[15px] font-medium text-muted-foreground">
          {t("works.title")}
        </h2>
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 min-[420px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
          {PLATFORM_MARKS.map((m) => (
            <li key={m.name} className="flex items-center justify-center gap-2.5 text-faint transition-colors duration-[var(--dur-hover)] hover:text-foreground">
              <svg viewBox="0 0 24 24" className="size-[22px] shrink-0" aria-hidden focusable="false">
                <path d={m.d} fill="currentColor" />
              </svg>{" "}
              <span translate="no" className="text-[16px] font-medium tracking-[-0.01em]">
                {m.name}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-[14px] text-faint">{t("works.more")}</p>
      </div>
    </section>
  );
}
