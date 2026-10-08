#!/usr/bin/env node
/**
 * Synthesizes the promo's soundtrack and sound effects from oscillators and
 * noise — no samples, nothing to license. Deterministic: the same seed always
 * writes the same files.
 *
 *   node scripts/make-audio.mjs
 *
 * Writes public/audio/music.wav — a phonk track on the video's beat grid
 * (src/beat-map.json: tempo and where each scene starts) — and
 * public/audio/sfx/*.wav (see src/components/Sfx.tsx).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT_DIR, "public", "audio");
const MAP = JSON.parse(readFileSync(join(ROOT_DIR, "src", "beat-map.json"), "utf8"));
const SR = 48000;
const BEAT = 60 / MAP.bpm;
// Same length as the video: the last frame of the beat grid (src/timeline.ts).
const LENGTH = Math.round((MAP.sections.total * MAP.fps * 60) / MAP.bpm) / MAP.fps;

// ── primitives ──────────────────────────────────────────────────────────────

let seed = 1337;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rand() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

/** RBJ biquad; set() may be called per sample block for sweeps. */
class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(freq, q);
  }
  set(freq, q = this.q) {
    this.q = q;
    const w0 = (TAU * Math.min(Math.max(freq, 10), SR * 0.45)) / SR;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b0, b1, b2;
    if (this.type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha]; // band-pass, 0 dB peak
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const polyblep = (t, dt) => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};

/** Band-limited saw, phase in [0,1). */
const saw = (phase, dt) => 2 * phase - 1 - polyblep(phase, dt);

const mono = (seconds) => new Float32Array(Math.ceil(seconds * SR));
const stereo = (seconds) => [mono(seconds), mono(seconds)];

/** Mix a mono voice into a stereo bus at `time` with equal-power pan (-1..1). */
function place(bus, voice, time, gain = 1, pan = 0) {
  const start = Math.round(time * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  const [L, R] = bus;
  for (let i = 0; i < voice.length; i++) {
    const n = start + i;
    if (n < 0 || n >= L.length) continue;
    L[n] += voice[i] * gl;
    R[n] += voice[i] * gr;
  }
}

function placeStereo(bus, [vl, vr], time, gain = 1) {
  const start = Math.round(time * SR);
  for (let i = 0; i < vl.length; i++) {
    const n = start + i;
    if (n < 0 || n >= bus[0].length) continue;
    bus[0][n] += vl[i] * gain;
    bus[1][n] += vr[i] * gain;
  }
}

/** Freeverb (Jezar's tuning), stereo in → stereo wet out. */
function reverb([inL, inR], { feedback = 0.84, damp = 0.3, width = 1 } = {}) {
  const k = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const mk = (len) => ({ buf: new Float32Array(Math.round(len * k)), i: 0, store: 0 });
  const side = (spread) => ({ combs: combs.map((c) => mk(c + spread)), aps: aps.map((a) => mk(a + spread)) });
  const chans = [side(0), side(23)];
  const out = [new Float32Array(inL.length), new Float32Array(inL.length)];
  for (let n = 0; n < inL.length; n++) {
    const input = (inL[n] + inR[n]) * 0.015;
    for (let c = 0; c < 2; c++) {
      let acc = 0;
      for (const cb of chans[c].combs) {
        const y = cb.buf[cb.i];
        cb.store = y * (1 - damp) + cb.store * damp;
        cb.buf[cb.i] = input + cb.store * feedback;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        acc += y;
      }
      for (const ap of chans[c].aps) {
        const b = ap.buf[ap.i];
        ap.buf[ap.i] = acc + b * 0.5;
        if (++ap.i >= ap.buf.length) ap.i = 0;
        acc = b - acc;
      }
      out[c][n] = acc;
    }
  }
  // width: mix the two wet channels toward mono when < 1
  if (width < 1) {
    for (let n = 0; n < inL.length; n++) {
      const m = (out[0][n] + out[1][n]) / 2;
      out[0][n] = m + (out[0][n] - m) * width;
      out[1][n] = m + (out[1][n] - m) * width;
    }
  }
  return out;
}

/** Ping-pong delay with a darkening feedback path. */
function pingPong([inL, inR], time, feedback, lp = 3500) {
  const d = Math.round(time * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  const fl = new Biquad("lp", lp);
  const fr = new Biquad("lp", lp);
  const out = [new Float32Array(inL.length), new Float32Array(inL.length)];
  let i = 0;
  for (let n = 0; n < inL.length; n++) {
    const yl = bl[i];
    const yr = br[i];
    bl[i] = (inL[n] + inR[n]) * 0.5 + fr.run(yr) * feedback;
    br[i] = fl.run(yl) * feedback;
    if (++i >= d) i = 0;
    out[0][n] = yl;
    out[1][n] = yr;
  }
  return out;
}

const addInto = (dst, src, gain = 1) => {
  for (let c = 0; c < 2; c++) for (let n = 0; n < dst[c].length; n++) dst[c][n] += src[c][n] * gain;
};

function peak(bus) {
  let p = 0;
  for (const ch of bus) for (const v of ch) p = Math.max(p, Math.abs(v));
  return p;
}

function normalize(bus, dbfs) {
  const target = 10 ** (dbfs / 20);
  const g = target / (peak(bus) || 1);
  for (const ch of bus) for (let n = 0; n < ch.length; n++) ch[n] *= g;
  return bus;
}

function writeWav(path, [L, R]) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const s = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    buf.writeInt16LE(s(L[i]), 44 + i * 4);
    buf.writeInt16LE(s(R[i]), 46 + i * 4);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

// ── instruments (mono voices) ───────────────────────────────────────────────

function kick(gain = 1, len = 0.5) {
  const v = mono(len);
  let ph = 0;
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    const f = 52 + 125 * Math.exp(-t / 0.03);
    ph += (TAU * f) / SR;
    const amp = Math.min(1, t / 0.002) * Math.exp(-t / 0.16);
    const click = noise() * Math.exp(-t / 0.0025) * 0.4;
    v[i] = Math.tanh(1.3 * Math.sin(ph) * amp + click) * gain;
  }
  return v;
}

function clap() {
  const v = mono(0.45);
  const bp = new Biquad("bp", 1250, 0.9);
  const hp = new Biquad("hp", 600);
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    let env = 0;
    for (const o of [0, 0.011, 0.022]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) / 0.006));
    if (t >= 0.03) env = Math.max(env, 0.55 * Math.exp(-(t - 0.03) / 0.11));
    v[i] = hp.run(bp.run(noise())) * env * 2.4;
  }
  return v;
}

