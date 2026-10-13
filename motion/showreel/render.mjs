#!/usr/bin/env node
/**
 * render.mjs: renders the showreel frame by frame.
 *
 *   node render.mjs                       full 1080p60 render with motion blur + post
 *   node render.mjs --preview             fast half-res render, no blur, no post
 *   node render.mjs --stills 0.5,2.1      single frames to out/stills/
 *   node render.mjs --range 3.4:4.4       render only part of the timeline
 *   node render.mjs --workers 3           parallel pages (default 3)
 *
 * Each frame: Reel.render(t) poses the DOM for time t, Chromium captures it
 * (CDP screenshot, lossless PNG), sharp decodes it, and sub-frames are
 * averaged in linear light for a 180° shutter. Post adds lens aberration on
 * impacts, a soft vignette and fine grain, then frames stream into ffmpeg.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require_ = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PREVIEW = flag('--preview');
const STILLS = opt('--stills', null);
const SCALE = parseFloat(opt('--scale', PREVIEW ? '0.5' : '1'));
const WORKERS = parseInt(opt('--workers', '3'), 10);
const FPS = parseInt(opt('--fps', '60'), 10);
const OUT = path.resolve(ROOT, opt('--out', PREVIEW ? 'out/preview.mp4' : 'out/olmene-showreel.mp4'));
const AUDIO = path.resolve(ROOT, opt('--audio', 'out/olmene-showreel.wav'));
const NOBLUR = flag('--noblur') || PREVIEW;
const NOPOST = flag('--nopost') || PREVIEW;

const CUES = JSON.parse(fs.readFileSync(path.join(ROOT, 'cues.js'), 'utf8').split(/^window\.CUES\s*=/m)[1].trim().replace(/;\s*$/, ''));
const DURATION = CUES.duration;
const [R0, R1] = (opt('--range', `0:${DURATION}`)).split(':').map(Number);
const W = Math.round(1920 * SCALE), H = Math.round(1080 * SCALE);

/* Sub-frames per frame. Fast moves get many, holds get few. */
const BLUR = [
  [1.66, 3.02, 6],   // dissolve + converge
  [3.40, 4.20, 14],  // zoom through the dot, portal
  [4.20, 5.40, 3],   // scan
  [5.90, 6.90, 14],  // dive into the pin, morph
  [6.90, 7.50, 4],   // typing
  [7.50, 8.15, 8],   // cursor + click
  [8.15, 8.45, 4],
  [8.45, 9.25, 12],  // ring flight
  [9.25, 10.10, 10], // odometer
  [10.10, 11.25, 4], // chart
  [11.25, 12.05, 14],// implode + travel
  [12.05, 13.20, 10],// bloom
  [13.20, 14.10, 4], // type
];
const samplesAt = (t) => { for (const [a, b, n] of BLUR) if (t >= a && t < b) return n; return 2; };
const SHUTTER = 0.5; // fraction of a frame the shutter is open (180°)

/* ───────── static server ───────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

/* ───────── browser ───────── */
const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none', '--disable-lcd-text',
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,PaintHolding'],
});

async function openPage(particles) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
  await page.goto(URL_);
  await page.evaluate(() => window.Reel.ready);
  if (!particles) particles = await sampleParticles(page);
  await page.evaluate((d) => window.Reel.endSample(d), particles);
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp, particles };
}

/** Rasterise the word that dissolves, and turn its pixels into particles. */
async function sampleParticles(page) {
  const clip = await page.evaluate(() => window.Reel.beginSample());
  const png = await page.screenshot({ clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h }, type: 'png', scale: 'css' });
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sx = info.width / clip.w; // device px per css px
  const x = [], y = [], a = [];
  for (let by = 0; by < clip.h; by += 2) {
    for (let bx = 0; bx < clip.w; bx += 2) {
      let s = 0, c = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const px = Math.min(info.width - 1, Math.floor((bx + dx) * sx)), py = Math.min(info.height - 1, Math.floor((by + dy) * sx));
        s += data[py * info.width + px]; c++;
      }
      const cov = s / c / 255;
      if (cov > 0.035) { x.push(clip.x + bx + 1); y.push(clip.y + by + 1); a.push(+cov.toFixed(3)); }
    }
  }
  console.log(`particles: ${x.length}`);
  return { x, y, a };
}

async function capture(w, t) {
  const info = await w.page.evaluate((tt) => window.Reel.render(tt), t);
  const { data } = await w.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: SCALE } });
  return { png: Buffer.from(data, 'base64'), info };
}

/* ───────── colour + post ───────── */
const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LUT_N = 8192;
const TO_SRGB = new Float32Array(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) { const c = i / LUT_N; TO_SRGB[i] = 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }

const N = W * H;
const VIG = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
  const r = Math.sqrt(dx * dx * 0.82 + dy * dy * 0.95);
  VIG[y * W + x] = 1 - 0.30 * Math.pow(Math.min(1, Math.max(0, (r - 0.38) / 0.95)), 1.9);
}
// soft grain tiles: blurred white noise, a few variants offset per frame
const GT = 512, GTILES = 6;
const GRAIN = [];
{
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let k = 0; k < GTILES; k++) {
    const raw = new Float32Array(GT * GT);
    for (let i = 0; i < raw.length; i++) raw[i] = rnd() + rnd() - 1;
    const out = new Float32Array(GT * GT);
    for (let y = 0; y < GT; y++) for (let x = 0; x < GT; x++) {
      let acc = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const wgt = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        acc += wgt * raw[((y + dy + GT) % GT) * GT + ((x + dx + GT) % GT)];
      }
      out[y * GT + x] = acc / 16 * 2.4;
    }
    GRAIN.push(out);
  }
}

