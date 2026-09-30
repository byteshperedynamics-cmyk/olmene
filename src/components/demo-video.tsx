"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { useI18n } from "@/i18n/provider";

/**
 * Showcase video player.
 *
 * - Poster + custom play overlay; the 22MB video file is only fetched when
 *   the user actually presses play (preload="none") — zero impact on page load.
 * - Native controls take over once playback starts.
 * - All visible labels come from the active language dictionary.
 */
export function DemoVideo({ src, poster }: { src: string; poster: string }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function handlePlay() {
    setStarted(true);
    videoRef.current?.play();
  }

  return (
    <figure>
      <div className="relative overflow-hidden rounded-xl border bg-card shadow-lg">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          preload="none"
          controls={started}
          playsInline
          aria-label={t("demo.videoAria", { caption: t("demo.caption") })}
          className="aspect-video w-full object-cover"
        >
          {/* The demo is a silent screen recording — this captions track
              narrates the on-screen journey (a11y + Lighthouse). */}
          <track
            kind="captions"
            src="/video/olmene-demo-captions.vtt"
            srcLang="en"
            label="English"
          />
        </video>
        {!started && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={t("demo.playAria")}
            className="group absolute inset-0 grid cursor-pointer place-items-center bg-card/5 transition-colors"
          >
            <span className="flex flex-col items-center gap-4">
              <span className="grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background/60 transition-transform duration-200 group-hover:scale-105 group-active:scale-95 sm:size-24">
                <Play className="ms-1 size-8 sm:size-10" aria-hidden />
              </span>
              <span className="rounded-full bg-background/85 px-4 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                {t("demo.duration")} · {t("demo.captioned")}
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
        {t("demo.caption")}
      </figcaption>
    </figure>
  );
}
