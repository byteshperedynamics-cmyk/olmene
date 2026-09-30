# Olmene v2 — Implementation Brief for the Coding Agent

You are implementing Olmene's repositioning and product redesign. Olmene is moving from "marketing report generator" to **an autonomous growth engineer: it finds what is costing a company customers, opens the pull request that fixes it, measures what changed, and learns from every result.**

This brief is the single source of truth. Read all of it before writing code. When the brief and your instincts disagree, follow the brief. When the brief and the codebase disagree about a fact, trust the codebase and note the discrepancy in your phase report.

The visual reference is **`docs/design/olmene-blueprint.html`**. Open it in a browser. Every screen in this brief exists there as a working, animated mockup, and its `<style>` block contains the exact tokens and keyframes to port. Match its quality. Do not copy its example numbers into production.

---

## 0. How to work

### Read these first, in this order
1. `README.md`: stack, deploy pipeline, what syncs on push.
2. `docs/design/olmene-blueprint.html`: the target look, motion and copy.
3. `docs/architecture-audit.md`: backend, security gaps (G1–G14), the job-queue pattern.
4. `docs/integrations.md`: GitHub App flow, token handling, Cloudflare notes.
5. `src/app/globals.css`: current tokens, keyframes, `[data-reveal]` system.
6. `src/components/motion.tsx`: why marketing pages avoid framer-motion.
7. `src/i18n/provider.tsx`: the i18n conventions (`{var}`, `a|b` plurals, `[[em]]`, `{{strong}}`).
8. `src/lib/agent/` (all files) and `src/lib/agent/__tests__/`: the agent you will extend.
9. `src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/components/pricing-cards.tsx`, `src/app/app/agent/**`.

### Facts about this repo you must not rediscover the hard way
- **Every push to `main` deploys to production** (Cloudflare Workers Builds → olmene.com). **Never push to `main`.** Work on the branch `redesign/v2` (and sub-branches if useful), commit in small steps, and open a PR when a phase is done. The owner merges.
- **Every push to `main` also runs `supabase db push`.** Any file in `supabase/migrations/` is applied to the production database when the PR merges. Migrations must be additive and idempotent (`if not exists`, no drops, no destructive `alter`). Never edit a migration that is already applied. Migrations that need a human-supplied value go in `supabase/pending/` (see §1), not `supabase/migrations/`.
- **Edge functions are not deployed by the pipeline.** Their sources in `archive/fnsrc/` are stale. Do not change Supabase edge functions in this project unless a phase says so explicitly.
- `next.config.ts` has `typescript.ignoreBuildErrors: true`, so the build will not catch type errors. Run `npx tsc --noEmit` yourself. Record the baseline error count before you start. Your changes must not add a single new error.
- Stack: Next.js 16 (App Router, `trailingSlash: true`), React 19, Tailwind 4 (tokens in `globals.css` under `@theme inline`), shadcn/ui in `src/components/ui/`, next-themes with `attribute="class"` (dark = `.dark` on `<html>`), TanStack Query, Supabase JS, lucide-react, recharts, framer-motion 12.
- **framer-motion rule:** marketing pages (`/`, `/pricing/`, `/sample-report/`, `/login/`, `/open/`) must not import framer-motion. Use CSS keyframes plus the existing `Reveal`/IntersectionObserver primitives. framer-motion is allowed inside `/app/**`, where it is already used (`agent-console.tsx`, `app/report/page.tsx`).
- Feature flags: `AGENT_FEATURE_ENABLED` (Worker secret, server side) and `NEXT_PUBLIC_FEATURE_AGENT` (build time, `.env.production`). All agent UI must degrade cleanly when either is off.
- 15 languages, including **Arabic and Urdu (RTL)**. English is bundled; the others lazy-load from `src/i18n/dictionaries/*.json`. Key sets must stay identical across all 15 files.
- Plans and prices come from the Supabase `plans` table (`getPlans()` in `src/lib/data.ts`), with Polar as merchant of record. Checkout uses `polar_product_id`.

### Human gates: stop and ask the owner before any of these
| Gate | Why |
|---|---|
| Creating or changing Polar products or prices | Billing. The owner creates products in Polar and gives you the product IDs. |
| Creating a Google Cloud OAuth client for Search Console | Needs the owner's Google account and consent-screen verification. |
| Setting or rotating any secret (Worker or Supabase) | Secrets never go in git and are never typed by you. |
| Turning `AGENT_FEATURE_ENABLED` on in production | Production behavior change. |
| Publishing revenue (MRR) on the public `/open` page | Business decision. Build it behind a flag defaulting to off. |
| Deleting or deactivating plans that existing subscribers are on | Existing subscribers must keep working. |
| Anything that would push to `main` or deploy | The owner merges. |

When you hit a gate, finish everything around it, write down exactly what you need (for example "Polar product IDs for Fix monthly, Fix yearly, Team monthly, Team yearly, Single report €29"), and continue with the next task that doesn't depend on it.