function hat(decay, gain) {
  const v = mono(decay * 7);
  const hp = new Biquad("hp", 7800, 0.8);
  const hp2 = new Biquad("hp", 9500, 0.6);
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    v[i] = hp2.run(hp.run(noise())) * Math.exp(-t / decay) * gain;
  }
  return v;
}

function crash(len = 2.2, gain = 1) {
  const v = mono(len);
  const hp = new Biquad("hp", 4200, 0.6);
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    v[i] = hp.run(noise()) * Math.min(1, t / 0.004) * Math.exp(-t / (len / 4.5)) * gain;
  }
  return v;
}

/** Warm pad chord: three detuned saws per note, slow-moving low-pass. Returns stereo. */
function padChord(notes, len, { cutoff = 1500, attack = 0.25, release = 0.7, gain = 1 } = {}) {
  const total = len + release;
  const out = stereo(total);
  const voices = [];
  notes.forEach((m, ni) =>
    [-0.11, 0, 0.11].forEach((det, di) => voices.push({ f: mtof(m + det), ph: rand(), pan: ((di - 1) * 0.7 + (ni % 2 ? 0.15 : -0.15)) })),
  );
  const filters = [new Biquad("lp", cutoff, 0.8), new Biquad("lp", cutoff, 0.8)];
  for (let i = 0; i < out[0].length; i++) {
    const t = i / SR;
    if (i % 64 === 0) {
      const c = cutoff * (1 + 0.25 * Math.sin(TAU * 0.35 * t));
      filters[0].set(c);
      filters[1].set(c);
    }
    let l = 0;
    let r = 0;
    for (const vo of voices) {
      vo.ph = (vo.ph + vo.f / SR) % 1;
      const s = saw(vo.ph, vo.f / SR);
      l += s * (1 - vo.pan) * 0.5;
      r += s * (1 + vo.pan) * 0.5;
    }
    const env = Math.min(1, t / attack) * (t < len ? 1 : Math.exp(-(t - len) / (release / 3)));
    const g = (env * gain) / voices.length;
    out[0][i] = filters[0].run(l) * g;
    out[1][i] = filters[1].run(r) * g;
  }
  return out;
}

