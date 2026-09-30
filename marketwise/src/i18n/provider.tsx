"use client";

/**
 * Lightweight client-side i18n for the Marketwise marketing site.
 *
 * Design goals (performance first):
 *  - English (the SSR/default language) is statically bundled — zero extra
 *    requests, zero hydration flash for the majority of visitors.
 *  - Every other language is a lazy JSON chunk fetched only when selected
 *    (~5–10 KB gzipped each); the browser caches it for the session.
 *  - No i18n framework: the whole layer is ~2 KB of runtime code.
 *
 * String conventions inside dictionaries:
 *  - "{name}"          → interpolated variable, e.g. t("x", { n: 3 })
 *  - "one form|many"   → plural pair; the side is chosen by vars.n (n === 1
 *                        picks the left). Languages without a singular/plural
 *                        distinction simply repeat the same text on both sides.
 *  - "[[text]]"        → rendered as <em> by <Tx/> (accented phrase)
 *  - "{{text}}"        → rendered as <strong> by <Tx/>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LANGUAGES, LANG_MAP, LANG_STORAGE_KEY, type LangCode } from "./languages";
import en from "./dictionaries/en.json";

export type Dict = Record<string, string>;
export type Vars = Record<string, string | number>;

// One lazy chunk per non-English language — only the selected one is fetched.
const LOADERS: Partial<Record<LangCode, () => Promise<{ default: Dict }>>> = {
  zh: () => import("./dictionaries/zh.json"),
  hi: () => import("./dictionaries/hi.json"),
  es: () => import("./dictionaries/es.json"),
  fr: () => import("./dictionaries/fr.json"),
  ar: () => import("./dictionaries/ar.json"),
  bn: () => import("./dictionaries/bn.json"),
  pt: () => import("./dictionaries/pt.json"),
  ru: () => import("./dictionaries/ru.json"),
  ur: () => import("./dictionaries/ur.json"),
  id: () => import("./dictionaries/id.json"),
  de: () => import("./dictionaries/de.json"),
  ja: () => import("./dictionaries/ja.json"),
  tr: () => import("./dictionaries/tr.json"),
  el: () => import("./dictionaries/el.json"),
};

const EN_DICT = en as unknown as Dict;

// Kick off the returning visitor's dictionary download at module-evaluation
// time — before React hydrates — so the language swap lands as early as
// possible (shorter English flash, smaller reflow window). The import is
// cached; the provider's apply() picks it up instantly.
if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && stored !== "en" && LOADERS[stored as LangCode]) {
      LOADERS[stored as LangCode]!().catch(() => {});
    }
  } catch {
    /* private mode etc. */
  }
}

/** Pick the plural side of a "one|many" template (vars.n === 1 → left). */
function pickPlural(template: string, n?: number): string {
  if (n === undefined) return template;
  const parts = template.split("|");
  if (parts.length < 2) return template;
  return (n === 1 ? parts[0] : parts[1]) ?? template;
}

/** Replace {name} placeholders with vars. */
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

function resolveText(template: string, vars?: Vars): string {
  return interpolate(pickPlural(template, vars?.n), vars);
}

// ── Rich text: [[em]] and {{strong}} markers ─────────────────────────────

const RICH_RE = /(\[\[[^\]]*\]\]|\{\{[^}]*\}\})/g;

type RichPart = { t: "text"; v: string } | { t: "em" | "strong"; v: string };

function richParts(template: string, vars?: Vars): RichPart[] {
  const chosen = pickPlural(template, vars?.n);
  const parts: RichPart[] = [];
  let last = 0;
  RICH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RICH_RE.exec(chosen))) {
    if (m.index > last) parts.push({ t: "text", v: interpolate(chosen.slice(last, m.index), vars) });
    const token = m[0];
    parts.push(
      token.startsWith("[[")
        ? { t: "em", v: token.slice(2, -2) }
        : { t: "strong", v: token.slice(2, -2) },
    );
    last = m.index + token.length;
  }
  if (last < chosen.length) parts.push({ t: "text", v: interpolate(chosen.slice(last), vars) });
  return parts;
}