### Pre-flight: confirm these known issues are fixed
The owner is fixing these in parallel. At the start, check each one. If it is still open and it's in code, fix it first in its own commit.
1. `rt.previewLabel` in all 15 dictionaries still says "marketwise · report preview". Change it to "olmene · report preview".
2. The site says "18 checks" in several places, but the architecture audit says the deployed checker runs 21. Find the true number. Then introduce a single `CHECK_COUNT` constant in `src/lib/config.ts` and interpolate it into every string via `{n}`. No dictionary may hardcode the count.
3. `src/app/sitemap.ts` emits `/legal/terms` and `/legal/privacy` without trailing slashes, so they 308-redirect. Add the slash.
4. The demo video (`/video/marketwise-demo.mp4`) was recorded before the rebrand. Hide the demo section behind a constant until it's re-recorded. Do not delete the files.
5. `scripts/i18n_validate.js` hardcodes `ROOT = "/home/z/my-project/src/i18n"`. Change it to `path.join(__dirname, "../src/i18n")`.
6. `scripts/audit_quick.sh` hardcodes `BASE="https://get.marketwiselabs.workers.dev"`. Make it `BASE="${BASE:-https://olmene.com}"` so it can run against `http://localhost:8787`.

---

## 1. Phases and order

Do the phases in order. Each ends with the verification in §9 and a phase report (§10).

| Phase | Scope | Depends on |
|---|---|---|
| **1. Foundation** | Design tokens, motion system, shared components (§3–4) | — |
| **2. Marketing surfaces** | Screen A (homepage), Screen E (pricing), copy deck (§2, §5A, §5E) | Phase 1. Pricing needs Polar IDs (gate) for the final plan rows |
| **3. Agent product** | Screen B (agent run + hub), framework fixers, branch rename, PR merge tracking (§5B, §6.1–6.3) | Phase 1 |
| **4. Connect + Measure** | Screen D (connect), Search Console integration, outcomes engine, Screen C (impact) (§5D, §5C, §6.4) | Phase 3. Google OAuth client (gate) |
| **5. Open metrics** | `/api/public/stats`, live proof strip, Screen F (`/open`) (§5F, §6.5) | Phases 3–4 for PR and outcome data |

**Positioning switch.** The new homepage promises that Olmene ships fixes. Framework fixers (Phase 3) are what make that true for most visitors, whose sites run on Next.js or Astro. Build Phase 2 on the branch, but tell the owner in the Phase 2 report that the homepage PR should merge together with, or after, Phase 3. The alternative is the owner doing fixes by hand for the first customers.

---

## 2. Positioning and copy (English source)

### Voice
- Plain, specific, confident. Short sentences. Talk from the user's side of the screen.
- Say what happens: "Opens a pull request", "You review and merge", "Measured over 14 days".
- Never overclaim. Every number shown to users is real, from the database, or clearly labeled as an example. Olmene's brand is evidence. Uncited claims damage it more than they would any other product.
- Avoid: "revolutionary", "AI-powered" as a headline, "unlock", "supercharge", "10x", exclamation marks, emoji, "not X, but Y" constructions, em-dash asides.
- Preferred words: fix, ship, pull request (PR), review, merge, measured, evidence, verified, readiness.

### Core copy (add these as i18n keys, then translate)
| Placement | English |
|---|---|
| Hero eyebrow pill | `Agent live · {n} fixes shipped` (show only when n ≥ 50, otherwise `Agent live`) |
| Hero headline | `Your site is losing customers. Olmene [[ships the fix]].` |
| Hero subhead | `Paste your URL. Olmene finds what is costing you signups, then opens a pull request that fixes it. You review and merge.` |
| Hero CTA | `Scan my site` |
| Hero trust line | `Free · 30 seconds` · `No card` · `Nothing merges without you` |
| Loop section title | `Find it. Fix it. Prove it.` |
| Loop steps | `Scan`: Reads your live site and runs {n} deterministic checks. · `Fix`: Opens a pull request with the exact changes and why. · `Verify`: Re-checks your live site after you merge. · `Measure` (only once Phase 4 ships): Tracks search clicks before and after each fix. |
| Review showcase title | `Every change is yours to approve.` |
| Review showcase body | `Olmene works on its own branch, explains each edit, and never touches your main branch. Approve what you want, decline the rest.` |
| Can list | Read your live site and cite what it found · Open pull requests on one repository you choose · Re-check your site after every merge |
| Cannot list | Merge anything without your approval · Push to your main branch or delete branches · See repositories you did not choose |
| Comparison header | `Advice is cheap. Shipped fixes are not.` |
| Comparison rows | ChatGPT / Claude: "Gives ideas without seeing your site." · SEO tools: "Hand you a list of 200 issues to fix yourself." · Agencies: "Great work, weeks of calls, a retainer." · **Olmene**: "Finds the problem, ships the fix, shows the result." |
| Not-on-GitHub band | `Not on GitHub? Get the full cited report once.` CTA `See a sample report` |
| Final CTA | `See what is costing you customers.` Button `Scan my site` |
| Pricing title | `Pay for fixes, not reports.` |
| Pricing subtitle | `Every plan includes the free scan. Paid plans ship fixes as pull requests and re-check your site every week.` |

### i18n process
1. Add every new key to `en.json` first. Remove keys that are no longer used, from all 15 files.
2. Translate into the other 14 files. Keep placeholders, `[[ ]]`/`{{ }}` markers and `|` plural pairs identical to English.
3. Run `node scripts/i18n_validate.js`. It must pass for every language.
4. List the new keys in your phase report so the owner can have native speakers review them.

---

## 3. Design system: "the living instrument"

**Direction.** Keep the elm-green identity (five-petal flower, Newsreader wordmark) and push it toward precision equipment: warm dark surfaces, a faint measurement grid, mono readouts for anything numeric, and green light reserved for one meaning, which is the agent working or a result confirmed. The flower is the agent's heartbeat. It breathes while Olmene works and stays still while it waits for the user.

