#!/usr/bin/env node
/**
 * Synthesizes the promo's soundtrack and sound effects from oscillators and
 * noise — no samples, nothing to license. Deterministic: the same seed always
 * writes the same files.
 *
 *   node scripts/make-audio.mjs
 *
 * Writes public/audio/music.wav (26 s, 120 BPM — beat = 15 frames at 30 fps,
 * matching src/timeline.ts) and public/audio/sfx/*.wav (see src/components/Sfx.tsx).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
const SR = 48000;
const BEAT = 0.5; // 120 BPM
const LENGTH = 26;

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

function bass(midi, len, gain = 1) {
  const v = mono(len + 0.05);
  const f = mtof(midi);
  const lp = new Biquad("lp", 520, 0.9);
  const hp = new Biquad("hp", 38, 0.7);
  let ph = 0;
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    const env = Math.min(1, t / 0.006) * (t < len ? 1 - 0.45 * (t / len) : Math.exp(-(t - len) / 0.02));
    const s = 0.8 * Math.sin(TAU * ph) + 0.6 * saw(ph, f / SR);
    v[i] = hp.run(Math.tanh(lp.run(s) * 1.2)) * env * gain;
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

/** brightness 0..1 scales how far the filter envelope opens. */
function pluck(midi, gain = 1, brightness = 1) {
  const v = mono(0.5);
  const f = mtof(midi);
  const lp = new Biquad("lp", 3000, 1.1);
  let ph = rand();
  for (let i = 0; i < v.length; i++) {
    const t = i / SR;
    if (i % 32 === 0) lp.set(450 + 3400 * brightness * Math.exp(-t / 0.05));
    ph = (ph + f / SR) % 1;
    const sq = ph < 0.3 ? 1 : -1;
    const s = 0.6 * saw(ph, f / SR) + 0.4 * sq;
    v[i] = lp.run(s) * Math.min(1, t / 0.002) * Math.exp(-t / 0.13) * gain;
  }
  return v;
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

// ── the track ───────────────────────────────────────────────────────────────

const AM = [57, 60, 64, 67]; // Am7
const F = [53, 60, 64, 69]; // Fmaj7 (open)
const C = [55, 60, 64, 67]; // C/G
const G = [55, 59, 62, 67]; // G
// Bass roots one octave down (A1 F1 C2 G1); the saw's harmonics carry them on phone speakers.
const ROOT = new Map([
  [AM, 33],
  [F, 29],
  [C, 36],
  [G, 31],
]);

const DROP = 3; // the first cut (frame 90)
const END = 21; // end card (frame 630)
const FINAL = 24; // resolution

// One chord per bar (2 s) from the drop; scene cuts all fall on bar lines.
const BARS = [
  [3, AM],
  [5, F],
  [7, C],
  [9, G],
  [11, AM],
  [13, F],
  [15, C],
  [17, G],
  [19, AM],
  [21, F],
  [23, G],
  [24, C],
];
const chordAt = (t) => [...BARS].reverse().find(([s]) => t >= s)?.[1] ?? AM;

function music() {
  const main = stereo(LENGTH);
  const pads = stereo(LENGTH);
  const arps = stereo(LENGTH);
  const send = stereo(LENGTH);

  const kicks = [];
  for (let t = DROP; t < FINAL - 1e-6; t += BEAT) kicks.push(t);
  kicks.push(FINAL);
  for (const t of kicks) place(main, kick(t >= END ? 0.8 : 1), t, 0.8);

  // clap on 2 and 4 until the end card
  for (let t = DROP + BEAT; t < END; t += 2 * BEAT) {
    const c = clap();
    place(main, c, t, 0.34, 0.05);
    place(send, c, t, 0.25);
  }

  // hats: a 16th-note tick that builds through the intro, then the groove
  for (let t = 1; t < DROP; t += BEAT / 4) {
    const p = (t - 1) / (DROP - 1);
    place(main, hat(0.018, 1), t, 0.05 + 0.13 * p * p, 0.25);
  }
  for (let t = DROP; t < FINAL; t += BEAT / 4) {
    const step = Math.round((t - DROP) / (BEAT / 4)) % 4;
    const accent = step === 2 ? 1 : step === 0 ? 0.55 : 0.4;
    place(main, hat(0.022, 1), t, 0.11 * accent * (t >= END ? 0.7 : 1), step % 2 ? 0.3 : -0.2);
    if (step === 2 && t < END) place(main, hat(0.11, 1), t, 0.07, -0.35);
  }

  // crashes at the drop, each new scene, and the resolution
  place(main, crash(2.4, 1), DROP, 0.16, -0.2);
  for (const t of [9, 13, 17]) place(main, crash(1.4, 1), t, 0.07, 0.2);
  place(main, crash(3, 1), FINAL, 0.15, 0);
  for (const t of [DROP, FINAL]) place(send, crash(1.2, 1), t, 0.1);

  // intro riser into the drop
  place(
    main,
    noiseSweep(1.4, 350, 7000, 1.8, (p) => p * p * (p < 0.97 ? 1 : (1 - p) / 0.03), 1),
    DROP - 1.4,
    0.5,
  );

  // bass: house off-beats on the root
  for (let t = DROP; t < FINAL; t += BEAT) {
    const root = ROOT.get(chordAt(t));
    place(main, bass(root, 0.18, 1), t + BEAT / 2, 0.3);
  }
  place(main, bass(36, 1.2, 1), FINAL, 0.28);

  // pads: intro Am (dark), then one chord per bar, last one rings out
  placeStereo(pads, padChord(AM, DROP, { cutoff: 700, attack: 0.08, release: 0.5, gain: 1 }), 0, 0.85);
  BARS.forEach(([s, chord], i) => {
    const next = BARS[i + 1]?.[0] ?? LENGTH;
    const last = i === BARS.length - 1;
    placeStereo(pads, padChord(chord, next - s, { cutoff: last ? 2400 : 1900, attack: 0.04, release: last ? 1.6 : 0.4 }), s, 1);
  });

  // pluck arpeggio — enters when the agent starts writing the fix
  const pattern = [0, 1, 2, 3, 2, 3, 1, 2];
  let k = 0;
  for (let t = DROP; t < FINAL; t += BEAT / 4, k++) {
    const chord = chordAt(t);
    const m = chord[pattern[k % pattern.length]] + 12;
    const bright = t >= 9 ? 1 : 0.45;
    const level = t >= END ? 0.12 : t >= 9 ? 0.17 : 0.11;
    place(arps, pluck(m, 1, bright), t, level * (k % 4 === 0 ? 1 : 0.75), k % 2 ? 0.35 : -0.35);
  }

  // the resolution: a C major bell figure
  [72, 76, 79, 84].forEach((m, i) => {
    const b = bell(mtof(m), 2.2, 1);
    place(main, b, FINAL + i * 0.09, 0.12, (i - 1.5) * 0.3);
    place(send, b, FINAL + i * 0.09, 0.2);
  });

  // sidechain: pads and arps duck under every kick
  const duck = new Float32Array(main[0].length).fill(1);
  for (const t of kicks) {
    const s = Math.round(t * SR);
    for (let i = 0; i < SR * 0.4 && s + i < duck.length; i++) {
      duck[s + i] = Math.min(duck[s + i], 1 - 0.62 * Math.exp(-i / SR / 0.1));
    }
  }
  for (let c = 0; c < 2; c++)
    for (let n = 0; n < duck.length; n++) {
      pads[c][n] *= duck[n];
      arps[c][n] *= duck[n];
    }

  const padHp = [new Biquad("hp", 170, 0.7), new Biquad("hp", 170, 0.7)];
  for (let c = 0; c < 2; c++) for (let n = 0; n < pads[c].length; n++) pads[c][n] = padHp[c].run(pads[c][n]);
  addInto(main, pads, 0.5);
  addInto(send, pads, 0.25);
  addInto(main, pingPong(arps, 0.375, 0.38, 3200), 0.32);
  addInto(main, arps, 1);
  addInto(send, arps, 0.3);
  addInto(main, reverb(send, { feedback: 0.86, damp: 0.35 }), 0.9);

  // master: high-pass (no sub rumble, no DC), gentle saturation, fade the very end
  for (let c = 0; c < 2; c++) {
    const hp1 = new Biquad("hp", 34, 0.7);
    const hp2 = new Biquad("hp", 34, 0.7);
    for (let n = 0; n < main[c].length; n++) {
      const t = n / SR;
      const fade = t > LENGTH - 0.35 ? (LENGTH - t) / 0.35 : 1;
      main[c][n] = Math.tanh(hp2.run(hp1.run(main[c][n])) * 1.1) * fade;
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