// ── Context ──────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: LangCode;
  /** Translate a key; optional vars ({name} interpolation, {n} plural pick). */
  t: (key: string, vars?: Vars) => string;
  /** Switch language (updates <html lang/dir>, persists, lazy-loads dict). */
  setLang: (lang: LangCode) => void;
  /** Register the current page's translated title/description (title guard). */
  registerPageMeta: (meta: { title: string; desc: string | null } | null) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");
  const [dict, setDict] = useState<Dict>(EN_DICT);
  // Guards against out-of-order resolutions when switching quickly.
  const reqRef = useRef(0);
  const restoredRef = useRef(false);
  // The active page's translated title/description (see usePageMeta).
  const pageMetaRef = useRef<{ title: string; desc: string | null } | null>(null);

  // ── Title/description guard ──────────────────────────────────────────
  // React 19 / Next own the server-rendered <title> + <meta description>
  // and re-assert them on later commits (e.g. when react-query data lands),
  // silently reverting the translated values usePageMeta wrote. We watch
  // <head> and re-apply the registered translations whenever the framework
  // overwrites them. The loop is self-terminating: once the values match,
  // the observer no-ops.
  useEffect(() => {
    const mo = new MutationObserver(() => {
      const meta = pageMetaRef.current;
      if (!meta) return;
      if (document.title !== meta.title) document.title = meta.title;
      if (meta.desc) {
        const el = document.querySelector('meta[name="description"]');
        if (el && el.getAttribute("content") !== meta.desc) {
          el.setAttribute("content", meta.desc);
        }
      }
    });
    mo.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    return () => mo.disconnect();
  }, []);

  const registerPageMeta = useCallback(
    (meta: { title: string; desc: string | null } | null) => {
      pageMetaRef.current = meta;
      if (meta) {
        if (meta.title) document.title = meta.title;
        if (meta.desc) {
          document
            .querySelector('meta[name="description"]')
            ?.setAttribute("content", meta.desc);
        }
      }
    },
    [],
  );

  const apply = useCallback(async (next: LangCode) => {
    const req = ++reqRef.current;
    const meta = LANG_MAP[next];
    document.documentElement.lang = next;
    document.documentElement.dir = meta.dir;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode — choice just won't persist */
    }
    if (next === "en") {
      setDict(EN_DICT);
      setLangState("en");
      return;
    }
    const load = LOADERS[next];
    if (!load) return;
    try {
      const mod = await load();
      if (reqRef.current !== req) return; // superseded by a newer choice
      setDict(mod.default);
      setLangState(next);
    } catch {
      /* chunk fetch failed — keep the current language rendered */
    }
  }, []);

  // Restore a returning visitor's stored choice right after hydration.
  // (The pre-hydration <script> in layout.tsx has already set lang/dir so
  // RTL users never see an LTR flash.)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (stored && stored !== "en" && stored in LANG_MAP) {
      void apply(stored as LangCode);
    }
  }, [apply]);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const template = dict[key] ?? EN_DICT[key];
      if (template === undefined) return key; // visible in dev; en fallback in prod
      return resolveText(template, vars);
    },
    [dict],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, t, setLang: (l: LangCode) => void apply(l), registerPageMeta }),
    [lang, t, apply, registerPageMeta],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

// ── Rich-text component ──────────────────────────────────────────────────

/** Renders a dictionary string, honouring [[em]] / {{strong}} markers. */
export function Tx({ k, vars }: { k: string; vars?: Vars }) {
  const { t } = useI18n();
  // t(key) without vars returns the raw template — markers are not
  // {name}-shaped, so they survive interpolation untouched.
  const parts = richParts(t(k), vars);
  return (
    <>
      {parts.map((p, i) =>
        p.t === "text" ? (
          <React.Fragment key={i}>{p.v}</React.Fragment>
        ) : p.t === "em" ? (
          <em key={i} className="font-medium">
            {p.v}
          </em>
        ) : (
          <strong key={i}>{p.v}</strong>
        ),
      )}
    </>
  );
}

// ── Page metadata hook ───────────────────────────────────────────────────

/**
 * Keeps document.title / meta description in sync with the active language.
 * Call once per page with the page's dictionary keys. Values are registered
 * with the provider's head-guard so React's own metadata re-assertion
 * (server-owned <title>) cannot silently revert them.
 */
export function usePageMeta(titleKey: string, descKey?: string) {
  const { t, registerPageMeta } = useI18n();
  useEffect(() => {
    const title = t(titleKey);
    const desc = descKey ? t(descKey) : null;
    if (title && title !== titleKey) {
      registerPageMeta({ title, desc: desc && desc !== descKey ? desc : null });
    } else {
      registerPageMeta(null);
    }
    return () => registerPageMeta(null);
    // registerPageMeta is stable (empty deps in the provider)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, titleKey, descKey]);
}

/** Native-language list for selectors (English first, Greek last). */
export const SELECTABLE_LANGUAGES = LANGUAGES;