/** FM bell. */
function bell(freq, len = 1.6, gain = 1, ratio = 3.5) {
  const v = mono(len);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    pm += (TAU * freq * ratio) / SR;
    const index = 4.5 * Math.exp(-t / 0.25);
    pc += (TAU * freq) / SR;
    v[i] = Math.sin(pc + index * Math.sin(pm)) * Math.min(1, t / 0.002) * Math.exp(-t / (len / 3.2)) * gain;
  }
  return v;
}

/** TR-808-style cowbell: two detuned pulse waves (the 540/800 Hz ratio), band-passed, driven. */
function cowbell(midi, gain = 1, decay = 0.16) {
  const v = mono(decay * 5 + 0.05);
  const f1 = mtof(midi);
  const f2 = f1 * 1.4836;
  const bp = new Biquad("bp", f1 * 2.1, 0.8);
  const hp = new Biquad("hp", 380, 0.7);
  let p1 = 0;
  let p2 = 0;
  const sq = (p, dt) => (p < 0.5 ? 1 : -1) + polyblep(p, dt) - polyblep((p + 0.5) % 1, dt);
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    p1 = (p1 + f1 / SR) % 1;
    p2 = (p2 + f2 / SR) % 1;
    const env = Math.min(1, t / 0.0015) * (0.7 * Math.exp(-t / 0.03) + 0.4 * Math.exp(-t / decay));
    v[i] = Math.tanh(hp.run(bp.run(sq(p1, f1 / SR) + sq(p2, f2 / SR))) * 2.4 * env) * gain;
  }
  return v;
}

/** Distorted 808: a sine with a punchy pitch drop, driven hard so it reads on small speakers. */
function eight08(midi, len, gain = 1) {
  const v = mono(len + 0.04);
  const f = mtof(midi);
  const lp = new Biquad("lp", 2600, 0.8);
  let ph = 0;
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    ph += (TAU * f * 2 ** ((9 * Math.exp(-t / 0.03)) / 12)) / SR;
    const body = Math.exp(-t / Math.max(0.22, len * 0.8));
    const tail = t < len ? 1 : Math.exp(-(t - len) / 0.012);
    const env = Math.min(1, t / 0.002) * body * tail;
    v[i] = lp.run(Math.tanh(Math.sin(ph) * env * 2.6)) * gain;
  }
  return v;
}

/** Phonk snare: clap layers over a short tonal body and bright noise. */
function snare() {
  const c = clap();
  const v = mono(0.45);
  const bp = new Biquad("bp", 3400, 0.9);
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    v[i] = c[i] * 0.8 + Math.sin(TAU * 195 * t) * Math.exp(-t / 0.05) * 0.6 + bp.run(noise()) * Math.exp(-t / 0.07) * 1.1;
  }
  return v;
}

/** Tape stop: from t0 the playback rate falls to zero over `dur`, then silence. */
function tapeStop(bus, t0, dur) {
  const s0 = Math.round(t0 * SR);
  const n = Math.round(dur * SR);
  for (const ch of bus) {
    const src = ch.slice();
    let pos = s0;
    for (let i = 0; s0 + i < ch.length; i++) {
      if (i >= n) {
        ch[s0 + i] = 0;
        continue;
      }
      const rate = 1 - i / n;
      pos += rate * rate;
      const k = Math.floor(pos);
      const fr = pos - k;
      ch[s0 + i] = ((src[k] ?? 0) * (1 - fr) + (src[k + 1] ?? 0) * fr) * Math.min(1, (n - i) / (SR * 0.05));
    }
  }
}