### 3.1 Color tokens
Extend the existing token names in `globals.css`. Don't rename them, because shadcn components depend on them. Add the new tokens alongside and expose them in `@theme inline` so Tailwind utilities exist (`bg-surface-2`, `border-line-strong`, `text-signal`, and so on).

| Role | Token | Light | Dark |
|---|---|---|---|
| Page ground | `--background` (existing) | `#FAF9F5` (keep) | **`#1C1D1B`** (deepen from `#262624`) |
| Surface / card | `--card` (existing) | `#FFFFFF` | `#242522` |
| Raised surface | `--surface-2` (new) | `#F2F0EA` | `#2C2D2A` |
| Text | `--foreground` (existing) | `#262624` | `#F5F4EF` |
| Muted text | `--muted-foreground` (existing) | `#6E6D6A` | `#A3A29C` |
| Faint text (axes, meta) | `--faint` (new) | `#9A9893` | `#6F6E69` |
| Hairline | `--border` (existing) | `rgba(38,38,36,.10)` | `rgba(245,244,239,.09)` |
| Strong hairline | `--line-strong` (new) | `rgba(38,38,36,.18)` | `rgba(245,244,239,.16)` |
| Brand / proof | `--primary` (existing) | `#256039` | `#69C27E` |
| Brand tint | `--leaf-soft` (new) | `rgba(37,96,57,.09)` | `rgba(105,194,126,.14)` |
| Glow | `--glow` (new) | `rgba(37,96,57,.20)` | `rgba(105,194,126,.38)` |
| Problem / severity | reuse the existing severity token if present, else `--signal-rust` | `#B5532A` | `#DE8354` |
| Event / example | `--signal-amber` (new) | `#946F12` | `#D9B45A` |
| Diff added | `--diff-add` (new) | `rgba(37,96,57,.08)` | `rgba(105,194,126,.12)` |
| Diff removed | `--diff-del` (new) | `rgba(181,83,42,.08)` | `rgba(222,131,84,.12)` |
| Grid line | `--grid-line` (new) | `rgba(38,38,36,.035)` | `rgba(245,244,239,.035)` |

**Color semantics. Enforce these strictly:**
- Green (`--primary`) means **agent activity or verified result** only: the live pill, success states, added diff lines, positive measured deltas, the main CTA.
- Rust means **a problem**: findings, removed lines, failures.
- Amber means **an event marker or example data**: PR-merged markers on charts, "example" badges.
- Everything else is neutral. No other hues.
- At most **one glowing element per viewport**.

Check contrast after deepening the dark ground: body text ≥ 4.5:1, muted text on `--card` ≥ 4.5:1, large display text ≥ 3:1. `scripts/contrast_calc.py` exists; use it and include the results in your report.

### 3.2 Typography
Fonts are already loaded in `src/app/layout.tsx`: Newsreader (display), Inter (UI), JetBrains Mono (readouts).

| Style | Font | Size desktop / mobile | Weight | Notes |
|---|---|---|---|---|
| Display XL (hero) | Newsreader | 68 / 40px, line-height 1.02 | 500 | `text-wrap: balance`, letter-spacing −0.01em, italic leaf accent via `[[ ]]` |
| Display L (section) | Newsreader | 40 / 28px, lh 1.1 | 500 | |
| Display M (card title) | Newsreader | 22 / 20px, lh 1.2 | 500 | |
| Big number | Newsreader | 44–28px | 500 | `tabular-nums` |
| Body L | Inter | 17px, lh 1.6 | 400 | max 64ch |
| Body | Inter | 15px, lh 1.6 | 400 | |
| UI small | Inter | 13–12.5px | 500 | |
| Eyebrow / label | JetBrains Mono | 11px, uppercase, letter-spacing .14em | 500 | color `--primary` |
| Readout / meta | JetBrains Mono | 12–10.5px | 400 | branch names, timings, PR numbers, axis labels |

Headlines use `font-weight: 500`, not bold. The current site uses `font-bold` on display text; switch to medium for the premium look.

### 3.3 Layout, spacing, surfaces
- 8px spacing grid. Section padding 96px desktop / 64px mobile. Container `max-w-6xl` (1152px), gutters 24px desktop / 16px mobile.
- **Instrument grid background** on marketing pages and the app shell: two 1px linear-gradients at `--grid-line`, 56px cell (see `body` in the blueprint). On the homepage hero, add a soft radial `--leaf-soft` wash behind the visual.
- Radius: 14px cards, 12px panels, 10px buttons and inputs, 999px pills.
- Borders are hairlines (1px `--border`). Use `--line-strong` for interactive or elevated edges.
- Shadows only for elevation that means something: the hero visual, the device-like product showcase, popovers. Use `0 30px 80px -30px rgba(0,0,0,.45)`. No shadow on regular cards.
- Card styling by role. Not everything is a card. Sections are separated by hairlines and spacing, not boxes.

