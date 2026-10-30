# Olmene design spec: Obsidian, Silver & Steel

Chosen by the owner on 2026-10-13 (the "Monochrome & Motion Elevation" spec). This replaces the v2 "living instrument" direction (dark olive and leaf green). Implemented on branch `design/mono`.

## 1. Idea

Olmene is an engineering instrument that finds what costs a site customers and ships the fix as a pull request. The page looks like the tool: achromatic surfaces, engraved wells, lit edges, and colour only where the product produces data.

Mood: precise, quiet, inspectable. It must not become a dark SaaS template with neon accents.

## 2. Logo

- The flower mark and the "olmene" wordmark keep their exact shapes (olmene-brand).
- Colour: `--brand` and `--brand-ink` are pure white on dark and near-black on light. No colour on the mark.

## 3. Colour: the 5% semantic rule

Structure is 100% achromatic: canvas, grid, cards, navigation, the logo and the primary button.

Colour exists only as telemetry inside product artifacts (diffs, checks, scores, pins, timestamps):

| Token | Dark | Light | Means |
|---|---|---|---|
| `--tel-rose` | `#F43F5E` | `#E11D48` | deletions (−), failed checks, critical leaks |
| `--tel-amber` | `#F59E0B` | `#B45309` | warnings, medium impact, "example" labels |
| `--tel-emerald` | `#10B981` | `#047857` | insertions (+), passed checks, verified gains, the live-agent dot |
| `--tel-sky` | `#38BDF8` | `#0369A1` | branches, commit fingerprints, timestamps |

Colour never carries meaning alone: every coloured state also has a word, a sign (+/−) or an icon.

## 4. Surfaces (designed dark-first; the site follows the system setting)

| Level | Role | Dark value | Edge |
|---|---|---|---|
| 0 canvas | page | `#09090B` | grid lines `rgb(255 255 255 / 2.5%)`; a faint top-centre light cone (white, 4%) |
| 1 well | terminals, diff viewports, report data | `#050507` | engraved: inset top edge `rgb(255 255 255 / 5%)` |
| 2 artifact | product frames, workbench, teardown cards | `#111115` → `#141418` | sides and bottom `rgb(255 255 255 / 7%)`, a specular top edge `rgb(255 255 255 / 18%)`, shadow `0 24px 60px rgb(0 0 0 / 70%)` |
| 3 chip | pins, tabs, status capsules | `#18181D` | rim `rgb(255 255 255 / 14%)` |

Utilities: `.o-canvas`, `.o-well`, `.o-artifact`, `.o-chip`.

The light theme is a monochrome counterpart: canvas `#FAFAFA`, artifact white with a hairline border, well `#F4F4F5`, primary button near-black.

## 5. Type

- **Display:** Newsreader (already loaded; it is also the wordmark face), upright. The headline accent gets a metallic gradient (white → zinc-200 → zinc-400 on dark) instead of green italics.
- **UI and body:** Inter. Body copy is zinc-400 `#A1A1AA` on dark, capped at 64ch.
- **Telemetry:** JetBrains Mono with `tabular-nums` for every count, score, timestamp, file path and branch (`.o-readout`). No new font downloads.

## 6. Motion

- CSS and small hooks only on marketing pages (no framer-motion there, repo rule).
- Each artifact plays once when it scrolls into view, then rests in its final state.
- Loops are limited to the live-agent dot and the hero scan, and pause off-screen.
- Interactive demos (workbench, teardown switcher) respond within 100–300 ms and can be reset.
- `prefers-reduced-motion`: final states only, no travel, no counters.

Signature moments:

| Section | Moment |
|---|---|
| Hero | command bar with a travelling edge light on focus; the scan preview's score bridge 61 → 94, with pins wired to diff lines |
| Find, Fix, Prove | laser scan over a DOM tree; diff typewriter and branch pill; arc gauge 61 → 94 |
| Review workbench | file tabs; Approve opens the PR (simulated, marked Example) |
| Teardown #001 | Before/After switcher animates the dial and the line items |

