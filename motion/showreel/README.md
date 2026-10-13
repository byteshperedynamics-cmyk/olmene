# Olmene showreel

A 15-second motion piece about Olmene, 1920×1080 at 60 fps with a synthesised
soundtrack. The finished film is `out/olmene-showreel.mp4`.

Everything is built from the product's own design system: the elm flower
(`PETAL_D` from `src/components/animated-flower.tsx`), the oat and
instrument-dark tokens from `src/app/globals.css`, Newsreader / Inter /
JetBrains Mono, and the brand ease `cubic-bezier(0.22, 1, 0.36, 1)`. Green
only ever means the agent at work or a confirmed result, rust a problem,
amber an event or example data, as `docs/design/IMPLEMENTATION_BRIEF.md` asks.

## The film

One leaf-green dot threads the piece. Every transition is a match cut on a
circle.

| Time | Shot | Transition out |
|---|---|---|
| 0.0–2.3 s | A heartbeat dot, then *Your site is losing customers.* "customers." breaks into ~6,500 particles that blow away in rust | The dust swirls home |
| 2.3–4.0 s | The dust turns green and becomes the period of *Olmene ships the fix.* | Camera dives through the period, a portal opens |
| 4.0–6.3 s | **Find it.** Drop. A 3D browser, scan beam, live 21-check counter, rust finding pins | Dive into the "No meta description" pin |
| 6.3–8.9 s | **Fix it.** The rust dot slams into the struck `title` line; the fix types in, a cursor approves, PR #14 opens and merges | The merge check flies off |
| 8.9–11.8 s | **Prove it.** The check becomes the readiness ring, 61 rolls to 94 on the beat, the clicks chart draws with PR markers | Everything implodes into the chart's live point |
| 11.8–15.0 s | The point blooms into the flower, the wordmark rises, *Find it. Fix it. Prove it.* · olmene.com | — |

The numbers inside the product frames (61 → 94, +38%, PR #14) are example
data, and the chart says so on screen. `acme.com` is a placeholder site.

## Render it

Needs Node 22 with Playwright's Chromium, ffmpeg, and Python 3 with numpy and
scipy.

```bash
cd motion/showreel
npm install                      # sharp (PNG decode)
python3 audio/synth.py           # → out/olmene-showreel.wav
node render.mjs                  # → out/olmene-showreel.mp4 (muxes the wav)
```

Useful while iterating:

```bash
node render.mjs --preview                # half-res, no blur, ~75 s
node render.mjs --stills 4.6,10.7,14.9   # single frames → out/stills/
node render.mjs --range 3.4:4.4          # part of the timeline
```

## How it works

| File | Role |
|---|---|
| `cues.js` | Every timing in the film. The picture and the soundtrack both read it, so retiming a shot moves its sound too |
| `index.html`, `style.css` | The six scenes as real HTML/CSS/SVG (the scan browser, PR panel, ring and chart are built like the product UI) |
| `engine.js` | Easing (including the brand bezier), keyframe tracks, seeded randomness, noise, camera shake |
| `scenes.js` | `Reel.render(t)` poses every element for time `t`. Pure function of time: no state between frames |
| `render.mjs` | Drives headless Chromium frame by frame, averages sub-frames in linear light for a 180° shutter (up to 14 samples on fast moves), adds lens aberration on impacts, vignette and grain, and encodes H.264 with BT.709 tags |
| `audio/synth.py` | The soundtrack: 120 BPM, D minor to D major on the bloom. Drums, sidechained bass, pads, plucks, FM bells, risers, whooshes and UI foley, mixed to −14 LUFS / −1 dBFS |

The particles are sampled from the rendered pixels of the word itself, so the
handover from type to dust is seamless.

Fonts are under the SIL Open Font License; see `fonts/OFL-*.txt`.