### 3.4 Motion system
Add these to `@theme inline` and use them everywhere:
```css
--ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1);
--dur-hover: 160ms;     /* hover, press */
--dur-state: 280ms;     /* toggles, tabs, accordions */
--dur-enter: 600ms;     /* entrances, reveals */
--dur-ambient: 3.2s;    /* breathing, loops */
```
Rules:
1. **One signature motion per screen** (listed per screen in §5). Everything else is still or ambient, with at most two ambient elements per viewport.
2. Animate only `transform` and `opacity` (plus SVG `stroke-dashoffset` and a registered `@property` angle for the glow border). No layout-affecting animation, no animating `top`, `height` or `width` (use `scaleY`/`scaleX` with `transform-origin`).
3. Content is complete at rest. Nothing is ever left at `opacity: 0` waiting for JavaScript or scrolling. SSR renders final values; count-ups animate from a visible state or run only when in view.
4. `prefers-reduced-motion: reduce` turns off every loop and entrance and shows final states. The blanket rule in the blueprint is acceptable, but also check each component individually.
5. No bounce or overshoot springs, no scroll-jacking, no parallax, no confetti. Replace the existing `confetti.tsx` usage with a single flower bloom (petals scale from 0.86 to 1 over 600ms).
6. Micro-interactions: buttons get `transition: transform var(--dur-hover), background-color var(--dur-hover)`, press `scale(.98)`, and a focus ring of 2px `--primary` with 2px offset.
7. Loops pause when off-screen. Toggle a `data-inview` attribute via IntersectionObserver and gate `animation-play-state`, to protect battery and CPU on long pages.

**Keyframes to port** from the blueprint `<style>` into `globals.css` (rename with an `o-` prefix to avoid collisions): `breathe`, `bloom` (per-petal, staggered by −0.64s), `sheen`, `pdot` (pulse dot), `beam` (scan), `pinpop`, `toast`, `sweep` (diff line highlight), `draw` (SVG line), `ring` (end-point pulse), `flow` (dashed wire), `spin` with `@property --ang` (glow border), `rise` (bars), `ringfill`, `feed` (ticker), `blink` (caret), `grow` (confidence bar). The existing `logo-breathe`, `petal-bloom` and `text-shimmer` keyframes stay. Reuse them where they match.

### 3.5 Quality bar: what "stunning, futuristic, premium, professional" means here
Do all of these:
- Precision details: hairline borders, tabular numbers, mono readouts, exact alignment of repeated elements (same padding, same baselines, same icon positions across sibling cards).
- Every number set in Newsreader (big) or JetBrains Mono (small), never in Inter.
- Designed loading states: skeletons in brand tones with a slow shimmer, and the breathing flower for agent waits. No generic spinners.
- Designed empty and error states, each with one clear next action and plain-language copy that says what happened and how to fix it.
- Real product UI as the marketing visual (the scan preview, the diff), not illustrations.
- Dark mode is the showcase, but light mode gets equal care. Check every screen in both.

Never do any of these:
- Purple or blue gradients, gradient text, glassmorphism on everything, neon, generic "AI" sparkle icons, emoji, stock illustrations, lorem ipsum.
- More than one glow per viewport, pulsing everything, animations that loop fast (anything ambient should cycle at 3s or slower).
- Hardcoded or invented metrics shown as real.
- Centering everything. Use left-aligned editorial layouts, with centering only for the pricing header and the final CTA.

---

## 4. Shared components (Phase 1)

Create these in `src/components/v2/`. Each must support both themes, RTL, reduced motion, and render meaningfully without JavaScript where it appears on marketing pages. Write them as server components unless they need state.

| Component | Purpose | Notes |
|---|---|---|
| `InstrumentGrid` | Background grid plus optional radial wash | Pure CSS. Props: `wash?: "hero" \| "none"` |
| `Flower` | One flower component with `variant: "static" \| "breathe" \| "bloom"` | Consolidate `brand-mark.tsx` and `animated-flower.tsx`. Keep `PETAL_D`. `aria-hidden` |
| `LivePill` | Pill with pulsing dot and label | `tone: "live" \| "neutral" \| "problem" \| "example"` |
| `Button` variants | Add `sheen` and `ghost` variants to `ui/button.tsx` via cva | Sheen: one diagonal highlight sweep every 3.2s, only on the primary CTA per view |
| `GlowBorder` | Conic-gradient light travelling around a border | `@property --ang`. Static border fallback where unsupported |
| `Eyebrow` | Mono uppercase label | |
| `CountUp` | Animates to a value when in view | SSR renders the final value; animates only on first intersection; `tabular-nums`; locale formatting via `Intl.NumberFormat(lang)` |
| `Typewriter` | Cycles sample domains in the URL field placeholder | Must not interfere with user input: stops the moment the field is focused or has a value. Starts after `requestIdleCallback`. Reduced motion shows static placeholder text |
| `ScanPreview` | Hero visual: site wireframe, scan beam, issue pins, "PR opened" toast | Pure CSS animation, no JS. Pins use the real top-3 finding types from `SEVERITY_KEYS`/check labels (translated). The toast text is an example; label it visually as a preview |
| `StepRail` | Vertical step timeline (done / now / pending / failed) | Used in Screen B and the analysis console. `aria-current="step"` on the active step |
| `DiffView` | Unified diff with line numbers, add/del tints, per-file tabs | Wraps the existing diff output (`src/lib/agent/diff.ts`). Sweep highlight plays once on mount, staggered 60ms per added line, capped at 1.2s total. Horizontal scroll inside the component only |
| `KpiTile` | Label, big number, delta | Delta colored green only when it is a verified positive change |
| `ImpactChart` | SVG line + area chart with event markers | Hand-rolled SVG (not recharts) for full control of the draw animation. One linear scale for x and y; tick labels only at values the axis reaches; marker labels never overlap (collision-nudge). Axis text uses `--faint`, markers use `--signal-amber` |
| `ConfidenceBar` | Small horizontal bar with low / medium / high | Text label alongside, never color alone |
| `ConnectDiagram` | SVG nodes and wires with flowing dashes | Wire states: connected (green flow 1.4s), pending (faint, 3s), off (static) |
| `MetricBars` | Weekly bar chart | `scaleY` rise, staggered 70ms |
| `MergeRing` | Circular progress | `stroke-dashoffset` fill once |
| `FixFeed` | Vertically scrolling ticker of recent merged fixes | Duplicated list for a seamless loop. Pauses on hover and focus. `aria-live="off"`, with a static list for screen readers |

