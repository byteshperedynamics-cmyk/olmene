# Olmene: Obsidian

A 20-second motion piece for the monochrome redesign, 1920×1080 at 60 fps
with a synthesised score. The finished film is `out/olmene-obsidian.mp4`.

It follows `docs/design/DESIGN.md` (Obsidian, Silver & Steel) to the letter:
achromatic structure on the `#09090B` canvas, engraved wells, lit artifacts
with a specular top edge, the white mark and wordmark, the brushed-metal
headline accent, and colour only as telemetry inside product artifacts:
rose for a leak or a deleted line, emerald for a fix, a pass or the live
agent, sky for the branch and the pull request, amber for "Example".

## The film

One continuous camera move through a dark 3D space, no cuts. Light reveals
everything.

| Time | Shot |
|---|---|
| 0–4 s | A laser ignites and writes *Your site is losing customers. Olmene ships the fix.* A glint crosses the metal accent |
| 4–8 s | **Find it.** The camera glides to the scanned page. A white laser sweeps it, 21 checks count, three rose leaks land |
| 8–12 s | **Fix it.** The camera follows emerald wires down from each leak into the diff that fixes it. Each `+` line types itself, the pin turns into a check, the branch and PR appear, Approve |
| 12–16 s | **Prove it.** Merged to main; the needle springs 61 → 94 with the site's own spring constants; the score bridge runs 61 → PR #14 → 94 |
| 16–20 s | The camera pulls back, the laser returns and condenses into the white flower; light writes the wordmark; the share card draws itself and a light travels its edge. The last colour on screen is the live agent's emerald dot |

The product frames are illustrations and say so ("Preview", "Example"); the
numbers in them are the same example values the homepage uses.

## Render it

Needs Node 22 with Playwright's Chromium, ffmpeg, and Python 3 with numpy and
scipy.

```bash
cd motion/obsidian
npm install                      # sharp (PNG decode)
python3 audio/synth.py           # → out/olmene-obsidian.wav
node render.mjs                  # → out/olmene-obsidian.mp4 (muxes the wav)
```

`node render.mjs --preview` renders a half-resolution draft in about 90 s;
`--stills 4.6,9.4` writes single frames to `out/stills/`.

## How it works

| File | Role |
|---|---|
| `cues.js` | Every timing in the film, shared by the picture and the score |
| `index.html`, `style.css` | Three stations built as real HTML/CSS/SVG (the scanned page, the diff well, the gauge) and the finale card |
| `engine.js` | Easing, keyframes, noise, and a 3D camera that mirrors CSS exactly: `Cam.css()` is the world transform, `Cam.project()` returns the pixel Chromium draws, so canvas light sits on the DOM panels |
| `scenes.js` | `Reel.render(t)`: camera rigs blended through each glide (with a lift and a bank), depth of field and focus-driven light falloff, the floor grid and dust on canvas, the emerald wires as projected 3D curves, every reveal |
| `render.mjs` | Headless Chromium frame by frame, sub-frame motion blur in linear light, vignette and grain, a lossless FFV1 master, then a two-pass H.264 delivery file |
| `audio/synth.py` | The score: 120 BPM half time, A minor to C major on the bloom; sub impacts tuned to the harmony; leak, fix and needle sounds locked to the cues; −15 LUFS, true peak under −1 dB |

Fonts are under the SIL Open Font License; see `fonts/OFL-*.txt`.
