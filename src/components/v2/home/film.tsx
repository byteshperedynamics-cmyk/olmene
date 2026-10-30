"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const SRC = "/video/olmene-film.mp4"; // 1080p60 H.264, ~5 MB, served with byte ranges by app/video/[name]
const POSTER = "/video/olmene-film-poster.webp";

/**
 * The 20-second brand film, behind an explicit press (refinement
 * 2026-10-30): nothing downloads or plays until someone asks for it. It
 * opens in a dialog with the browser's own controls and sound available.
 */
export function FilmButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "o-hit relative inline-flex items-center gap-2 rounded-md text-[14px] text-muted-foreground transition-colors duration-[var(--dur-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <span className="grid size-7 place-items-center rounded-full border border-rim">
          <Play className="ms-0.5 size-3.5" aria-hidden />
        </span>
        {t("home.film")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] gap-3 p-3 sm:max-w-4xl sm:p-4">
          <DialogTitle className="px-1 text-[15px] font-medium">{t("film.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("film.aria")}</DialogDescription>
          {open && (
            <video className="block aspect-video w-full rounded-lg bg-black" poster={POSTER} controls autoPlay playsInline preload="auto" aria-label={t("film.aria")}>
              <source src={SRC} type="video/mp4" />
            </video>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
