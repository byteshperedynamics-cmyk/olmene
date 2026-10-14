"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { prefersReducedMotion } from "../in-view";
import { Section, SectionHeader } from "./section";

const SRC = "/video/olmene-film.mp4"; // 1080p60 H.264, ~5 MB, served with byte ranges by app/video/[name]
const POSTER = "/video/olmene-film-poster.webp";

/**
 * The 20-second brand film (find it, fix it, prove it). Nothing downloads
 * until the section is near the screen. It then plays muted and loops while
 * in view and pauses when scrolled away. Reduced motion or Save-Data: the
 * poster waits for a press. Turning sound on restarts it from the top.
 */
export function HomeFilm() {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [manual, setManual] = useState(false); // no autoplay: reduced motion or Save-Data
  const userPaused = useRef(false);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const noAuto = prefersReducedMotion() || !!conn?.saveData;
    setManual(noAuto);
    const el = wrap.current;
    if (!el) return;
    // Load a little before it scrolls in; play only while mostly visible.
    const near = new IntersectionObserver(([e]) => e.isIntersecting && setLoaded(true), { rootMargin: "400px 0px" });
    const seen = new IntersectionObserver(
      ([e]) => {
        const v = video.current;
        if (!v) return;
        if (e.isIntersecting && !noAuto && !userPaused.current) v.play().catch(() => {});
        if (!e.isIntersecting) v.pause();
      },
      { threshold: 0.45 },
    );
    near.observe(el);
    seen.observe(el);
    return () => {
      near.disconnect();
      seen.disconnect();
    };
  }, []);

  // The <source> is added when the section comes near; tell the element to pick it up.
  useEffect(() => {
    if (loaded) video.current?.load();
  }, [loaded]);

  function toggle() {
    const v = video.current;
    if (!v) return;
    setLoaded(true);
    if (v.paused) {
      userPaused.current = false;
      if (manual && v.currentTime === 0) {
        // An explicit first press plays with sound.
        v.muted = false;
        setMuted(false);
      }
      v.play().catch(() => {});
    } else {
      userPaused.current = true;
      v.pause();
    }
  }

  function toggleSound() {
    const v = video.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) {
      v.currentTime = 0; // hear it from the start
      userPaused.current = false;
      v.play().catch(() => {});
    }
  }

  return (
    <Section id="film" aria-label={t("film.title")} className="pb-0 md:pb-0 lg:pb-0">
      <SectionHeader eyebrow={t("film.label")} title={t("film.title")} lede={t("film.lede")} />
      <div ref={wrap} className="o-film group relative mt-10 overflow-hidden rounded-[22px] sm:rounded-[28px]">
        <video
          ref={video}
          className="block aspect-video w-full bg-black object-cover"
          poster={POSTER}
          muted
          loop
          playsInline
          preload={loaded ? "auto" : "none"}
          aria-label={t("film.aria")}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (bar.current && v.duration) bar.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
          }}
        >
          {loaded && <source src={SRC} type="video/mp4" />}
        </video>

        {/* Poster state with no autoplay: one large, obvious play button */}
        {manual && !playing && (
          <button
            type="button"
            onClick={toggle}
            aria-label={t("film.play")}
            className="absolute inset-0 grid cursor-pointer place-items-center bg-black/20 transition-colors hover:bg-black/10 focus-visible:outline-none"
          >
            <span className="grid size-20 place-items-center rounded-full bg-white text-black shadow-2xl ring-8 ring-white/10 transition-transform duration-200 group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-white/60">
              <Play className="ms-1 size-8" aria-hidden />
            </span>
          </button>
        )}

        <div className="absolute bottom-4 end-4 z-[2] flex gap-2 sm:bottom-5 sm:end-5">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? t("film.soundOn") : t("film.soundOff")}
            aria-pressed={!muted}
            className="o-hit relative grid size-10 place-items-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? t("film.pause") : t("film.play")}
            className="o-hit relative grid size-10 place-items-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="ms-0.5 size-4" aria-hidden />}
          </button>
        </div>

        {/* Progress: a hairline along the bottom edge */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
          <span ref={bar} className="block h-full origin-left scale-x-0 bg-white/70 transition-transform duration-300 ease-linear rtl:origin-right" />
        </span>
      </div>
    </Section>
  );
}
