# Olmene — TikTok promo (Remotion)

A 25.8-second vertical motion-graphics promo for Olmene, cut as a **phonk
edit** at 130 BPM and built as code with [Remotion](https://www.remotion.dev)
(React → MP4). Everything on screen is drawn from the product's own design
system (`docs/design/olmene-blueprint.html`, `src/app/globals.css`) and its own
copy; the phonk soundtrack and sound effects are synthesized by a script in
this folder, so there is nothing to license.

| | |
|---|---|
| Final video | `renders/olmene-tiktok.mp4` — 1080×1920, 30 fps, H.264 + AAC 320k, −14 LUFS, original phonk track |
| For a trending sound | `renders/olmene-tiktok-sfx-only.mp4` — same cut, sound effects only; add the trending sound inside TikTok (see [Using a trending sound](#using-a-trending-sound)) |
| Cover | `renders/olmene-tiktok-cover.png` — upload as the custom cover |

## The cut

The edit sits on a 130 BPM grid defined in `src/beat-map.json`; the soundtrack
is generated from the same file, so music and picture cannot drift apart. Every
cut lands on a bar line, every UI event on a beat or eighth note, and every 808
hit punches the frame (`src/components/BeatFx.tsx`).

| Time | Scene | On screen |
|---|---|---|
| 0:00 | Hook | *Your site is* **losing customers.** slams in on the first 808; three real findings pop on eighth notes; a snare roll builds, then half a beat of silence |
| **0:03.7** | Scan — **the drop** | flash, RGB split and the scan beam; *Paste your URL.* → the input unfolds into the browser, the beam reads the page, readiness **61** |
| 0:09.2 | Fix | *Then it writes the fix.* — the diff types line by line on the beat |
| 0:12.9 | Review | *You stay in control.* — the approve click lands on beat 3 → **PR #14 opened · 3 fixes** → *Nothing merges without you.* |
| 0:16.6 | Prove | *Then it proves it worked.* — 61 → 72 → 83 → 94, one step per eighth note |
| 0:20.3 | End card | the flower blooms, **olmene**, *Find it. Fix it. Prove it.*, **olmene.com →**; final hit at 0:24, then a tape stop |

Honesty rules carried over from the site: the example site is the site's own
fictional **Acme**, and the illustrative UI (the 61 → 94 score, the PR number)
carries the same amber **Preview / Example** labels the homepage uses. All
other claims are copy already live on olmene.com (21 checks, free 30-second
scan, no card, PR-based fixes, nothing merges without you, live re-check).

## Using a trending sound

A trending sound only helps when it is **added inside TikTok** (the video then
joins that sound's page, and the music is licensed by TikTok). Audio baked into
the uploaded file becomes an "original sound" or gets muted. So:

1. Upload `renders/olmene-tiktok-sfx-only.mp4`.
2. **Add sound** → search the sound → **Adjust clip / trim**: slide it so the
   song's drop lands at **0:03.7**, the green flash where the scan starts.
3. **Volume**: added sound 100%, original sound about 40% (keeps the clicks,
   dings and whooshes under the music).

Picked for this edit (October 2026): **"DUNG DING BREGA" — 3VILCORE & Pheyx**,
phonk × brega funk with a heavy bass and an explosive drop; Metricool's weekly
TikTok chart had it at No. 4 for the week of 5 October 2026. Phonk/funk
alternatives TikTok's own discover pages show as popular: *Luz Roja* (bxkq),
*Matadora*, *Nervy Funk*, *Montagem Alquimia*. Check TikTok Creative Center →
Trends → Songs for this week's numbers before posting.

- **Business accounts** cannot use the general music library (most trending
  phonk lives there). Either search "phonk" in the **Commercial Music Library**
  and use the same steps, or post `olmene-tiktok.mp4`, whose original phonk
  track is yours to use.
- **Tempo**: the edit is cut at 130 BPM, the usual tempo of montagem and
  brega-phonk edits. If the sound you pick runs at another tempo, set `bpm` in
  `src/beat-map.json` and run `npm run render:sfx-only`; every cut and punch
  re-times itself.

## Commands

```bash
cd video
npm install
npm run dev               # Remotion Studio: scrub, edit, preview with sound
npm run audio             # synthesize public/audio/ (music + sfx); dev and render run it first
npm run render            # → renders/olmene-tiktok.mp4 (render + loudness pass)
npm run render:sfx-only   # → renders/olmene-tiktok-sfx-only.mp4
npm run cover             # → renders/olmene-tiktok-cover.png
npm run lint              # eslint + tsc
```

The first render downloads Remotion's headless Chrome. To use a Chrome or
Chromium you already have, set `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome`.

## Editing

- **Copy** lives in the scene files: `src/scenes/{Hook,Scan,Fix,Review,Prove,EndCard}.tsx`.
- **Timing**: `src/beat-map.json` holds the tempo, where each scene starts (in
  beats), the 808 pattern and the final hit. Inside a scene, `b(n)` from
  `sceneBeats()` (`src/timeline.ts`) is the frame of the n-th beat after its cut.
- **Edit effects** (punches, flash, RGB split, the push-in before the drop):
  `src/components/BeatFx.tsx`.
- **Brand tokens**: `src/theme.ts` (colours from the blueprint's dark theme, the
  brand ease `cubic-bezier(0.22, 1, 0.36, 1)`, fonts).
- **Safe zones**: key content stays inside `SAFE` in `src/theme.ts` (clear of
  TikTok's top tabs, right-hand buttons and caption block) and inside the centre
  ~80% of the width, because tall phones crop the sides slightly.
- Each scene is also registered on its own under **Scenes** in Studio.

## Posting

Suggested caption (edit freely):

> Your site is losing customers. Olmene finds why, writes the fix as a pull
> request you approve, then re-checks your live site to prove it worked. Free
> scan in 30 seconds at olmene.com
>
> #buildinpublic #indiehacker #saas #webdev #seo #phonk

- Put **olmene.com** in the profile bio; the video's CTA points there.
- Use the cover from `renders/`, or pick the frame at 0:01 in TikTok.

## Licences

- Remotion is free for individuals and companies of up to 3 people; larger
  companies need a [company license](https://www.remotion.pro/license).
- Fonts (Newsreader, Inter, JetBrains Mono) are SIL OFL; their licences sit in
  `public/fonts/`.
- Music and sound effects are generated by `scripts/make-audio.mjs` from
  oscillators and noise. No samples are used.
