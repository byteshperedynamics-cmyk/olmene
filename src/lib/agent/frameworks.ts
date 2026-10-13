/**
 * Edits for more frameworks (engine v2), in the same conservative style as
 * jsfile.ts: find ONE well-understood place, edit it minimally, re-check the
 * result, and return a skip reason for anything unusual.
 *
 *  - Next.js Pages Router: the <Head> block of pages/index.* (next/head) for
 *    the homepage's title, description and canonical; the <Head> block of
 *    pages/_document.* (next/document) for site-wide tags (structured data,
 *    social defaults) and <Html lang>.
 *  - Nuxt: `app.head` in nuxt.config.* (title, meta, htmlAttrs.lang, script),
 *    the site-wide defaults Nuxt's docs recommend; pages override them with
 *    useHead/useSeoMeta.
 */

import { codeMask, matchBrace, type JsEdit } from "./jsfile";

const str = (v: string) => JSON.stringify(v);

function findAllInCode(src: string, mask: boolean[], re: RegExp): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(src)) !== null) if (mask[m.index]) out.push(m);
  return out;
}

/** Braces/brackets/parens still balance in code positions. */
export function balanced(src: string): boolean {
  const mask = codeMask(src);
  const stack: string[] = [];
  const pairs: Record<string, string> = { "}": "{", "]": "[", ")": "(" };
  for (let i = 0; i < src.length; i++) {
    if (!mask[i]) continue;
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") stack.push(c);
    else if (c === "}" || c === "]" || c === ")") {
      if (stack.pop() !== pairs[c]) return false;
    }
  }
  return stack.length === 0;
}

// ─── JSX <Head> blocks (Pages Router) ────────────────────────────────────