/** Noise swept through a band-pass, from f0 to f1 (exponential), with an envelope fn. */
function noiseSweep(len, f0, f1, q, envFn, gain = 1) {
  const v = mono(len);
  const bp = new Biquad("bp", f0, q);
  for (let i = 0; i < v.length; i++) {
    const p = i / v.length;
    if (i % 32 === 0) bp.set(f0 * (f1 / f0) ** p, q);
    v[i] = bp.run(noise()) * envFn(p) * gain;
  }
  return v;
}

// ── the track: phonk, on the video's beat grid ─────────────────────────────

// F minor. One chord per bar, the 808 follows the root: F – Db – Eb – C.
const ROOTS = [41, 37, 39, 36]; // F2 Db2 Eb2 C2 — saturation puts their harmonics where phones can hear
const PAD = [
  [53, 56, 60, 63], // Fm7
  [49, 53, 56, 60], // Db
  [51, 55, 58, 63], // Eb
  [48, 52, 55, 58], // C7
];
// The cowbell riff: two bars of 16th notes (step → MIDI note).
const RIFF = [
  { 0: 72, 2: 72, 3: 68, 5: 72, 6: 73, 8: 72, 10: 68, 11: 67, 13: 65, 14: 67 },
  { 0: 72, 2: 72, 3: 68, 5: 72, 6: 75, 8: 73, 10: 72, 11: 68, 13: 67, 14: 68 },
];
const KICK_STEPS = MAP.kickSteps; // funk-style 808 pattern, shared with the video's beat punches
const SNARE_STEPS = [4, 12];

const S = MAP.sections;
const at = (beats) => beats * BEAT; // seconds
const STEP = BEAT / 4;