Add a hidden dev-only route `/app/dev/components/` (behind `process.env.NODE_ENV !== "production"`) that renders every component in every state, so you and the owner can review them in isolation.

---

## 5. Screens

For every screen: build desktop (1440) and mobile (390) layouts, both themes, RTL, all states listed, and the signature motion. The blueprint shows each screen; the specs below add the production details.

### Screen A: Homepage (`src/app/page.tsx`), redesign
**Goal:** a visitor understands within five seconds that Olmene finds problems and ships the fix, then starts a free scan.

**New section order.** Split `page.tsx` (719 lines today) into section components under `src/components/v2/home/`.
1. **Hero.** Two columns on desktop (copy 1.05fr, visual 1fr), stacked on mobile with the visual below the form. Left: `LivePill` (real count from `/api/public/stats` once Phase 5 exists; until then plain "Agent live" shown only if the agent flag is on, otherwise hide the pill), headline, subhead, the **existing `FreeAuditForm`**, restyled: inline URL field plus `Scan my site` sheen button in a container with a 4px `--leaf-soft` focus halo. **Keep its logic and API calls exactly as they are.** Trust line below. Right: `ScanPreview`. Background: `InstrumentGrid wash="hero"`.
   - Signature motion: the scan beam sweeps (4s loop, `--ease-out-expo`), pins lift as it passes (staggered 0.3s / 1.0s / 1.7s), the "PR opened" toast settles.
   - LCP: the headline must be the LCP element and server-rendered in English. The visual must not delay it.
2. **Proof strip.** Four live numbers: free scans run, fixes shipped, PR merge rate, languages. Read from `/api/public/stats` with the current hardcoded `STATS` as build-time fallback. `CountUp` in view. Hide "fixes shipped" and "merge rate" until they're meaningful (≥ 20 PRs).
3. **Loop.** "Find it. Fix it. Prove it." Three columns (four once Measure ships), each with a small live mini-visual: a check list ticking, a two-line diff, a before/after readiness number. Connect them with a hairline that a small green dot travels along (the only motion in this section).
4. **Review showcase.** A real `DiffView` + `StepRail` rendered with a fixed sample job (from a fixture file, clearly an example, mark it with an "example" badge), inside an elevated product frame. Copy on the left: "Every change is yours to approve."
5. **Teardown #001.** Keep the existing section; it is real proof. Restyle with the new tokens. Add an index placeholder for future teardowns (`/teardowns/` can come later; don't build it now).
6. **Can / cannot.** Keep the concept, update the copy per §2.
7. **Comparison.** Update per §2. Olmene's column uses `GlowBorder`.
8. **Pricing teaser.** Three compact tiers linking to `/pricing/`.
9. **Not-on-GitHub band.** Links to `/sample-report/`.
10. **FAQ.** Add: "Does Olmene need access to my code?", "Can it break my site?", "What if my site isn't on GitHub?", "Which frameworks are supported?" (answer truthfully according to what Phase 3 actually ships), "What happens after I merge?".
11. **Final CTA.** Centered, Display L, with the free scan form again.

**Remove or merge:** "What's inside a report", "Report teaser", "Example diagnosis", "Why trust", "Retention" and the demo video (hidden per pre-flight). Their essential points move into the Loop, FAQ and not-on-GitHub band. Delete the unused i18n keys.

**Acceptance:** Lighthouse mobile performance does not drop more than 3 points from the baseline, LCP ≤ 2.5s, CLS < 0.05. No framer-motion import. Hero works without JavaScript (form posts or shows a clear message). All 15 languages render without overflow at 390px. German and Russian are the longest, Arabic and Urdu are RTL.

### Screen E: Pricing (`src/app/pricing/page.tsx`, `src/components/pricing-cards.tsx`, `pricing-content.tsx`), redesign
**Goal:** price the outcome (fixes shipped, results measured), not the report count.

**Tiers:**
| Plan | Monthly | Yearly (−20%) | Includes |
|---|---|---|---|
| Free | €0 | — | Instant scan, {n} checks, top 3 problems |
| **Fix** (highlight) | €49 | €39/mo billed yearly | Weekly monitoring, up to 10 fix PRs/month, impact dashboard, AI-search readiness |
| Team | €149 | €119/mo billed yearly | Up to 5 sites, 30 fix PRs/month, A/B tests as PRs (label "coming soon" until built), priority support |
| Single report | €29 once | — | Full cited report, no subscription (shown as a band under the tiers) |