## 7. Honesty rules kept from the brand

- Demo artifacts carry an "Example" label.
- Counters show real numbers. The server-rendered floors are the live values of 2026-10-13, and the counters are cumulative, so the floors never overstate.
- The teardown keeps its real numbers: it ran on the 18-check engine, and the switcher says so ("engine upgraded 18 → 21 checks").
- Prices come from the plan config, in euros.

## 8. Do-not-use

- green or olive tints;
- colour on structure (backgrounds, borders, illustrations);
- italic accent words;
- fade-up on every section;
- hover-lift on every card;
- invented customers or numbers;
- framer-motion on marketing pages.

## 9. Recorded exceptions (`design-ok`)

The owner's spec asks for these, overriding the generic do-not-use defaults in olmene-design-review:
- monospace for telemetry numbers and status capsules;
- pill-shaped status chips;
- gradient text on the headline accent only.

## 10. Apple HIG pass (2026-10-13)

The owner asked for a review against Apple's Human Interface Guidelines (the `apple-design` skill in `.agents/skills/`). The web gets the principles and the foundations (accessibility, colour, type, layout, writing), not Apple's platform conventions. What changed, with the guideline each comes from:

- **Light or dark follows the system** (`dark-mode.md › Best practices`: "Avoid offering an app-specific appearance setting"). The theme toggle is gone from both headers; next-themes uses `defaultTheme="system"` with a new storage key, so an old toggle choice doesn't pin anyone. The visual identity is still designed dark-first, and the light theme is its full counterpart. To force dark again for brand reasons, set `defaultTheme="dark"` in `providers.tsx`.
- **Text floor 11 px** (`typography.md › Ensuring legibility`, mobile minimum 11 pt). No `text-[9px]`…`text-[10.5px]` anywhere outside `/dev`.
- **Touch targets 44 px on touch screens** (`accessibility.md › Mobility`: 44×44 pt default, 28×28 pt minimum). `pointer-coarse:` raises every `Button` size to `h-11`/`size-11`; `.o-hit` grows the hit region of small chips and standalone links without changing how they look; footer links become 44 px rows. Mouse and trackpad keep the compact desktop sizes (28 pt default).
- **Increase Contrast** (`accessibility.md › Vision`, `liquid-glass.md` checklist 5): under `prefers-contrast: more`, borders, rims and edges get stronger and secondary text moves one step towards the foreground, in both appearances.
- **Reduce Transparency**: the floating layer (`.o-glass`: header pill, app header, language menu, cookie notice, sticky action bars) turns opaque under `prefers-reduced-transparency: reduce`. Blur stays on that layer only, never on content (`liquid-glass.md › Where the material belongs`).
- **One colour, one meaning** (`color.md › Best practices`): sky marks links, URLs, ids, branches and pull requests only, so decorative heading icons are neutral now.
- **Writing** (`writing.md › Best practices`: avoid "we"): the error pages say "Olmene logged the error".


## 11. Signature moment and the big-company pass (2026-10-14)

The owner asked for a site that looks professional, highly polished and big-company, with animation and 3D. Applied with the frontend-design skill (Anthropic, installed in `.claude/skills/frontend-design`) and olmene-motion:

- **Retired 2026-10-30 (see §13): the scene, its files and the `three` dependency are removed.** Kept here as history.
- **One signature moment: the 3D scan** (`src/components/v2/home/scan-scene.ts`, `scan-stage.tsx`). A glossy 3D slab of an example homepage floats over a fading floor grid; a light plane sweeps it, three problems light up where they occur, pull request #14 lands, each turns green and readiness climbs 61 → 94. The address bar shows whatever the visitor types into the scan box. Scrolling turns the page toward you; the pointer adds a little parallax.
  - Plain three.js (0.186.1, pinned), loaded with `import()` when the browser is idle after the headline paints; ~145 KB gzip, never blocks LCP. A CSS poster holds the space until then; without WebGL the 2D ScanPreview is shown.
  - The page is unlit (`toneMapped: false`) so white stays white and text stays sharp; a thin glass layer carries the reflections. Callouts, score and PR card are HTML, positioned by projecting the 3D pins each frame (crisp, translatable, `aria-hidden`); the stage itself is `role="img"` with a full description.
  - Rendering stops off screen and in hidden tabs; frames that run long drop the pixel ratio to 1. Reduced motion renders the finished state once, without the loop or parallax. A pause button covers motion longer than 5 s.
  - Exception recorded: marketing pages otherwise stay CSS-only for motion; three.js is allowed for this one scene because the owner asked for 3D.