function music() {
  const main = stereo(LENGTH);
  const bells = stereo(LENGTH);
  const bellsIntro = stereo(LENGTH);
  const send = stereo(LENGTH);
  const pads = stereo(LENGTH);

  const DROP = at(S.scan);
  const GAP = at(S.scan - 0.5); // half a beat of silence before the drop
  const LAST = at(MAP.finalHit); // final hit, then the tape stops

  // ── intro (the hook): dark pad, filtered riff, the slam on beat 1, a roll into the gap
  for (let bar = 0; bar < S.scan / 4; bar++) {
    placeStereo(pads, padChord(PAD[bar % 4], at(4), { cutoff: 900, attack: 0.05, release: 0.3 }), at(bar * 4), 1);
  }
  place(main, eight08(ROOTS[0] - 12, 0.9, 1), at(1), 0.8); // the slam
  place(main, kick(1), at(1), 0.6);
  place(main, crash(1.6, 1), at(1), 0.08);
  for (let step = 0; step < S.scan * 4; step++) {
    const t = step * STEP;
    if (t >= GAP) break;
    const note = RIFF[Math.floor(step / 16) % 2][step % 16];
    if (note) place(bellsIntro, cowbell(note, 1), t, 0.9, 0.1);
    if (step % 2 === 0 && step >= 8) place(main, hat(0.02, 1), t, 0.08, 0.25);
  }
  // snare roll: 8ths, then 16ths, then 32nds, building into the gap
  for (let t = at(4); t < GAP - 1e-6; ) {
    const p = (t - at(4)) / (GAP - at(4));
    place(main, snare(), t, 0.12 + 0.3 * p * p, 0);
    t += p < 0.5 ? BEAT / 2 : p < 0.8 ? BEAT / 4 : BEAT / 8;
  }
  place(main, noiseSweep(GAP - at(4), 300, 8000, 1.6, (p) => p ** 2.2, 1), at(4), 0.45);

  // ── the groove: from the drop to the final hit
  const kicks = [];
  for (let step = Math.round(DROP / STEP); step * STEP < LAST - 1e-6; step++) {
    const t = step * STEP;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const beat = t / BEAT;
    // a half-beat gap before each scene cut keeps the cuts punchy
    const nearCut = [S.fix, S.review, S.prove, S.end].some((c) => beat >= c - 0.5 && beat < c);
    if (nearCut) continue;

    if (KICK_STEPS.includes(s16)) {
      const next = KICK_STEPS.find((k) => k > s16) ?? 16;
      place(main, eight08(ROOTS[bar % 4], (next - s16) * STEP, 1), t, 0.62);
      place(main, kick(1), t, 0.5);
      kicks.push(t);
    }
    if (SNARE_STEPS.includes(s16)) {
      const sn = snare();
      place(main, sn, t, 0.42);
      place(send, sn, t, 0.18);
    }
    if (s16 % 2 === 0) place(main, hat(0.022, 1), t, s16 % 4 === 2 ? 0.13 : 0.08, 0.3);
    else if (bar % 2 === 1 && s16 >= 13) place(main, hat(0.015, 1), t, 0.07, -0.3);

    const note = RIFF[bar % 2][s16];
    if (note) {
      const c = cowbell(note, 1);
      place(bells, c, t, 0.9, -0.1);
      // the end card gets the riff an octave up on top
      if (beat >= S.end) place(bells, cowbell(note + 12, 1, 0.1), t, 0.35, 0.3);
    }
    if (s16 === 0) placeStereo(pads, padChord(PAD[bar % 4], at(4), { cutoff: 1300, attack: 0.02, release: 0.3 }), t, 0.8);
  }

  // crashes on the drop and every cut; a build into the end card
  place(main, crash(2.6, 1), DROP, 0.17, -0.2);
  for (const c of [S.fix, S.review, S.prove]) place(main, crash(1.6, 1), at(c), 0.1, 0.2);
  place(main, crash(2.4, 1), at(S.end), 0.15, 0);
  for (let t = at(S.end - 4); t < at(S.end - 0.5) - 1e-6; t += BEAT / 4) {
    const p = (t - at(S.end - 4)) / at(3.5);
    place(main, snare(), t, 0.05 + 0.2 * p * p);
  }
  place(main, noiseSweep(at(3.5), 400, 7000, 1.8, (p) => p ** 2, 1), at(S.end - 4), 0.3);

  // the final hit
  place(main, eight08(ROOTS[0] - 12, 1.6, 1), LAST, 0.85);
  place(main, kick(1), LAST, 0.6);
  place(main, crash(2.4, 1), LAST, 0.16);
  place(bells, cowbell(72, 1, 0.4), LAST, 0.9);

  // the intro riff opens up as the drop approaches
  const lpL = new Biquad("lp", 700, 1.2);
  const lpR = new Biquad("lp", 700, 1.2);
  for (let n = 0; n < Math.round(DROP * SR); n++) {
    if (n % 64 === 0) {
      const p = n / (DROP * SR);
      lpL.set(700 + 2600 * p * p, 1.2);
      lpR.set(700 + 2600 * p * p, 1.2);
    }
    bellsIntro[0][n] = lpL.run(bellsIntro[0][n]);
    bellsIntro[1][n] = lpR.run(bellsIntro[1][n]);
  }

  // pads sit under the kick
  const duck = new Float32Array(main[0].length).fill(1);
  for (const t of kicks) {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < SR * 0.3 && s0 + i < duck.length; i++) duck[s0 + i] = Math.min(duck[s0 + i], 1 - 0.5 * Math.exp(-i / SR / 0.09));
  }
  for (let c = 0; c < 2; c++) for (let n = 0; n < duck.length; n++) pads[c][n] *= duck[n];

  addInto(main, bells, 0.36);
  addInto(main, bellsIntro, 0.36);
  addInto(main, pingPong(bells, BEAT * 0.75, 0.3, 2500), 0.12);
  addInto(send, bells, 0.25);
  addInto(main, pads, 0.22);
  addInto(main, reverb(send, { feedback: 0.84, damp: 0.4 }), 0.8);

  // silence the half beat before the drop (reverb tails included) — the pause before the hit
  for (let c = 0; c < 2; c++) {
    const a = Math.round(GAP * SR);
    const b = Math.round(DROP * SR);
    for (let n = a; n < b; n++) main[c][n] *= Math.max(0, 1 - (n - a) / (SR * 0.012));
  }

  tapeStop(main, LAST + BEAT, BEAT * 2.2);

  // master: high-pass, saturation for weight, short fade at the very end
  for (let c = 0; c < 2; c++) {
    const hp1 = new Biquad("hp", 30, 0.7);
    const hp2 = new Biquad("hp", 30, 0.7);
    for (let n = 0; n < main[c].length; n++) {
      const t = n / SR;
      const fade = t > LENGTH - 0.2 ? (LENGTH - t) / 0.2 : 1;
      main[c][n] = Math.tanh(hp2.run(hp1.run(main[c][n])) * 1.0) * fade;
    }
  }
  return normalize(main, -1);
}

