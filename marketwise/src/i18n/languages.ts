/**
 * Marketwise supported languages — the 14 most spoken languages worldwide
 * (Ethnologue ranking by total speakers) plus Greek, per product decision.
 *
 * `code` is a valid BCP-47 primary tag used for <html lang>; `native` is the
 * endonym shown in the selector; `dir` marks the two RTL scripts.
 * Order = speaker ranking, English (site default) first, Greek last (the +1).
 */
export const LANGUAGES = [
  { code: "en", native: "English", english: "English", dir: "ltr" },
  { code: "zh", native: "中文", english: "Chinese", dir: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "es", native: "Español", english: "Spanish", dir: "ltr" },
  { code: "fr", native: "Français", english: "French", dir: "ltr" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl" },
  { code: "bn", native: "বাংলা", english: "Bengali", dir: "ltr" },
  { code: "pt", native: "Português", english: "Portuguese", dir: "ltr" },
  { code: "ru", native: "Русский", english: "Russian", dir: "ltr" },
  { code: "ur", native: "اردو", english: "Urdu", dir: "rtl" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
  { code: "de", native: "Deutsch", english: "German", dir: "ltr" },
  { code: "ja", native: "日本語", english: "Japanese", dir: "ltr" },
  { code: "tr", native: "Türkçe", english: "Turkish", dir: "ltr" },
  { code: "el", native: "Ελληνικά", english: "Greek", dir: "ltr" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

export const LANG_MAP: Record<string, { native: string; english: string; dir: "ltr" | "rtl" }> =
  Object.fromEntries(LANGUAGES.map((l) => [l.code, { native: l.native, english: l.english, dir: l.dir }]));

export function isLangCode(v: string | null | undefined): v is LangCode {
  return !!v && v in LANG_MAP;
}

/** localStorage key for the visitor's language choice. */
export const LANG_STORAGE_KEY = "mw-lang";
