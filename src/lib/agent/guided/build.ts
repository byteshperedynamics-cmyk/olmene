/**
 * Guided fixes (engine v2): the same fixes the agent ships as pull requests,
 * for sites that aren't in a GitHub repository (WordPress, Shopify, Wix,
 * Squarespace, Webflow, Framer… or code that isn't connected). Each card has
 * the exact values to paste, the clicks on that platform, and a live check
 * that confirms it worked. Pure: the API route supplies report, copy drafts,
 * platform and the live HTML.
 */

import type { ReportData } from "@/lib/report-types";
import { FIXERS, FIXER_ORDER, buildLlmsTxt, guessLanguage, localBusinessJsonLd, type CopyDrafts } from "../fixers";
import { escapeHtmlAttr, findImagesWithoutAlt, normalizeSiteUrl } from "../htmlfile";
import { type Playbook } from "./playbooks";
import type { AutoState } from "../channels/types";

export interface GuidedValue {
  label: string;
  value: string;
  /** text: paste into a field; code: paste into a code box; file: save as a file. */
  kind: "text" | "code" | "file";
  /** Current value on the live site, when there is one (for before → after). */
  current?: string | null;
  filename?: string;
  /** What the value belongs to (image-alt: the image src). */
  key?: string;
}

export interface GuidedFix {
  id: string;
  title: string;
  why: string;
  values: GuidedValue[];
  steps: string[];
  /** Shown instead of steps when the platform can't do it. */
  blocked?: string;
  status: "todo" | "live" | "not_live" | "blocked";
  /** Last live check detail. */
  checkDetail?: string | null;
  /** Set when a connected platform (Webflow, WordPress) can apply this fix after approval. */
  auto?: AutoState;
}

export interface GuidedRun {
  platform: { id: string; label: string; notes?: string };
  fixes: GuidedFix[];
  checkedOn: string;
}

/** Fixers that make sense as guided steps (all of them except repo-only plumbing). */
const GUIDED_ORDER = { ...FIXER_ORDER };