function finish(acc, ca, vig, frame) {
  // acc: Float32Array(N*3) linear RGB 0..1
  let src = acc;
  if (ca > 0.00005) {
    src = new Float32Array(N * 3);
    const cx = W / 2, cy = H / 2;
    const samp = (xf, yf, ch) => {
      xf = Math.min(W - 1.001, Math.max(0, xf)); yf = Math.min(H - 1.001, Math.max(0, yf));
      const x0 = xf | 0, y0 = yf | 0, fx = xf - x0, fy = yf - y0;
      const i00 = (y0 * W + x0) * 3 + ch, i10 = i00 + 3, i01 = i00 + W * 3, i11 = i01 + 3;
      return (acc[i00] * (1 - fx) + acc[i10] * fx) * (1 - fy) + (acc[i01] * (1 - fx) + acc[i11] * fx) * fy;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, dx = x - cx, dy = y - cy;
      src[i] = samp(cx + dx * (1 + ca), cy + dy * (1 + ca), 0);
      src[i + 1] = acc[i + 1];
      src[i + 2] = samp(cx + dx * (1 - ca), cy + dy * (1 - ca), 2);
    }
  }
  const out = Buffer.allocUnsafe(N * 3);
  const g = GRAIN[frame % GTILES];
  const ox = (frame * 197) % GT, oy = (frame * 331) % GT;
  const gs = Math.max(1, SCALE * 2) | 0;
  for (let y = 0; y < H; y++) {
    const gy = ((((y / gs) | 0) + oy) % GT) * GT;
    for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 3;
      const v = 1 - (1 - VIG[p]) * vig / 0.30;
      const n = g[gy + ((((x / gs) | 0) + ox) % GT)];
      for (let c = 0; c < 3; c++) {
        let l = src[i + c] * v;
        l = l < 0 ? 0 : l > 1 ? 1 : l;
        const sv = TO_SRGB[(l * LUT_N + 0.5) | 0];
        const amp = 2.1 + 1.6 * (1 - Math.abs(sv / 127.5 - 1));
        let o = sv + n * amp;
        out[i + c] = o < 0 ? 0 : o > 255 ? 255 : (o + 0.5) | 0;
      }
    }
  }
  return out;
}

async function renderFrame(w, frame) {
  const t = frame / FPS;
  const n = NOBLUR ? 1 : samplesAt(t);
  const acc = new Float32Array(N * 3);
  let ca = 0, vig = 0.3;
  for (let s = 0; s < n; s++) {
    const off = n === 1 ? 0 : ((s + 0.5) / n - 0.5) * SHUTTER / FPS;
    const ts = Math.min(DURATION - 1e-4, Math.max(0, t + off));
    const { png, info } = await capture(w, ts);
    ca += info.ca / n;
    vig = info.vig;
    const { data, info: im } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (im.width !== W || im.height !== H) throw new Error(`capture is ${im.width}x${im.height}, expected ${W}x${H}`);
    for (let i = 0; i < N * 3; i++) acc[i] += TO_LIN[data[i]];
  }
  if (n > 1) for (let i = 0; i < N * 3; i++) acc[i] /= n;
  if (NOPOST) {
    const out = Buffer.allocUnsafe(N * 3);
    for (let i = 0; i < N * 3; i++) out[i] = TO_SRGB[(Math.min(1, acc[i]) * LUT_N + 0.5) | 0] + 0.5 | 0;
    return out;
  }
  return finish(acc, ca, vig, frame);
}

/* ───────── stills ───────── */
if (STILLS) {
  const dir = path.join(ROOT, 'out/stills');
  fs.mkdirSync(dir, { recursive: true });
  const w = await openPage();
  for (const s of STILLS.split(',').map(Number)) {
    const frame = Math.round(s * FPS);
    const rgb = await renderFrame(w, frame);
    const f = path.join(dir, `t${s.toFixed(3)}.png`);
    await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(f);
    console.log(f);
  }
  await browser.close(); server.close();
  process.exit(0);
}

/* ───────── movie ───────── */
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const f0 = Math.round(R0 * FPS), f1 = Math.min(Math.round(R1 * FPS), Math.round(DURATION * FPS));
const total = f1 - f0;
const withAudio = fs.existsSync(AUDIO) && R0 === 0 && R1 >= DURATION && !flag('--noaudio');
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  ...(withAudio ? ['-i', AUDIO] : []),
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'slow', '-crf', PREVIEW ? '20' : '15', '-tune', 'film',
  '-profile:v', 'high', '-level', '4.2', '-g', String(FPS), '-bf', '3',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  ...(withAudio ? ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'] : []),
  '-movflags', '+faststart', OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const workers = [];
const first = await openPage();
workers.push(first);
for (let i = 1; i < WORKERS; i++) workers.push(await openPage(first.particles));

const done = new Map();
let next = f0, written = f0;
const started = Date.now();
async function flush() {
  while (done.has(written)) {
    const buf = done.get(written);
    done.delete(written);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    written++;
    if ((written - f0) % 30 === 0 || written === f1) {
      const el = (Date.now() - started) / 1000;
      const rate = (written - f0) / el;
      process.stdout.write(`\r${written - f0}/${total} frames  ${rate.toFixed(2)} fps  eta ${((f1 - written) / rate).toFixed(0)}s   `);
    }
  }
}
await Promise.all(workers.map(async (w) => {
  while (next < f1) {
    const frame = next++;
    done.set(frame, await renderFrame(w, frame));
    // keep memory bounded if one worker runs ahead
    while (done.size > WORKERS * 4 && !done.has(written)) await new Promise((r) => setTimeout(r, 5));
    await flush();
  }
}));
await flush();
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
console.log(`\nwrote ${OUT}${withAudio ? ' (with audio)' : ''} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
await browser.close();
server.close();