// ── sound effects ───────────────────────────────────────────────────────────

const toStereo = (v) => [v, Float32Array.from(v)];
const withVerb = (dry, amount, opts) => {
  const s = toStereo(dry);
  const wet = reverb(s, opts);
  addInto(s, wet, amount);
  return s;
};
const pad = (v, seconds) => {
  const out = mono(v.length / SR + seconds);
  out.set(v);
  return out;
};

const SFX = {
  impact() {
    const v = mono(1.6);
    const lp = new Biquad("lp", 900, 0.7);
    const bp = new Biquad("bp", 2800, 1.2);
    let ph = 0;
    for (let i = 0; i < v.length; i++) {
      const t = i / SR;
      ph += (TAU * (36 + 70 * Math.exp(-t / 0.09))) / SR;
      const sub = Math.tanh(2 * Math.sin(ph)) * Math.exp(-t / 0.42);
      const body = lp.run(noise()) * Math.exp(-t / 0.07) * 1.4;
      const air = bp.run(noise()) * Math.exp(-t / 0.025) * 0.6;
      v[i] = (sub * 0.9 + body + air) * Math.min(1, t / 0.0015);
    }
    return withVerb(v, 0.5, { feedback: 0.8, damp: 0.5 });
  },
  pop() {
    const v = mono(0.25);
    let ph = 0;
    for (let i = 0; i < v.length; i++) {
      const t = i / SR;
      ph += (TAU * (480 + 700 * (1 - Math.exp(-t / 0.012)))) / SR;
      v[i] = Math.sin(ph) * Math.min(1, t / 0.001) * Math.exp(-t / 0.045);
    }
    return withVerb(pad(v, 0.4), 0.25, { feedback: 0.7 });
  },
  alert() {
    // soft descending two-note blip: something was found
    const v = mono(0.5);
    for (const [f, at, len] of [
      [mtof(76), 0, 0.075],
      [mtof(72), 0.075, 0.2],
    ]) {
      const s = Math.round(at * SR);
      for (let i = 0; i < len * SR + 0.15 * SR && s + i < v.length; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.004) * (t < len ? 1 : Math.exp(-(t - len) / 0.035)) * Math.exp(-t / 0.18);
        v[s + i] += (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t)) * env * 0.7;
      }
    }
    return withVerb(v, 0.3, { feedback: 0.75 });
  },
  ...Object.fromEntries(
    [2400, 3100, 2750].map((f, i) => [
      `key${i + 1}`,
      () => {
        const v = mono(0.08);
        const hp = new Biquad("hp", 1800);
        const bp = new Biquad("bp", f, 7);
        let ph = 0;
        for (let k = 0; k < v.length; k++) {
          const t = k / SR;
          ph += (TAU * 140) / SR;
          v[k] = hp.run(noise()) * Math.exp(-t / 0.003) * 0.6 + bp.run(noise()) * Math.exp(-t / 0.012) * 2 + Math.sin(ph) * Math.exp(-t / 0.008) * 0.35;
        }
        return toStereo(v);
      },
    ]),
  ),
  click() {
    const v = mono(0.16);
    for (const [at, g] of [
      [0, 1],
      [0.05, 0.55],
    ]) {
      const bp = new Biquad("bp", 3800, 3);
      const tick = new Biquad("bp", 1700, 9);
      const s = Math.round(at * SR);
      for (let i = 0; s + i < v.length; i++) {
        const t = i / SR;
        v[s + i] += (bp.run(noise()) * Math.exp(-t / 0.0025) * 1.6 + tick.run(noise()) * Math.exp(-t / 0.01) * 2.5) * g;
      }
    }
    return toStereo(v);
  },
  whoosh() {
    const len = 0.7;
    const v = noiseSweep(len, 240, 3200, 1.3, (p) => (p < 0.55 ? (p / 0.55) ** 2 : ((1 - p) / 0.45) ** 1.5), 1);
    // pan the whoosh left → right
    const L = mono(len);
    const R = mono(len);
    for (let i = 0; i < v.length; i++) {
      const p = i / v.length;
      L[i] = v[i] * Math.cos((p * Math.PI) / 2);
      R[i] = v[i] * Math.sin((p * Math.PI) / 2);
    }
    return [L, R];
  },
  sweep() {
    // the scan beam: an airy sweep with a faint tonal shimmer
    const len = 1.3;
    const v = noiseSweep(len, 500, 5200, 0.9, (p) => Math.sin(Math.PI * p) ** 1.5, 0.8);
    for (let i = 0; i < v.length; i++) {
      const t = i / SR;
      const p = i / v.length;
      const f = 700 + 500 * p;
      v[i] += Math.sin(TAU * f * t) * (0.5 + 0.5 * Math.sin(TAU * 16 * t)) * Math.sin(Math.PI * p) * 0.12;
    }
    return withVerb(v, 0.25, { feedback: 0.75 });
  },
  tick() {
    const v = mono(0.1);
    for (let i = 0; i < v.length; i++) {
      const t = i / SR;
      v[i] = Math.sin(TAU * 2350 * t) * Math.exp(-t / 0.011) + noise() * Math.exp(-t / 0.0015) * 0.3;
    }
    return withVerb(pad(v, 0.3), 0.15, { feedback: 0.7 });
  },
  chime() {
    // success: a rising fifth on two bells
    const v = mono(1.8);
    for (const [f, at] of [
      [mtof(79), 0],
      [mtof(86), 0.09],
    ]) {
      const b = bell(f, 1.6, 0.6, 2.01);
      const s = Math.round(at * SR);
      for (let i = 0; i < b.length && s + i < v.length; i++) v[s + i] += b[i];
    }
    return withVerb(v, 0.45, { feedback: 0.82, damp: 0.25 });
  },
  ding1: () => withVerb(bell(mtof(84), 1.1, 0.7, 2.01), 0.3, { feedback: 0.78 }),
  ding2: () => withVerb(bell(mtof(88), 1.1, 0.7, 2.01), 0.3, { feedback: 0.78 }),
  ding3: () => withVerb(bell(mtof(91), 1.1, 0.7, 2.01), 0.3, { feedback: 0.78 }),
  riser() {
    const len = 1.05;
    const v = noiseSweep(len, 400, 6000, 2.2, (p) => p ** 2 * (p < 0.94 ? 1 : (1 - p) / 0.06), 0.8);
    let ph = 0;
    for (let i = 0; i < v.length; i++) {
      const p = i / v.length;
      ph += (TAU * (330 * 2 ** (2 * p))) / SR;
      v[i] += Math.sin(ph) * p ** 1.5 * (p < 0.94 ? 1 : (1 - p) / 0.06) * 0.22;
    }
    return toStereo(v);
  },
  bloom() {
    // the mark opens: a soft major swell with a bell figure on top
    const len = 2.6;
    const v = mono(len);
    for (const m of [72, 76, 79, 86]) {
      const f = mtof(m);
      for (let i = 0; i < v.length; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.18) * Math.exp(-t / 0.9);
        v[i] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 1.003 * t)) * env * 0.16;
      }
    }
    [84, 91, 96].forEach((m, k) => {
      const b = bell(mtof(m), 1.6, 0.35, 3.5);
      const s = Math.round(k * 0.08 * SR);
      for (let i = 0; i < b.length && s + i < v.length; i++) v[s + i] += b[i];
    });
    const hp = new Biquad("hp", 6000);
    for (let i = 0; i < v.length; i++) v[i] += hp.run(noise()) * Math.exp(-(i / SR) / 0.5) * 0.05;
    return withVerb(v, 0.6, { feedback: 0.86, damp: 0.25 });
  },
};

// ── write ───────────────────────────────────────────────────────────────────

const started = Date.now();
writeWav(join(OUT, "music.wav"), music());
for (const [name, make] of Object.entries(SFX)) writeWav(join(OUT, "sfx", `${name}.wav`), normalize(make(), -3));
console.log(`audio written to ${OUT} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