**Data model (migration goes in `supabase/pending/` until the Polar IDs arrive):**
- Add to `plans`: `slug text unique`, `billing_interval text check (billing_interval in ('month','year','once'))`, `monthly_equivalent_eur numeric`, `sites_limit int`, `features_key text` (i18n key prefix, for example `plan.fix.features`). Add these columns in an additive migration that **can** go in `supabase/migrations/` now, because it needs no human values.
- Insert the new plan rows in a **separate** pending migration with `-- TODO(owner): polar_product_id` placeholders.
- Existing Starter and Pro rows: set `active = false` only in the pending migration, and only after the owner confirms. Existing subscribers stay mapped (the webhook uses `polar_product_id`). Tell the owner in the report.
- `actions_per_period` already exists: Fix = 10, Team = 30.
- The yearly toggle renders only if yearly rows exist and are active. Otherwise hide it entirely.

**Layout:** header (Pricing title, subtitle), billing segmented control, three tier cards (Fix in the middle with `GlowBorder` and a "Most founders pick this" pill), single-report band, then the existing reassurance list and FAQ. Prices set in Newsreader 34px with `tabular-nums`. Price swaps on toggle with a 280ms crossfade (opacity plus 4px translateY).

**Signature motion:** the light travelling around the Fix card border (6s loop).

**States:** loading (skeleton cards with fixed height, so no layout shift), plans fetch failed (static fallback prices from a constant, with a small "Prices may be out of date" note), logged in with an active plan ("Current plan" badge, button becomes "Manage billing" → existing portal flow).

### Screen B: Agent run (`src/app/app/agent/job/[id]/page.tsx`) and hub (`src/app/app/agent/page.tsx`), redesign
**Goal:** reviewing the agent's changes feels like control, not risk.

**Job page layout:** grid `[240px rail | 1fr main]`, collapsing to a single column on mobile with the rail as a horizontal step scroller.
- **Rail header:** breathing `Flower` (breathes only while the job state is active; static when waiting on the user or done), a status line (`aria-live="polite"`) such as "Olmene is working" / "Waiting for your review" / "Pull request opened", plus the mono repo name and base branch.
- **StepRail** mapped from the runner state machine in `src/lib/agent/runner.ts`: `queued` → "Queued"; `planning` → "Scan and plan"; `previewing` → "Draft changes"; `awaiting_approval` → "Your review"; `applying` → "Open pull request"; `verifying` → "Verify live"; `completed` → "Done". Add "Measure" after Phase 4. Show elapsed time per step in mono.
- **Main:** file tabs, then `DiffView`. Under the diff, the change list: one row per planned action with checkbox (existing per-action selection), human explanation, an impact pill (high = rust tint, medium = neutral), and an expandable "Why and how to undo" (from `revertSteps` and `evidence`). Skipped actions are listed separately with their skip reasons in muted text. This honesty is a feature.
- **Sticky approve bar** (bottom of main, sticky on scroll): left, "Opens a PR on `olmene/fix-…`. Nothing merges without you."; right, `Decline all` (ghost) and `Approve N changes` (sheen). N updates live with the selection.
- **Completed state:** PR card with number, title, link to GitHub, files changed, and the receipt link. A flower bloom plays once. Remove confetti.
- **Error states:** agent disabled, quota exhausted (402 codes → upgrade CTA to Fix/Team), kill switch active, verify failed. Each has plain copy and one next action.
- **Signature motion:** added diff lines light up in sequence on first render.

**Hub page:** connection card (GitHub status, repo, `Disconnect`), "New fix run" form, and a jobs table (status pill, repo, changes, PR link, date). Use the same tokens and components.

### Screen D: Connect flow (`src/app/app/connect/page.tsx`), new
**Goal:** turn the scary step (installing a GitHub app) into the most reassuring one.

- Three-step stepper: **1. Your site** (done if the user has a completed scan or report; otherwise an inline scan form) → **2. GitHub** (reuses `connectGithub()`, `fetchGithubInstallations()`, `linkGithubInstallation()` and the existing `/app/agent/install` picker) → **3. Search Console** (optional; hidden until Phase 4 is built).
- Left: `ConnectDiagram` with the flower in the center and nodes for Site, GitHub and Search Console. Right: the current step's content.
- Permission list, phrased as what the user will see happen (never as OAuth scopes). Use ✓ rows for what Olmene does and ✕ rows for what it can never do (per §2 can/cannot copy).
- After GitHub connects: offer "Start my first fix run" (→ hub with the report preselected).
- Track funnel events with the existing `src/lib/track.ts`: `connect_step_viewed`, `github_connected`, `gsc_connected`, `connect_abandoned`.
- **Signature motion:** data flows along connected wires into the flower. Pending wires flow slowly in faint grey.
- Route `/app/agent` CTAs "Connect GitHub" here.

### Screen C: Impact dashboard (`src/app/app/impact/page.tsx`), new (Phase 4)
**Goal:** show customers why they pay, and build the outcome dataset investors care about.

- **KPI row** (4 `KpiTile`s): search clicks per day (7-day average) with change since the first merged PR; readiness score now vs at first scan; AI-search readiness (checks passed); PRs merged vs opened.
- **ImpactChart:** daily clicks for the last 60 or 90 days (toggle), area fill, and an amber dashed marker at each merge labelled "PR #n". The line draws left to right (2.4s, once) and the latest point pulses.
- **Outcomes table:** merged fix, merge date, measured change, `ConfidenceBar`, status. Status is "Early signal" when fewer than 14 days of post-merge data exist, "Measured" after that, and "Combined effect" when merges fall within 7 days of each other (never split credit you cannot separate).
- **Empty states:** no Search Console connected (CTA to connect, with a sample chart clearly marked "example"); connected but no merges yet ("Merge your first fix to start measuring"); fewer than 14 days of data (show the chart, and "Early signal" on outcomes).
- **Honesty rules:** always show confidence next to a claimed change. Never show a percentage without the absolute numbers on hover or tap. Use the wording "measured change", never "caused" or "generated".

