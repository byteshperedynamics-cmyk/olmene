"use client";

/**
 * Language selector — two faces, one component.
 *
 * Fine-pointer devices (desktop) get a polished custom dropdown: a real
 * button trigger, an animated popover, and full keyboard + ARIA listbox
 * support. Touch devices keep the native <select> — the OS picker is the
 * best mobile UX and costs zero JS. CSS decides which face is shown (see
 * .lang-select-custom / .lang-select-native in globals.css), so there is
 * no hydration mismatch and no JS environment sniffing. The hidden variant
 * is display:none, which also removes it from the accessibility tree.
 *
 * The popover is positioned by a ~20-line measurement (centred on the
 * trigger, clamped to the viewport, flips above/below as space allows) —
 * deliberately not floating-ui/Radix, which would add ~15KB to every page.
 *
 * Historical note: the previous version put the globe icon absolutely
 * BEFORE the <select> in the DOM, and Chrome paints the select control's
 * background over it — the icon exists but is invisible. Icons now live in
 * the normal flow (custom trigger) or after the control with z-10 (native).
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGUAGES, type LangCode } from "@/i18n/languages";
import { useI18n } from "@/i18n/provider";

/** Gap between trigger and popover (px). */
const GAP = 10;
/** Cleared at every viewport edge when clamping (px). */
const EDGE = 12;
/** Matches the CSS exit transition — unmount the panel after it finishes. */
const EXIT_MS = 170;

type Placement = "up" | "down";

interface PanelPos {
  left: number;
  dir: Placement;
  /** Absolute offsets relative to the (relative) root wrapper. */
  top?: number;
  bottom?: number;
}

