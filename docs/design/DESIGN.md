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