### Screen F: Open metrics page (`src/app/open/page.tsx`), new (Phase 5)
**Goal:** public numbers that give build-in-public posts a source and give investors data before they ask.

- **MRR card:** big number with `CountUp`, a week-over-week growth pill, `MetricBars` for weekly MRR over 12 weeks with y-axis labels. **Hidden unless `PUBLIC_METRICS_SHOW_MRR=true`** (a human gate; default off). When hidden, show the cards below full width.
- `MergeRing`: percentage of opened PRs merged by founders.
- Totals: free scans, fixes shipped, sites monitored, measured outcomes.
- `FixFeed`: recent merged fixes as "Meta description · a SaaS homepage · 9m ago". Show a customer's domain only if they opted in (`connections.public_feed_opt_in`, default false).
- A footer line saying when the numbers were last refreshed and what counts as a merged fix.
- Server-rendered from `/api/public/stats` with ISR-style caching (`revalidate = 300`). Add the page to `sitemap.ts`.

---

## 6. Backend work

### 6.1 Branch prefix rename
Change `marketwise/fix-` to `olmene/fix-` in `src/lib/agent/runner.ts` (both places) and `src/lib/agent/allowlist.ts`, and update the tests. In the validator, **still accept `marketwise/fix-` for jobs created before the change** (compare `agent_jobs.created_at` with the release, or accept both prefixes for idempotent replay), so existing jobs don't break. Update the copy on the job page.

### 6.2 Framework fixers (the most important backend task)
Today `detectRepo` in `src/lib/agent/htmlfile.ts` marks any repo with `package.json` or a framework config as `framework` and skips it. Most target customers run Next.js or Astro. Add, in this order:

1. **Next.js App Router metadata** (`app/layout.{tsx,ts,jsx,js}` or `src/app/layout.*`). Parse with the TypeScript compiler API (`ts.createSourceFile`, already in `node_modules`). Find `export const metadata = { … }` as a plain object literal. Add or replace `title`, `description`, `alternates.canonical` and `openGraph` using exact text-range edits that preserve formatting. **Skip** (with a clear reason) when metadata comes from `generateMetadata`, is imported, uses spreads, or isn't a literal.
2. **Next.js metadata routes:** create `app/robots.ts` and `app/sitemap.ts` only when they don't exist and `public/robots.txt` / `public/sitemap.xml` don't either.
3. **Next.js JSON-LD:** add a small `components/olmene-jsonld.tsx` (Organization + WebSite, content drafted by the LLM, structure fixed) and import it in the root layout's `<body>`. This is a two-file edit; compose it with the existing sequential-edit logic.
4. **JSX image alt text:** `<img>` and `next/image` `<Image>` elements with no `alt` → add `alt` from the LLM copy draft. AST-based. Skip dynamic `src` expressions where the image content is unknown.
5. **Astro:** layouts in `src/layouts/*.astro` and pages in `src/pages/*.astro`. Apply the existing `htmlfile.ts` edits to the template part after the `---` frontmatter fence.

**Allowlist changes** (`src/lib/agent/allowlist.ts`): allow `.tsx .ts .jsx .js .astro` **only** at these path patterns: `app/layout.*`, `src/app/layout.*`, `app/robots.ts`, `app/sitemap.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`, `components/olmene-jsonld.tsx`, `src/components/olmene-jsonld.tsx`, `src/layouts/*.astro`, `src/pages/*.astro`, plus JSX files the image-alt fixer touches **only when the edit is limited to adding `alt` attributes** (validate by diffing: the only changes must be inserted `alt="…"` attributes). Keep forbidding `next.config.*`, `package.json`, lockfiles, `.github/`, `.env*` and anything outside the repo root. Keep GET/POST-only HTTP and the default-branch refusal.

**Tests** (in `src/lib/agent/__tests__/`): fixture repos for a Next.js App Router site (literal metadata, `generateMetadata`, spread metadata), an Astro site, and a mixed repo. Extend the fake-GitHub E2E to open a PR against the Next.js fixture. Assert that skips happen with reasons, formatting is preserved byte-for-byte outside edited ranges, and no forbidden path is ever written. All existing 58 tests must still pass.

Update `detectRepo` so `framework` becomes `nextjs-app`, `astro` or `unsupported-framework`, and change the skip message to name what *is* supported.

### 6.3 PR merge tracking
Add columns (additive migration): on the table that stores the opened PR (check `agent_jobs` and `receipts`), add `pr_state text` (`open` / `merged` / `closed`), `merged_at timestamptz`, `last_polled_at timestamptz`. Poll `GET /repos/{owner}/{repo}/pulls/{number}` with the existing scoped client (GET is allowed) from a sync route (see §6.4 for the cron pattern). This feeds the merge rate, the impact markers and the Measure step.