- **Hero**: centred, the whole headline in brushed metal (no single accented phrase), scan box, then the stage. 
- **Works on** strip: the platforms the engine supports (Simple Icons marks, CC0), with one line on what each kind gets (pull requests vs guided fixes).
- **Template tells removed**: eyebrows are sentence case in the body face (`.o-eyebrow`), no tracked-out monospace capitals on marketing pages; monospace stays for numbers, code and URLs.
- **Rhythm**: sections 128 px apart on desktop, headings 52 px.
- **Teardown**: the raw scan screenshot and report quotes sit behind "See the raw scan result…" (progressive disclosure); the pre-redesign capture shows in greyscale until it is retaken.
- **Brand film** (2026-10-15, owner's 20 s `olmene-obsidian.mp4`): "Watch Olmene work." between the stats strip and How it works (`src/components/v2/home/film.tsx`). Re-encoded to 1080p60 H.264, 5 MB (`public/media/olmene-film.mp4`, poster `public/video/olmene-film-poster.webp`), served with byte ranges by `app/video/[name]` so Safari and iOS can seek. Nothing downloads until the section is near; it plays muted and loops while at least 45% visible, pauses when scrolled away. Sound on restarts from the top. Reduced motion or Save-Data: poster plus a play button (an explicit press plays with sound). Controls are labelled and 44 px on touch; a hairline shows progress.

## 12. Accounts (2026-10-15)

Owner's brief: make the account side friendly, helpful and professional, from sign-up to sign-out, with profile pictures, names, deleting data or the account, and sharing progress with friends.

- **Sign-in and sign-up** (`/login/`, `?mode=signup`): one card, two modes (passwordless either way). Sign-up lists three verifiable perks. The method used last time on this browser gets a "Last used" tag and the email is prefilled. The inbox step offers "Open Gmail/Outlook/…" for the big webmail domains, a resend button with a 60 s countdown, and a spam tip. Already signed in: "Continue to your dashboard" or "Use a different account". Signing out (or deleting the account) lands on the same card with a one-line confirmation.
- **First sign-in**: a two-step welcome dialog (name and photo, Google's prefilled; then where to start). Closing it counts as done.
- **Header**: the person's picture opens the account menu (account settings, share progress, plan and billing, help, sign out) in both the app and marketing headers. Initials on a steel disc when there's no picture.
- **Account settings** (`/app/account/`): one scrolling page with a section index, not tabs: profile, progress (milestones with the next one spelled out as an action, per-site score lines), email switches, sign-in and security (sign out here or on every device), your data (download JSON, delete data, delete account). Deleting the account is blocked while a plan still renews (link to the billing portal) and needs the email typed.
- **Progress links** (`/p/<slug>/`): one public, noindex link per site, opt-in, with name and photo optional. Shows the score, how far it moved, the weekly line, three numbers and milestones; nothing from reports. Link previews carry the score in the title. View counts skip link-preview bots.
- **Colour** stays telemetry: score bands on the latest point and numbers, emerald checks for reached milestones, rose only for destructive actions.
- **Motion**: the score line draws once and its last point settles (CSS, `.o-trend-line`); the milestone ring fills; the welcome steps slide 16 px (framer-motion, /app only). All static under reduced motion.

## 13. Refinement: earn trust through visible, useful work (2026-10-30)

Owner's brief: the presentation emphasised polish before usefulness. Keep the flower, the monochrome palette and the type; refocus on manage client sites → review fixes → prove progress. Progress and open items: `docs/design/refinement-2026-10-30.md`. This section overrides §6 and §11 where they differ.

- **Type.** Newsreader for marketing headings and report titles only; the signed-in app (`[data-surface="app"]`) sets `.o-display` in Inter 600, and report bodies (`[data-surface="report"]`) switch back to Newsreader. Hero 38/52/60 px, section headings 30/36/42 px. No metallic text: `.o-hero-title` and `.o-display em` are plain ink.
- **Surfaces.** Flat canvas, one content surface (`.o-artifact`, `bg-card` + hairline, no gradient or shadow), one elevated overlay (dialogs, menus, sticky bars). `.o-well` and `.o-chip` lost their inset and drop shadows.
- **Radii.** 8 px controls (`rounded-md`), 12 px panels (`rounded-xl`, `rounded-2xl`), 16 px dialogs (`rounded-3xl`). Ad-hoc 22/24/28 px radii are gone.
- **Rhythm.** Marketing sections 40–48 px padding each (80–96 px between sections).
- **Motion.** `--dur-hover` 140 ms, `--dur-state` 200 ms, `--dur-enter` 240 ms; drawer 200/240 ms. Retired: the hero slide-in, the typed placeholder (static placeholder plus an instant "Use olmene.com" fill), the button sheen, rotating borders (`.o-glow-border`, `.o-beam-border` focus), card hover lift, staggered list entrances, the 3D scan scene (scene files and the `three` / `@types/three` dependencies removed; bun.lock regenerated with Bun 1.2.15). The film plays only from an explicit "Watch the 20-second film" press, in a dialog.
- **Homepage order.** Split hero with an inspectable example (client site, three findings, one opens to observation, evidence, diff and delivery; labelled Example) → three delivery routes (pull requests, connected platforms, guided) → the olmene.com case as finding → change → live verification with dates, engine versions and a "how to read these scores" note → what clients see (client page preview) → plans (Agency leads with "Request agency trial" and a separate "Subscribe without a trial"; Fix beside it; the single report on its own row) → FAQ → operator, permissions and the activity counters (labelled as activity, not outcomes).
- **Honesty.** The fictional sample report has no outbound source or competitor links; its sources say they are placeholders. Every score sits next to its method: rule-based readiness, AI-model assessments, and that none of them measures traffic, rankings or revenue. Client pages say the same, plus that scores across engine changes don't compare directly.
- **One report reader.** `ReportViewer` renders every section in one document for signed-in reports and the sample (`sample` prop): sticky contents rail on desktop, a contents selector on phones, citations that open in a popover, findings as observation → evidence (one press, always printed) → recommendation. `report-document.tsx` is gone.
- **Client deliverable.** `ClientProgress` replaces the social progress card on `/c/[slug]/`: scope and latest measurement date, score with band word, trend, checks passing, checks that went from failing to passing, a method note. No milestones or badges. `/p/[slug]/` (personal sharing) keeps `ProgressCard`.
- **App shell.** Persistent sidebar from lg (Overview, Clients, Sites, Fix runs, Reports, Impact, Alerts; Team and Plan and billing under "Workspace settings"; New analysis and Free scan at the top), top bar and drawer below lg. `/app/` is the workspace overview; the analysis list is `/app/analyses/` (Reports); `/app/scan/` is the free scan inside the app.
- **Async states.** `AsyncState` (src/components/app/async-state.tsx): loading, failed (with Retry), denied (401/403), stale (data kept, refresh failed), empty, ready. `listJobs`, `listSites` and `listNotifications` throw `DataError` instead of returning an empty list.
- **Fix review.** The consequential button reads "Create pull request with N changes"; evidence comes before the diff; the header shows repository and state; PR lifecycle: open → merged, awaiting deployment → verified live | verification failed, or closed without merging (`prStage` in v2/agent/fixers.ts).
- **Sign-in.** Compact shell (logo, card, help, terms, privacy, security). The card says where sign-in leads (back to the scan's fixes, to checkout, or to the page asked for).