/** JSX attribute value: a plain string in double quotes, or a JS string expression when it holds quotes/braces. */
export function jsxAttr(value: string): string {
  return /["{}\\\n]/.test(value) ? `{${str(value)}}` : `"${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`;
}

export interface JsxHead {
  /** index right after `<Head>` */
  innerStart: number;
  /** index of `</Head>` */
  innerEnd: number;
  childIndent: string;
  closeIndent: string;
}

/** The one <Head>…</Head> block, imported from the expected module. */
export function findJsxHead(src: string, module: "next/head" | "next/document"): JsxHead | { reason: string } {
  const mask = codeMask(src);
  const imp = module === "next/head"
    ? /import\s+(\w+)\s+from\s+["']next\/head["']/
    : /import\s+(?:\w+\s*,\s*)?\{[^}]*\bHead\b[^}]*\}\s+from\s+["']next\/document["']/;
  const m = src.match(imp);
  if (!m) return { reason: module === "next/head" ? "The homepage doesn't use next/head — add a <Head> to pages/index first." : "pages/_document doesn't import Head from next/document." };
  const name = module === "next/head" ? m[1] : "Head";
  const opens = findAllInCode(src, mask, new RegExp(`<${name}(?:\\s[^>]*)?>`));
  const closes = findAllInCode(src, mask, new RegExp(`</${name}\\s*>`));
  if (opens.length !== 1 || closes.length !== 1) return { reason: `Expected exactly one <${name}> block, found ${opens.length}.` };
  if (opens[0][0].endsWith("/>")) return { reason: `<${name} /> has no children to add to.` };
  const innerStart = opens[0].index + opens[0][0].length;
  const innerEnd = closes[0].index;
  if (innerEnd < innerStart) return { reason: "Malformed <Head> block." };
  const closeLineStart = src.lastIndexOf("\n", innerEnd) + 1;
  const closeIndent = /^[ \t]*$/.test(src.slice(closeLineStart, innerEnd)) ? src.slice(closeLineStart, innerEnd) : "";
  const firstChild = src.slice(innerStart, innerEnd).match(/\n([ \t]+)\S/);
  return { innerStart, innerEnd, childIndent: firstChild?.[1] ?? closeIndent + "  ", closeIndent };
}

/** Insert JSX lines as the last children of the <Head> block. */
export function jsxHeadInsert(src: string, module: "next/head" | "next/document", lines: string[]): JsEdit {
  const head = findJsxHead(src, module);
  if ("reason" in head) return { ok: false, reason: head.reason };
  const before = src.slice(0, head.innerEnd).replace(/[ \t]*$/, "");
  const block = lines.map((l) => `${head.childIndent}${l}`).join("\n");
  const next = `${before}${before.endsWith("\n") ? "" : "\n"}${block}\n${head.closeIndent}${src.slice(head.innerEnd)}`;
  if (!balanced(next)) return { ok: false, reason: "Edit could not be verified (unbalanced code)." };
  return { ok: true, content: next };
}

export function jsxHeadText(src: string, module: "next/head" | "next/document"): string | null {
  const head = findJsxHead(src, module);
  return "reason" in head ? null : src.slice(head.innerStart, head.innerEnd);
}

/** Set the homepage <title> inside next/head: replace plain text, or add one. */
export function jsxSetTitle(src: string, title: string): JsEdit {
  const head = findJsxHead(src, "next/head");
  if ("reason" in head) return { ok: false, reason: head.reason };
  const inner = src.slice(head.innerStart, head.innerEnd);
  const titles = [...inner.matchAll(/<title>([\s\S]*?)<\/title>/g)];
  if (titles.length > 1) return { ok: false, reason: "More than one <title> in the homepage <Head>." };
  if (titles.length === 1) {
    const t = titles[0];
    if (/[{}<]/.test(t[1])) return { ok: false, reason: "The title is built from an expression — not rewriting it." };
    const at = head.innerStart + (t.index ?? 0);
    const next = `${src.slice(0, at)}<title>{${str(title)}}</title>${src.slice(at + t[0].length)}`;
    return balanced(next) ? { ok: true, content: next } : { ok: false, reason: "Edit could not be verified." };
  }
  return jsxHeadInsert(src, "next/head", [`<title>{${str(title)}}</title>`]);
}

/** `<meta name|property=…>` present in the block (literal attribute). */
export function jsxHasMeta(src: string, module: "next/head" | "next/document", attr: "name" | "property", key: string): boolean {
  const inner = jsxHeadText(src, module) ?? "";
  return new RegExp(`<meta\\s[^>]*${attr}=["'{]["']?${key.replace(/[.:]/g, "\\$&")}["']`, "i").test(inner);
}

/** Add lang to <Html> in pages/_document (only when absent). */
export function jsxSetHtmlLang(src: string, lang: string): JsEdit {
  const mask = codeMask(src);
  const tags = findAllInCode(src, mask, /<Html\b([^>]*)>/);
  if (tags.length !== 1) return { ok: false, reason: "pages/_document doesn't have exactly one <Html> element." };
  if (/\blang\s*=/.test(tags[0][1])) return { ok: false, reason: "<Html> already sets lang." };
  const at = tags[0].index + "<Html".length;
  const next = `${src.slice(0, at)} lang=${jsxAttr(lang)}${src.slice(at)}`;
  return balanced(next) ? { ok: true, content: next } : { ok: false, reason: "Edit could not be verified." };
}

export function jsxMeta(attr: "name" | "property", key: string, content: string): string {
  return `<meta ${attr}="${key}" content=${jsxAttr(content)} />`;
}

export function jsxJsonLd(payload: unknown): string {
  // JSON text is a valid JS object literal; stringified at render time.
  return `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(${JSON.stringify(payload)}) }} />`;
}

// ─── Object literals (Nuxt config) ───────────────────────────────────────

export interface ObjProp {
  key: string;
  segStart: number;
  segEnd: number;
  valueStart: number;
  valueEnd: number;
  kind: "string" | "object" | "array" | "other";
}

export interface ObjLit {
  open: number;
  close: number;
  props: ObjProp[];
  indent: string;
}

function matchBracket(src: string, mask: boolean[], open: number): number {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (!mask[k]) continue;
    if (src[k] === "[" || src[k] === "{" || src[k] === "(") depth++;
    else if (src[k] === "]" || src[k] === "}" || src[k] === ")") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/** Parse the object literal whose `{` is at `open`. Spreads and computed keys → reason. */
export function parseObjectAt(src: string, open: number): ObjLit | { reason: string } {
  const mask = codeMask(src);
  if (src[open] !== "{") return { reason: "Not an object literal." };
  const close = matchBrace(src, mask, open);
  if (close < 0) return { reason: "Unterminated object." };
  const props: ObjProp[] = [];
  let depth = 0;
  let segStart = open + 1;
  const flush = (end: number): string | null => {
    const raw = src.slice(segStart, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) return null;
    const s = segStart + lead;
    const e = s + text.length;
    if (text.startsWith("...")) return "The config spreads another object — not editing it.";
    const km = text.match(/^(?:([A-Za-z_$][\w$]*)|"([^"]+)"|'([^']+)')\s*:\s*/);
    if (!km) return /^[A-Za-z_$][\w$]*$/.test(text) ? null : "The config has a property this editor does not understand.";
    const vs = s + km[0].length;
    const value = src.slice(vs, e);
    const kind: ObjProp["kind"] = /^(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')$/.test(value) ? "string" : value.startsWith("{") ? "object" : value.startsWith("[") ? "array" : "other";
    props.push({ key: km[1] ?? km[2] ?? km[3], segStart: s, segEnd: e, valueStart: vs, valueEnd: e, kind });
    return null;
  };
  for (let k = open + 1; k < close; k++) {
    if (!mask[k]) continue;
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      const err = flush(k);
      if (err) return { reason: err };
      segStart = k + 1;
    }
  }
  const err = flush(close);
  if (err) return { reason: err };
  let indent = "  ";
  if (props.length) {
    const ls = src.lastIndexOf("\n", props[0].segStart) + 1;
    const ind = src.slice(ls, props[0].segStart);
    if (/^[ \t]*$/.test(ind)) indent = ind;
  } else {
    const ls = src.lastIndexOf("\n", open) + 1;
    indent = (src.slice(ls, open).match(/^[ \t]*/)?.[0] ?? "") + "  ";
  }
  return { open, close, props, indent };
}

function insertFirstProp(src: string, obj: ObjLit, code: string): string {
  if (obj.props.length === 0) {
    const ls = src.lastIndexOf("\n", obj.close) + 1;
    const closeIndent = /^[ \t]*$/.test(src.slice(ls, obj.close)) ? src.slice(ls, obj.close) : "";
    return `${src.slice(0, obj.open + 1)}\n${obj.indent}${code},\n${closeIndent}${src.slice(obj.close)}`;
  }
  return `${src.slice(0, obj.open + 1)}\n${obj.indent}${code},${src.slice(obj.open + 1)}`;
}

/** Append an element to the array literal at [open, close]. */
function appendToArray(src: string, open: number, close: number, element: string): string {
  const inner = src.slice(open + 1, close);
  const ls = src.lastIndexOf("\n", close) + 1;
  const closeIndent = /^[ \t]*$/.test(src.slice(ls, close)) ? src.slice(ls, close) : "";
  const itemIndent = inner.match(/\n([ \t]+)\S/)?.[1] ?? closeIndent + "  ";
  const trimmed = inner.replace(/\s+$/, "");
  if (!trimmed.trim()) return `${src.slice(0, open + 1)}\n${itemIndent}${element},\n${closeIndent}${src.slice(close)}`;
  const sep = trimmed.endsWith(",") ? "" : ",";
  return `${src.slice(0, open + 1)}${trimmed}${sep}\n${itemIndent}${element},\n${closeIndent}${src.slice(close)}`;
}

export interface NuxtHeadChange {
  title?: string;
  meta?: Array<{ attr: "name" | "property"; key: string; content: string }>;
  lang?: string;
  jsonLd?: unknown;
}

function nuxtConfigObject(src: string): ObjLit | { reason: string } {
  const mask = codeMask(src);
  const call = findAllInCode(src, mask, /defineNuxtConfig\s*\(\s*\{/);
  if (call.length !== 1) return { reason: "nuxt.config doesn't call defineNuxtConfig({ … }) exactly once." };
  return parseObjectAt(src, call[0].index + call[0][0].length - 1);
}

function objLiteral(change: NuxtHeadChange, indent: string): string {
  const parts: string[] = [];
  if (change.title) parts.push(`title: ${str(change.title)}`);
  if (change.lang) parts.push(`htmlAttrs: { lang: ${str(change.lang)} }`);
  if (change.meta?.length) parts.push(`meta: [${change.meta.map((m) => `{ ${m.attr}: ${str(m.key)}, content: ${str(m.content)} }`).join(", ")}]`);
  if (change.jsonLd) parts.push(`script: [{ type: "application/ld+json", innerHTML: ${str(JSON.stringify(change.jsonLd))} }]`);
  return `{\n${parts.map((p) => `${indent}  ${p},`).join("\n")}\n${indent}}`;
}

/**
 * Apply site-wide head defaults to nuxt.config's app.head. Only adds what is
 * missing (an existing title is replaced only when it's a plain string).
 */
export function nuxtHeadEdit(src: string, change: NuxtHeadChange): JsEdit & { applied?: string[] } {
  const cfg = nuxtConfigObject(src);
  if ("reason" in cfg) return { ok: false, reason: cfg.reason };
  const applied: string[] = [];
  const app = cfg.props.find((p) => p.key === "app");
  if (!app) {
    const next = insertFirstProp(src, cfg, `app: {\n${cfg.indent}  head: ${objLiteral(change, cfg.indent + "  ")},\n${cfg.indent}}`);
    if (!balanced(next)) return { ok: false, reason: "Edit could not be verified." };
    return { ok: true, content: next, applied: Object.keys(change).filter((k) => change[k as keyof NuxtHeadChange] !== undefined) };
  }
  if (app.kind !== "object") return { ok: false, reason: "`app` in nuxt.config is not a plain object." };
  const appObj = parseObjectAt(src, app.valueStart);
  if ("reason" in appObj) return { ok: false, reason: appObj.reason };
  const head = appObj.props.find((p) => p.key === "head");
  if (!head) {
    const next = insertFirstProp(src, appObj, `head: ${objLiteral(change, appObj.indent)}`);
    if (!balanced(next)) return { ok: false, reason: "Edit could not be verified." };
    return { ok: true, content: next, applied: Object.keys(change).filter((k) => change[k as keyof NuxtHeadChange] !== undefined) };
  }
  if (head.kind !== "object") return { ok: false, reason: "`app.head` in nuxt.config is not a plain object." };

  // Edit inside an existing head object, from the end of the file backwards
  // so earlier offsets stay valid: script, meta, htmlAttrs, then title.
  let next = src;
  const headObj = parseObjectAt(next, head.valueStart);
  if ("reason" in headObj) return { ok: false, reason: headObj.reason };
  const ops: Array<{ at: number; run: (s: string) => string | { reason: string } }> = [];
  const prop = (k: string) => headObj.props.find((p) => p.key === k);
  const toInsert: string[] = [];

  if (change.jsonLd) {
    const script = prop("script");
    const el = `{ type: "application/ld+json", innerHTML: ${str(JSON.stringify(change.jsonLd))} }`;
    if (script) {
      if (script.kind !== "array") return { ok: false, reason: "`app.head.script` is not a plain array." };
      if (/application\/ld\+json/.test(src.slice(script.valueStart, script.valueEnd))) return { ok: false, reason: "nuxt.config already adds structured data." };
      ops.push({ at: script.valueStart, run: (s) => appendToArray(s, script.valueStart, matchBracket(s, codeMask(s), script.valueStart), el) });
    } else toInsert.push(`script: [${el}]`);
    applied.push("jsonLd");
  }
  if (change.meta?.length) {
    const meta = prop("meta");
    if (meta) {
      if (meta.kind !== "array") return { ok: false, reason: "`app.head.meta` is not a plain array." };
      const existing = src.slice(meta.valueStart, meta.valueEnd);
      const missing = change.meta.filter((m) => !new RegExp(`["']${m.key.replace(/[.:]/g, "\\$&")}["']`).test(existing));
      if (missing.length) {
        ops.push({
          at: meta.valueStart,
          run: (s) => {
            let out = s;
            for (const m of missing) out = appendToArray(out, meta.valueStart, matchBracket(out, codeMask(out), meta.valueStart), `{ ${m.attr}: ${str(m.key)}, content: ${str(m.content)} }`);
            return out;
          },
        });
        applied.push("meta");
      }
    } else {
      toInsert.push(`meta: [${change.meta.map((m) => `{ ${m.attr}: ${str(m.key)}, content: ${str(m.content)} }`).join(", ")}]`);
      applied.push("meta");
    }
  }
  if (change.lang) {
    const attrs = prop("htmlAttrs");
    if (attrs) {
      if (attrs.kind !== "object") return { ok: false, reason: "`app.head.htmlAttrs` is not a plain object." };
      const ao = parseObjectAt(src, attrs.valueStart);
      if ("reason" in ao) return { ok: false, reason: ao.reason };
      if (!ao.props.some((p) => p.key === "lang")) {
        ops.push({ at: attrs.valueStart, run: (s) => {
          const o = parseObjectAt(s, attrs.valueStart);
          return "reason" in o ? o : (o.props.length ? `${s.slice(0, o.open + 1)} lang: ${str(change.lang!)},${s.slice(o.open + 1)}` : `${s.slice(0, o.open + 1)} lang: ${str(change.lang!)} ${s.slice(o.close)}`);
        } });
        applied.push("lang");
      }
    } else {
      toInsert.push(`htmlAttrs: { lang: ${str(change.lang)} }`);
      applied.push("lang");
    }
  }
  if (change.title) {
    const title = prop("title");
    if (title) {
      if (title.kind !== "string") return { ok: false, reason: "`app.head.title` is built from an expression — not rewriting it." };
      ops.push({ at: title.valueStart, run: (s) => `${s.slice(0, title.valueStart)}${str(change.title!)}${s.slice(title.valueEnd)}` });
    } else toInsert.push(`title: ${str(change.title)}`);
    applied.push("title");
  }
  ops.sort((a, b) => b.at - a.at);
  for (const op of ops) {
    const r = op.run(next);
    if (typeof r !== "string") return { ok: false, reason: r.reason };
    next = r;
  }
  if (toInsert.length) {
    const ho = parseObjectAt(next, head.valueStart);
    if ("reason" in ho) return { ok: false, reason: ho.reason };
    for (const code of toInsert.reverse()) next = insertFirstProp(next, parseObjectAt(next, head.valueStart) as ObjLit, code);
  }
  if (next === src) return { ok: false, reason: "nuxt.config already has these head settings." };
  if (!balanced(next)) return { ok: false, reason: "Edit could not be verified (unbalanced code)." };
  const again = nuxtConfigObject(next);
  if ("reason" in again) return { ok: false, reason: `Edit could not be verified: ${again.reason}` };
  return { ok: true, content: next, applied };
}

/** Current app.head values (to avoid overriding a description the site already sets). */
export function nuxtHeadHas(src: string, key: "title" | "description" | "lang" | "og"): boolean {
  const cfg = nuxtConfigObject(src);
  if ("reason" in cfg) return false;
  const app = cfg.props.find((p) => p.key === "app");
  if (!app || app.kind !== "object") return false;
  const body = src.slice(app.valueStart, app.valueEnd);
  if (key === "title") return /\btitle\s*:/.test(body) || /titleTemplate\s*:/.test(body);
  if (key === "description") return /["']description["']/.test(body);
  if (key === "lang") return /\blang\s*:/.test(body);
  return /["']og:/.test(body);
}