### 6.4 Measure: Search Console integration and outcomes engine (Phase 4)
- **OAuth** (gate: the owner creates the Google OAuth client): scope `https://www.googleapis.com/auth/webmasters.readonly`. Routes: `/api/measure/connect/google/` (state nonce like the GitHub flow) and `/api/measure/google/callback/`. Store the refresh token **envelope-encrypted with the existing `src/lib/agent/crypto.ts`**, exactly like the GitHub secrets. Redact tokens using `src/lib/agent/redact.ts` (add Google token patterns and tests).
- **Tables** (additive migration, RLS on, select-own policies only, writes via service role, like the agent tables): `measure_connections` (user, provider, property URL, encrypted token ref, status), `gsc_daily` (connection, date, clicks, impressions, ctr, position; unique per connection and date), `fix_outcomes` (PR ref, merged_at, window days, before/after metrics, delta, confidence, status).
- **Sync:** follow the existing pattern (pg_cron → pg_net → HTTP with an `x-cron-secret` read from Supabase Vault). Point it at a new Worker route `POST /api/measure/sync/` that (a) polls PR states (§6.3), (b) pulls the last 3 days of Search Console data per connection (Search Console data lags about 2–3 days), and (c) recomputes outcomes. The cron secret is a human gate; ask the owner to add it to Vault and the Worker.
- **Attribution method** (document it on the impact page under "How we measure"): compare the 14 days before the merge with the 14 days after, excluding the merge day and matching weekdays. Delta = after mean − before mean. Confidence from a Welch t-test p-value: high < 0.05, medium < 0.2, low otherwise. Fewer than 14 post-merge days → "Early signal". Merges within 7 days of each other → one combined outcome.
- Add unit tests for the attribution math with synthetic series (flat, step up, weekly seasonality, overlapping merges).

### 6.5 Public stats (Phase 5)
- `GET /api/public/stats/`: returns aggregate counts only (free scans, reports, sources cited, PRs opened and merged, merge rate, sites monitored, measured outcomes), weekly MRR series (only when `PUBLIC_METRICS_SHOW_MRR=true`), and the anonymized feed. Header `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. It must never return a user ID, email or non-opted-in domain.
- **MRR** = sum over active subscriptions of the plan's `monthly_equivalent_eur`. Store a weekly snapshot in `metrics_weekly` via pg_cron so the history is real, not recomputed.
- Add `public_feed_opt_in boolean default false` to `connections`, with a toggle on the hub page.

---

## 7. Accessibility and internationalization requirements
- WCAG AA contrast in both themes (verify with `scripts/contrast_calc.py`).
- Visible focus on every interactive element; logical tab order; 44px minimum touch targets on mobile.
- `aria-live="polite"` for agent status changes; `aria-current="step"` on the active step; charts have `role="img"` and an `aria-label` summarizing the data, plus a visually hidden table for screen readers on the impact page.
- Decorative SVGs get `aria-hidden="true"`.
- **RTL:** use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-` in Tailwind). Mirror directional animations (the sheen, the loop-line dot, the feed) under `[dir="rtl"]`. Diffs and code stay LTR (`dir="ltr"` on `DiffView`).
- Numbers and dates are formatted with `Intl` using the active language.

---

## 8. Performance budget
- Measure a baseline before Phase 2 with `scripts/lighthouse_run.js` on `/`, `/pricing/` and `/app/agent/` (mobile and desktop) and save it in `docs/design/perf-baseline.json`.
- Homepage: mobile performance within 3 points of the baseline, LCP ≤ 2.5s, CLS < 0.05, total blocking time not more than 50ms above the baseline. Marketing JS bundle not more than 15KB (gzipped) above the baseline.
- No new font families or weights beyond those already loaded (add Newsreader 500 if missing; remove weights that are no longer used).
- Animations: transform, opacity and stroke only; `will-change` only on elements actively animating; loops paused off-screen.
- Images: WebP/AVIF, explicit width and height, `loading="lazy"` below the fold.

---

## 9. Verification (run at the end of every phase)
```bash
npm run lint
npm run test:agent
npx tsc --noEmit            # compare against the baseline count; zero new errors
node scripts/i18n_validate.js
npm run build:cf
npx wrangler dev            # local worker at http://localhost:8787
BASE=http://localhost:8787 bash scripts/audit_quick.sh
node scripts/lighthouse_run.js   # marketing phases
```
Visual QA matrix, with screenshots saved to `docs/design/qa/<phase>/`:
- Viewports 390×844, 768×1024, 1440×900.
- Light and dark theme.
- `prefers-reduced-motion` on and off (confirm loops stop and final states show).
- Languages: en, de (long strings), ar (RTL), ja (CJK line breaking).
- Agent flag on and off; logged out, free, and paid user.
- No horizontal page scroll at any width. Wide content scrolls only inside its own container.
- Compare each screen side by side with `docs/design/olmene-blueprint.html`. The production screen should look at least as polished.

---

## 10. Phase report format
At the end of each phase, write `docs/design/reports/phase-<n>.md` and tell the owner:
1. What shipped (files, routes, components), with screenshots from the QA matrix.
2. Verification results: lint, tests (count), tsc (baseline vs now), i18n validator, Lighthouse before/after.
3. Deviations from this brief and why.
4. New i18n keys that need native-speaker review.
5. **Human actions needed**, each with exact instructions (for example "Create Polar products: Fix monthly €49, Fix yearly €468, Team monthly €149, Team yearly €1,428, Single report €29, then paste the product IDs into `supabase/pending/2026xxxx_v2_plans.sql`").
6. The PR link for the phase branch.

Commit messages: imperative, scoped (`home: new hero with scan preview`, `agent: next.js metadata fixer`, `db: plans v2 columns`). One logical change per commit.