function liveTitle(html: string): string | null {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}
function liveMeta(html: string, name: string): string | null {
  const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find((t) => new RegExp(`(?:name|property)=["']${name}["']`, "i").test(t));
  return tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || null;
}
function liveH1(html: string): string | null {
  return html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function headCodeFix(pb: Playbook, base: Omit<GuidedFix, "steps" | "status">): GuidedFix {
  if (!pb.headCode) return { ...base, steps: [], blocked: `${pb.label} doesn't allow custom code in the page <head>, so this can't be added there.`, status: "blocked" };
  return { ...base, steps: pb.headCode, status: "todo" };
}

export function buildGuidedFixes(input: {
  report: ReportData;
  copy: CopyDrafts;
  playbook: Playbook;
  liveHtml: string;
}): GuidedRun {
  const { report, copy, playbook: pb, liveHtml } = input;
  const site = normalizeSiteUrl(report.meta.siteUrl);
  const triggered = FIXERS.filter((f) => f.detect(report).triggered).sort((a, b) => (GUIDED_ORDER[a.id] ?? 999) - (GUIDED_ORDER[b.id] ?? 999));
  const fixes: GuidedFix[] = [];
  const evidence = (label: string) => report.audit.seo.checklist.find((c) => c.check === label)?.detail ?? "flagged by the scan";

  for (const f of triggered) {
    switch (f.id) {
      case "title-tag":
        if (!copy.title) break;
        fixes.push({ id: f.id, title: "Page title", why: `Your title: ${evidence("Title tag")}. It's the blue link people click in Google.`, values: [{ label: "Title", value: copy.title, kind: "text", current: liveTitle(liveHtml) }], steps: pb.seo, status: "todo" });
        break;
      case "meta-description":
        if (!copy.metaDescription) break;
        fixes.push({ id: f.id, title: "Meta description", why: `${evidence("Meta description")}. It's the text under your link in Google and the first pitch searchers read.`, values: [{ label: "Description", value: copy.metaDescription, kind: "text", current: liveMeta(liveHtml, "description") }], steps: pb.seo, status: "todo" });
        break;
      case "social-meta": {
        const title = copy.title ?? liveTitle(liveHtml) ?? report.product.name;
        const description = copy.metaDescription ?? liveMeta(liveHtml, "description") ?? report.product.oneLiner;
        const tags = [
          `<meta property="og:type" content="website">`,
          `<meta property="og:title" content="${escapeHtmlAttr(title)}">`,
          ...(description ? [`<meta property="og:description" content="${escapeHtmlAttr(description)}">`] : []),
          `<meta property="og:url" content="${site}/">`,
          `<meta name="twitter:card" content="summary_large_image">`,
        ].join("\n");
        fixes.push({
          id: f.id, title: "Link previews (Open Graph)", why: "Links to your site shared on LinkedIn, X, Slack or WhatsApp show no proper title, text or image.",
          values: [
            { label: "Social title", value: title, kind: "text" },
            ...(description ? [{ label: "Social description", value: description, kind: "text" as const }] : []),
            ...(pb.headCode ? [{ label: "Or paste these tags", value: tags, kind: "code" as const }] : []),
          ],
          steps: pb.social, status: "todo",
        });
        break;
      }
      case "json-ld-org": {
        const url = site;
        const ld = { "@context": "https://schema.org", "@type": "Organization", name: report.product.name, url: `${url}/`, ...(report.product.oneLiner ? { description: report.product.oneLiner } : {}) };
        fixes.push(headCodeFix(pb, { id: f.id, title: "Structured data (who you are)", why: "Google and AI assistants read structured data to know your business name, site and description.", values: [{ label: "Snippet", value: `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c")}\n</script>`, kind: "code" }] }));
        break;
      }
      case "local-business-schema": {
        if (!copy.localBusiness) break;
        const ld = localBusinessJsonLd(copy.localBusiness, report.meta.siteUrl, report.meta.category?.id === "restaurant");
        fixes.push(headCodeFix(pb, { id: f.id, title: "Local business details for Google", why: "Tells Google, Maps and AI assistants your address, phone and hours, taken word for word from your homepage.", values: [{ label: "Snippet", value: `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c")}\n</script>`, kind: "code" }] }));
        break;
      }
      case "app-banner": {
        const id = report.meta.appStoreId;
        if (!id) break;
        fixes.push(headCodeFix(pb, { id: f.id, title: "iPhone app banner", why: "Safari on iPhone shows an Open / Get banner for your app with this one tag.", values: [{ label: "Tag", value: `<meta name="apple-itunes-app" content="app-id=${id}">`, kind: "code" }] }));
        break;
      }
      case "image-alt": {
        const imgs = findImagesWithoutAlt(liveHtml).slice(0, 12);
        const alts = copy.altTexts ?? {};
        const values = imgs.filter((i) => i.src && alts[i.src]).map((i) => ({ label: i.src!.split("/").pop()?.split("?")[0] ?? i.src!, value: alts[i.src!], kind: "text" as const, key: i.src! }));
        if (!values.length) break;
        fixes.push({ id: f.id, title: "Image descriptions (alt text)", why: `${evidence("Image alt coverage")}. Screen readers and image search can't tell what these show.`, values, steps: pb.alt, status: "todo" });
        break;
      }
      case "lang-attribute": {
        const text = liveHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ");
        const code = guessLanguage(`${text} ${report.meta.pageExcerpt ?? ""}`);
        const names: Record<string, string> = { en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch" };
        fixes.push({ id: f.id, title: "Page language", why: "Your page doesn't say what language it's in: screen readers may read it with the wrong voice and search engines have to guess.", values: [{ label: "Language", value: code ? `${names[code] ?? code} (${code})` : "Your site's main language", kind: "text" }], steps: pb.lang, status: "todo" });
        break;
      }
      case "canonical-url":
        fixes.push({ id: f.id, title: "Canonical link", why: evidence("Canonical URL"), values: [{ label: "Your main address", value: `${site}/`, kind: "text" }], steps: [pb.canonical], status: "todo" });
        break;
      case "viewport-meta":
        fixes.push({ id: f.id, title: "Mobile viewport", why: evidence("Mobile viewport"), values: [{ label: "Tag (if your platform asks for it)", value: `<meta name="viewport" content="width=device-width, initial-scale=1">`, kind: "code" }], steps: [pb.viewport], status: "todo" });
        break;
      case "sitemap-robots":
        fixes.push({ id: f.id, title: "Sitemap and robots.txt", why: `robots.txt: ${evidence("/robots.txt")}; sitemap: ${evidence("/sitemap.xml")}.`, values: [], steps: [pb.sitemap], status: "todo" });
        break;
      case "llms-txt": {
        const file = buildLlmsTxt(report, report.meta.siteUrl);
        if (!pb.rootFiles) {
          fixes.push({ id: f.id, title: "llms.txt for AI assistants", why: "A short plain-text guide to your site that AI assistants can read.", values: [{ label: "llms.txt", value: file, kind: "file", filename: "llms.txt" }], steps: [], blocked: pb.notes?.includes("llms.txt") ? pb.notes : `${pb.label} doesn't host custom files at your domain root, so llms.txt can't be added there. It's optional.`, status: "blocked" });
        } else {
          fixes.push({ id: f.id, title: "llms.txt for AI assistants", why: "A short plain-text guide to your site that AI assistants can read.", values: [{ label: "llms.txt", value: file, kind: "file", filename: "llms.txt" }], steps: pb.rootFiles, status: "todo" });
        }
        break;
      }
      case "h1-rewrite":
        if (!copy.h1) break;
        fixes.push({ id: f.id, title: "Homepage headline", why: `${evidence("Single H1")}. The headline is the first thing every visitor reads.`, values: [{ label: "Headline", value: copy.h1, kind: "text", current: liveH1(liveHtml) }], steps: pb.text, status: "todo" });
        break;
      case "hero-copy": {
        const fields = (report.conversionDiff?.fields ?? []).filter((x) => (x.kind === "subheadline" || x.kind === "cta") && x.after?.trim() && x.before?.trim() !== x.after?.trim());
        if (!fields.length) break;
        fixes.push({ id: f.id, title: "Hero text and button", why: fields[0].rationale || "Clearer hero copy tells visitors what they get and what to do next.", values: fields.map((x) => ({ label: x.kind === "cta" ? "Button" : "Subheadline", value: x.after.trim(), kind: "text" as const, current: x.before.trim() })), steps: pb.text, status: "todo" });
        break;
      }
      case "pricing-link":
        fixes.push({ id: f.id, title: "Pricing link in the menu", why: evidence("Pricing page"), values: [{ label: "Menu label", value: "Pricing", kind: "text" }], steps: pb.nav, status: "todo" });
        break;
      default:
        break;
    }
  }
  return { platform: { id: pb.id, label: pb.label, ...(pb.notes ? { notes: pb.notes } : {}) }, fixes, checkedOn: "2026-10" };
}

/**
 * Synthetic "preview" for the live checker: it reads the expected value from
 * the added lines of a diff, so a guided value is written as one.
 */
export function livePreviewFor(fix: GuidedFix): Record<string, unknown> | null {
  const v = fix.values[0]?.value;
  if (!v) return null;
  const line = fix.id === "title-tag" ? `+<title>${v}</title>`
    : fix.id === "meta-description" ? `+<meta name="description" content="${v.replace(/"/g, "&quot;")}">`
      : fix.id === "h1-rewrite" ? `+<h1>${v}</h1>`
        : fix.id === "hero-copy" ? fix.values.map((x) => `+<p>${x.value}</p>`).join("\n")
          : null;
  return line ? { edits: [{ diff: line }] } : null;
}

/** The copy a run's cards carry (to plan automatic changes after connecting a platform). */
export function copyFromFixes(fixes: GuidedFix[]): CopyDrafts {
  const copy: CopyDrafts = {};
  for (const f of fixes) {
    if (f.id === "title-tag" && f.values[0]) copy.title = f.values[0].value;
    if (f.id === "meta-description" && f.values[0]) copy.metaDescription = f.values[0].value;
    if (f.id === "image-alt") copy.altTexts = Object.fromEntries(f.values.filter((v) => v.key).map((v) => [v.key!, v.value]));
  }
  return copy;
}