export function LanguageSelector({
  size = "default",
  up = false,
  compact = false,
}: {
  size?: "default" | "sm";
  /** Prefer opening above the trigger (footer variant). */
  up?: boolean;
  /**
   * Header variant: a small globe + language code trigger on every device,
   * with the language list rendered only while the popover is open (no
   * 15 inline language names in the navbar DOM).
   */
  compact?: boolean;
}) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  /** Panel is mounted while open OR while animating out. */
  const [panelMounted, setPanelMounted] = useState(false);
  /** The highlighted (keyboard/hover) option — starts at the current language. */
  const [active, setActive] = useState<LangCode>(lang);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const activeIdx = Math.max(
    0,
    LANGUAGES.findIndex((l) => l.code === active),
  );

  // Keep the highlighted option in sync with external language changes
  // (e.g. the stored-language restore) while the panel is closed.
  useEffect(() => {
    if (!open) setActive(lang);
  }, [lang, open]);

  // ── Open / close ──────────────────────────────────────────────────────

  const openPanel = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setActive(lang);
    setPanelMounted(true);
    setOpen(true);
  }, [lang]);

  const closePanel = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPanelMounted(false), EXIT_MS);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const select = useCallback(
    (code: LangCode) => {
      if (code !== lang) setLang(code);
      closePanel(true);
    },
    [lang, setLang, closePanel],
  );

  // ── Popover positioning (centre + clamp + flip) ───────────────────────

  const measure = useCallback(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;
    const r = root.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Centre on the trigger, clamped to the viewport edges.
    let left = r.left + (r.width - pw) / 2;
    left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - EDGE - pw));

    const spaceDown = vh - r.bottom - EDGE;
    const spaceUp = r.top - EDGE;
    const fitsDown = spaceDown >= ph + GAP;
    const fitsUp = spaceUp >= ph + GAP;
    let dir: Placement;
    if (up) dir = fitsUp ? "up" : fitsDown ? "down" : spaceUp >= spaceDown ? "up" : "down";
    else dir = fitsDown ? "down" : fitsUp ? "up" : spaceDown >= spaceUp ? "down" : "up";

    // Convert to offsets relative to the root (the offset parent).
    left -= r.left;
    setPos(
      dir === "up"
        ? { left, dir, bottom: r.height + GAP }
        : { left, dir, top: r.height + GAP },
    );
  }, [up]);

  // Measure + focus synchronously before first paint of the panel.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    listRef.current?.focus({ preventScroll: true });
  }, [open, measure]);

  // Re-clamp if the window is resized while open.
  useEffect(() => {
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measure]);

  // Keep the highlighted option visible while navigating.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listId}-opt-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  // Close on outside pointer press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closePanel]);

  // ── Keyboard ──────────────────────────────────────────────────────────

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openPanel();
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const n = LANGUAGES.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(LANGUAGES[(activeIdx + 1) % n].code);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(LANGUAGES[(activeIdx - 1 + n) % n].code);
        break;
      case "Home":
        e.preventDefault();
        setActive(LANGUAGES[0].code);
        break;
      case "End":
        e.preventDefault();
        setActive(LANGUAGES[n - 1].code);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        select(active);
        break;
      case "Escape":
        e.preventDefault();
        closePanel(true);
        break;
      case "Tab":
        closePanel();
        break;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className="relative print:hidden">
      {/* Custom dropdown — fine-pointer devices (see globals.css) */}
      <button
        type="button"
        ref={triggerRef}
        className={`${compact ? "inline-flex" : "lang-select-custom inline-flex"} group cursor-pointer items-center gap-1.5 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-rim hover:bg-chip hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          compact ? "h-8 px-2.5 text-xs" : size === "sm" ? "h-8 ps-3 pe-2.5 text-xs" : "h-9 ps-3.5 pe-3 text-sm"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t("lang.label")}
        title={t("lang.label")}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={onTriggerKeyDown}
      >
        <Globe
          className={`transition-transform duration-300 ease-out group-hover:rotate-12 ${
            size === "sm" || compact ? "size-3.5" : "size-3.5"
          }`}
          aria-hidden
        />
        <span className={compact ? "font-mono uppercase" : "font-medium"}>{compact ? current.code : current.native}</span>
        <ChevronDown
          className={`text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          } ${size === "sm" ? "size-3" : "size-3.5"}`}
          aria-hidden
        />
      </button>

      {/* Native select — touch devices keep the OS picker (not in the compact header variant) */}
      {!compact && (
      <label className="lang-select-native relative inline-flex items-center">
        <select
          aria-label={t("lang.label")}
          title={t("lang.label")}
          value={lang}
          onChange={(e) => setLang(e.target.value as LangCode)}
          className={`cursor-pointer appearance-none rounded-full border border-border/70 bg-card/70 text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:bg-card/50 ${
            size === "sm" ? "h-8 ps-7 pe-7 text-xs" : "h-9 ps-8 pe-7 text-sm"
          }`}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.native}
            </option>
          ))}
        </select>
        {/* Icons render AFTER the select + z-10: Chrome paints the select
            background over absolutely-positioned icons that precede it. */}
        <Globe
          className={`pointer-events-none absolute start-3 z-10 text-muted-foreground ${
            size === "sm" ? "size-3" : "size-3.5"
          }`}
          aria-hidden
        />
        <ChevronDown
          className={`pointer-events-none absolute end-2.5 z-10 text-muted-foreground ${
            size === "sm" ? "size-3" : "size-3.5"
          }`}
          aria-hidden
        />
      </label>
      )}

      {/* Popover — mounted only while open / animating out */}
      {panelMounted && (
        <div
          ref={panelRef}
          data-state={open ? "open" : "closed"}
          data-dir={pos?.dir ?? (up ? "up" : "down")}
          style={
            pos
              ? { left: pos.left, ...(pos.dir === "up" ? { bottom: pos.bottom } : { top: pos.top }) }
              : undefined
          }
          className="lang-panel absolute z-50 w-72 rounded-xl border border-border/70 bg-popover/95 p-1.5 shadow-xl shadow-foreground/10 backdrop-blur-md"
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t("lang.label")}
            aria-activedescendant={`${listId}-opt-${active}`}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            className="max-h-[min(30rem,60dvh)] overflow-y-auto overscroll-contain outline-none"
          >
            {LANGUAGES.map((l) => (
              <li
                key={l.code}
                id={`${listId}-opt-${l.code}`}
                role="option"
                aria-selected={l.code === lang}
                data-lang={l.code}
                lang={l.code}
                onMouseEnter={() => setActive(l.code)}
                onClick={() => select(l.code)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start transition-colors duration-75 ${
                  active === l.code ? "bg-accent/80" : ""
                }`}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {l.code === lang && <Check className="size-3.5 text-foreground" aria-hidden />}
                </span>
                <span
                  className={`truncate text-sm ${
                    l.code === lang ? "font-semibold text-foreground" : "font-medium"
                  }`}
                >
                  {l.native}
                </span>
                <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                  {l.english}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
