#!/usr/bin/env python3
"""synth.py: the showreel soundtrack, synthesised from nothing and locked to cues.js.

120 BPM. D minor while the site is losing customers, a pull through A major,
a groove under Find / Fix / Prove, and D major when the flower blooms.
Drums, bass, pads, plucks, bells, risers, whooshes and every UI tick are
generated here with numpy + scipy, so each sound lands on its picture cue.

    python3 audio/synth.py            -> out/olmene-showreel.wav (48 kHz, 24-bit)
"""
import json
import os
import re
import wave

import numpy as np
from scipy import signal

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = open(os.path.join(ROOT, 'cues.js')).read()
C = json.loads(re.split(r'^window\.CUES\s*=', SRC, flags=re.M)[1].strip().rstrip(';'))
DUR = C['duration']
N = int(round(DUR * SR))
BEAT = 60.0 / C['bpm']
rng = np.random.default_rng(20261013)

# ───────────────────────── buses ─────────────────────────
BUS = {k: np.zeros((2, N)) for k in ('drums', 'music', 'sfx', 'verb')}


def place(bus, sig, t0, gain=1.0, pan=0.0, send=0.0):
    """Mix a mono or stereo signal into a bus at time t0 (s), equal-power pan."""
    sig = np.asarray(sig, dtype=float)
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    i0 = int(round(t0 * SR))
    j0 = max(0, -i0)
    i0 = max(0, i0)
    n = min(sig.shape[1] - j0, N - i0)
    if n <= 0:
        return
    BUS[bus][:, i0:i0 + n] += gain * sig[:, j0:j0 + n]
    if send:
        BUS['verb'][:, i0:i0 + n] += gain * send * sig[:, j0:j0 + n]


# ───────────────────────── dsp helpers ─────────────────────────
def ts(n):
    return np.arange(n) / SR


def ns(sec):
    return max(1, int(round(sec * SR)))


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    w = noise(n)
    b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w) * 3.5


def sos(kind, f, order=2):
    if kind == 'bp':
        return signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype='band', output='sos')
    return signal.butter(order, f / (SR / 2), btype={'lp': 'low', 'hp': 'high'}[kind], output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def svf(x, fc, q=0.707, mode='lp'):
    """Time-varying TPT state-variable filter (fc may be an array, Hz)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    out = np.empty_like(x)
    ic1 = ic2 = 0.0
    xs, a1l, a2l, a3l = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    for i in range(len(xs)):
        v3 = xs[i] - ic2
        v1 = a1l[i] * ic1 + a2l[i] * v3
        v2 = ic2 + a2l[i] * ic1 + a3l[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if mode == 'lp' else v1 if mode == 'bp' else xs[i] - k * v1 - v2
    return out


def logsweep(n, f0, f1, shape=1.0):
    u = np.linspace(0, 1, n) ** shape
    return f0 * (f1 / f0) ** u


def osc_phase(freq, n):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return 2 * np.pi * np.cumsum(f) / SR


def saw(freq, n, phase0=0.0):
    ph = (osc_phase(freq, n) / (2 * np.pi) + phase0) % 1.0
    return 2 * ph - 1


def env_ad(n, a, d):
    t = ts(n)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def env_asr(n, a, r):
    t = ts(n)
    e = np.minimum(1, t / max(a, 1e-4))
    rel = ns(r)
    if rel < n:
        e[-rel:] *= np.linspace(1, 0, rel) ** 1.5
    return e


def bezier(x1, y1, x2, y2):
    """The same cubic-bezier easing the picture uses (engine.js)."""
    def f(x):
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0
        lo, hi, u = 0.0, 1.0, x
        for _ in range(60):
            v = 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u ** 2 * (1 - u) + u ** 3
            if abs(v - x) < 1e-9:
                break
            if v < x:
                lo = u
            else:
                hi = u
            u = (lo + hi) / 2
        return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u ** 2 * (1 - u) + u ** 3
    return f


NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(name):
    m = re.match(r'([A-G][#b]?)(-?\d)', name)
    midi = 12 * (int(m.group(2)) + 1) + NOTE[m.group(1)]
    return 440.0 * 2 ** ((midi - 69) / 12)


# ───────────────────────── instruments ─────────────────────────
def kick(f0=160, f1=46, length=0.5, tone=0.16):
    n = ns(length)
    t = ts(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    body = np.sin(osc_phase(f, n)) * (np.exp(-t / tone) * 0.85 + 0.15 * np.exp(-t / (length * 0.5)))
    click = filt(noise(n), 'hp', 1800) * np.exp(-t / 0.0035) * 0.22 * np.minimum(1, t / 0.0006)
    x = body + click
    return np.tanh(1.7 * x) / np.tanh(1.7)


def boom(length=2.6, f0=64, f1=29):
    n = ns(length)
    t = ts(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.35)
    return np.sin(osc_phase(f, n)) * np.minimum(1, t / 0.006) * np.exp(-t / 0.85)


def heartbeat(strength=1.0):
    n = ns(1.2)
    t = ts(n)
    f = 38 + 50 * np.exp(-t / 0.05)
    x = np.sin(osc_phase(f, n)) * np.minimum(1, t / 0.004) * np.exp(-t / 0.28)
    x += filt(noise(n), 'lp', 300) * np.exp(-t / 0.03) * 0.25
    return np.tanh(1.4 * x * strength)


def clap(length=0.45):
    n = ns(length)
    t = ts(n)
    e = np.zeros(n)
    for k, dt in enumerate((0.0, 0.009, 0.019)):
        e += (t >= dt) * np.exp(-np.maximum(0, t - dt) / 0.0055) * (0.8 + 0.1 * k)
    e += (t >= 0.026) * np.exp(-np.maximum(0, t - 0.026) / 0.085) * 0.55
    return filt(noise(n), 'bp', (950, 4800)) * e * np.minimum(1, t / 0.0008)


def snare(length=0.3):
    n = ns(length)
    t = ts(n)
    tone = np.sin(osc_phase(196 + 40 * np.exp(-t / 0.02), n)) * np.exp(-t / 0.05) * 0.5
    nz = filt(noise(n), 'bp', (1400, 7000)) * np.exp(-t / 0.07)
    return (tone + nz) * np.minimum(1, t / 0.0007)


def hat(closed=True):
    n = ns(0.06 if closed else 0.35)
    t = ts(n)
    x = filt(noise(n), 'hp', 7400, 4) * np.exp(-t / (0.022 if closed else 0.14)) * np.minimum(1, t / 0.0005)
    return filt(x, 'lp', 15000)


def crash(length=3.2, bright=1.0):
    n = ns(length)
    t = ts(n)
    nz = filt(filt(noise(n), 'hp', 3800, 2), 'lp', 13000) * np.exp(-t / 0.95)
    metal = np.zeros(n)
    for f in (3170, 4415, 5911, 7067, 8317, 9913):
        metal += np.sign(np.sin(osc_phase(f * (1 + 0.002 * rng.standard_normal()), n)))
    metal = filt(metal, 'hp', 5200) * np.exp(-t / 0.55) * 0.06 * bright
    x = (nz * 0.8 + metal) * np.minimum(1, t / 0.002)
    return np.vstack([x, np.roll(x, 37)])


def bass_note(freq, length=0.23, cut0=2000, cut1=230):
    n = ns(length)
    t = ts(n)
    x = 0.55 * saw(freq, n) + 0.55 * np.sin(osc_phase(freq, n)) + 0.35 * np.sin(osc_phase(freq / 2, n))
    fc = cut1 + (cut0 - cut1) * np.exp(-t / 0.055)
    x = svf(x, fc, q=0.9)
    amp = np.minimum(1, t / 0.004) * (0.55 + 0.45 * np.exp(-t / 0.09))
    rel = ns(0.03)
    amp[-rel:] *= np.linspace(1, 0, rel)
    return np.tanh(1.3 * x * amp)


def pad(freqs, length, attack=0.35, release=0.7, cutoff=1500, level=1.0, air=0.0):
    n = ns(length)
    L = np.zeros(n)
    R = np.zeros(n)
    for f in freqs:
        for k, dc in enumerate((-9, -3, 4, 10)):
            v = saw(f * 2 ** (dc / 1200), n, rng.random())
            (L if k % 2 == 0 else R)[:] += v
            (R if k % 2 == 0 else L)[:] += 0.18 * v
    L = filt(L, 'lp', cutoff, 2)
    R = filt(R, 'lp', cutoff, 2)
    e = env_asr(n, attack, release)
    st = np.vstack([L, R]) * e / (len(freqs) * 3.2) * level
    if air:
        a = filt(pink(n), 'bp', (3000, 9000)) * e * air * 0.03
        st += np.vstack([a, np.roll(a, 211)])
    return st


def pluck(freq, length=0.32, bright=4200):
    n = ns(length)
    t = ts(n)
    x = 0.7 * saw(freq, n) + 0.3 * np.sign(np.sin(osc_phase(freq * 1.002, n)))
    fc = 380 + bright * np.exp(-t / 0.045)
    x = svf(x, fc, q=1.1)
    return x * np.minimum(1, t / 0.002) * np.exp(-t / 0.11)


def bell(freq, length=2.4, ratio=3.5, index=2.2, decay=0.9):
    n = ns(length)
    t = ts(n)
    mod = np.sin(osc_phase(freq * ratio, n)) * index * np.exp(-t / 0.22)
    x = np.sin(osc_phase(freq, n) + mod) * np.exp(-t / decay)
    x += 0.22 * np.sin(osc_phase(freq * 2.756, n)) * np.exp(-t / (decay * 0.35))
    x += 0.10 * np.sin(osc_phase(freq * 5.404, n)) * np.exp(-t / (decay * 0.15))
    return x * np.minimum(1, t / 0.0015)


def mallet(freq, length=0.9):
    n = ns(length)
    t = ts(n)
    x = np.sin(osc_phase(freq, n)) * np.exp(-t / 0.28)
    x += 0.3 * np.sin(osc_phase(freq * 3.99, n)) * np.exp(-t / 0.05)
    x += 0.12 * np.sin(osc_phase(freq * 9.8, n)) * np.exp(-t / 0.012)
    return x * np.minimum(1, t / 0.0015)


def glass(freq, length=0.5):
    n = ns(length)
    t = ts(n)
    x = np.sin(osc_phase(freq, n)) * np.exp(-t / 0.12)
    x += 0.4 * np.sin(osc_phase(freq * 2.01, n)) * np.exp(-t / 0.05)
    return x * np.minimum(1, t / 0.001)


def thock(pitch=140, bright=1.0, length=0.16):
    """A weighty key press: low knock + bright click."""
    n = ns(length)
    t = ts(n)
    low = np.sin(osc_phase(pitch * (1 + 0.6 * np.exp(-t / 0.01)), n)) * np.exp(-t / 0.035)
    clk = filt(noise(n), 'bp', (1800, 6500)) * np.exp(-t / 0.0045) * 0.55 * bright * np.minimum(1, t / 0.0005)
    return low + clk


def key_click(bright=1.0):
    n = ns(0.03)
    t = ts(n)
    return (filt(noise(n), 'bp', (2200, 8000)) * np.exp(-t / 0.0028) * bright + np.sin(osc_phase(1800, n)) * np.exp(-t / 0.004) * 0.25) * np.minimum(1, t / 0.0004)


def tick(freq=2600, length=0.04, d=0.006):
    n = ns(length)
    t = ts(n)
    return (np.sin(osc_phase(freq, n)) * np.exp(-t / d) + filt(noise(n), 'hp', 5000) * np.exp(-t / 0.0015) * 0.3) * np.minimum(1, t / 0.0004)


def blip(f0, f1, length=0.1):
    n = ns(length)
    t = ts(n)
    f = f1 + (f0 - f1) * np.exp(-t / (length * 0.25))
    return np.sin(osc_phase(f, n)) * np.minimum(1, t / 0.002) * np.exp(-t / (length * 0.35))


def whoosh(length, f0, f1, q=1.4, shape='bell', curve=1.0):
    n = ns(length)
    u = np.linspace(0, 1, n)
    x = svf(pink(n), logsweep(n, f0, f1, curve), q=q, mode='bp')
    if shape == 'bell':
        e = np.sin(np.pi * u) ** 1.6
    elif shape == 'rise':
        e = u ** 2.2
    else:
        e = (1 - u) ** 2
    return x * e


def riser(length, f0=250, f1=7000):
    n = ns(length)
    u = np.linspace(0, 1, n)
    nz = svf(pink(n), logsweep(n, f0, f1, 1.4), q=0.9, mode='hp') * u ** 2.4
    pitch = 220 * 2 ** (u ** 1.6 * 1.0)
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(4 + 22 * u ** 2) / SR)
    tone = filt(saw(pitch, n) + saw(pitch * 1.5, n) * 0.5, 'lp', 2600) * u ** 2.0 * trem * 0.35
    return nz + tone


def reverse_swell(src, length):
    """Reverse reverb: the tail arrives before the sound."""
    wet = signal.fftconvolve(src, IR_MONO)[: ns(length)]
    wet = wet[::-1]
    return wet / (np.max(np.abs(wet)) + 1e-9)


# ───────────────────────── reverb ─────────────────────────
def make_ir(rt60=2.1, length=3.2):
    n = ns(length)
    t = ts(n)
    chans = []
    for c in range(2):
        nz = rng.standard_normal(n)
        dark = filt(nz, 'lp', 2400)
        w = np.minimum(1, t / 1.2)
        x = (nz * (1 - w) + dark * w * 1.6) * np.exp(-6.9 * t / rt60)
        x[: ns(0.012)] = 0
        for k in range(7):
            d = ns(0.014 + 0.011 * k + 0.004 * c)
            x[d] += (0.45 - 0.05 * k) * (1 if (k + c) % 2 else -1)
        chans.append(x)
    ir = np.vstack(chans)
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR = make_ir()
IR_MONO = IR[0]

# ───────────────────────── score ─────────────────────────
H, A, F, X, P, L = C['hook'], C['answer'], C['find'], C['fix'], C['prove'], C['logo']

# ── 1 · hook: heartbeat, words, the dissolve ──
place('drums', heartbeat(1.0), H['ignite'], 0.95)
place('drums', heartbeat(0.8), H['pulse'], 0.8)
place('sfx', glass(hz('D7'), 0.9), H['ignite'] + 0.005, 0.10, 0.1, send=0.6)
drone = pad([hz('D2'), hz('A2')], 2.6, attack=1.1, release=0.6, cutoff=600, level=0.55, air=0.6)
place('music', drone, 0.0, 0.9)
sub = np.sin(osc_phase(hz('D1'), ns(2.4))) * env_asr(ns(2.4), 0.8, 0.5)
place('music', sub, 0.0, 0.18)
for i, tw in enumerate(H['words'][:4]):
    place('sfx', thock(130 + 12 * i, 1.0), tw, 0.55, (-0.25 + 0.17 * i), send=0.15)
place('sfx', thock(96, 1.2, 0.3), H['words'][4], 0.75, 0.0, send=0.3)
place('drums', boom(1.6, 70, 34), H['words'][4], 0.55)
# clock ticks under the line
for k in range(int((2.0 - 0.5) / (BEAT / 4))):
    tt = 0.5 + k * BEAT / 4
    place('drums', hat(True), tt, 0.10 + (0.05 if k % 4 == 2 else 0), 0.35 if k % 2 else -0.35)
# the dissolve: grains of sand blown left to right
d0, d1 = H['dissolve']
for k in range(420):
    u = rng.random() ** 0.8
    tt = d0 + (d1 - d0 + 0.35) * u
    g = (1 - u) ** 0.6 * (0.3 + 0.7 * rng.random())
    n = ns(0.004 + 0.006 * rng.random())
    grain = filt(noise(n), 'bp', (2500 + 3000 * rng.random(), 9000)) * np.hanning(n)
    place('sfx', grain, tt, 0.22 * g, -0.7 + 1.5 * u + 0.2 * rng.standard_normal(), send=0.2)
place('sfx', whoosh(0.9, 900, 5200, q=0.8, shape='bell'), d0 + 0.05, 0.16, 0.4, send=0.3)

# ── 2 · answer: an ascending phrase, the reverse swell, the dot ──
for i, (tw, nm) in enumerate(zip(A['words'], ('D4', 'F4', 'A4', 'D5'))):
    place('music', mallet(hz(nm)), tw, 0.36, -0.2 + 0.13 * i, send=0.35)
pop = bell(hz('A5'), 1.2, ratio=2.0, index=1.2, decay=0.5)
place('sfx', reverse_swell(pop, 0.75), A['dot'] - 0.75, 0.32, 0.2)
place('sfx', pop, A['dot'], 0.30, 0.25, send=0.5)
place('drums', heartbeat(0.9), A['dot'], 0.55)
place('drums', heartbeat(0.7), A['pulse'], 0.5)
place('music', pad([hz('D3'), hz('F3'), hz('A3'), hz('E4')], 1.12, attack=0.4, release=0.22, cutoff=1800, level=0.9), 2.0, 0.55)
place('music', pad([hz('A2'), hz('C#3'), hz('E3'), hz('A3')], 1.05, attack=0.25, release=0.1, cutoff=2400, level=0.9, air=1.0), 3.0, 0.6)
place('music', bass_note(hz('A1'), 0.9, 900, 160), 3.0, 0.5)
# build into the drop: riser, snare roll, the zoom whoosh
place('sfx', riser(0.96), 3.0, 0.42, 0.0)
roll_t = 3.0
while roll_t < 3.94:
    u = (roll_t - 3.0) / 0.94
    place('drums', snare(0.16), roll_t, 0.10 + 0.22 * u, 0.15 * np.sin(roll_t * 40))
    roll_t += BEAT / 2 if u < 0.35 else BEAT / 4 if u < 0.7 else BEAT / 8
place('sfx', whoosh(A['zoom'][1] - A['zoom'][0] + 0.12, 300, 6000, q=1.1, shape='rise', curve=2.2), A['zoom'][0], 0.6, 0.0, send=0.25)
rc = crash(1.4)[:, ::-1] * np.linspace(0, 1, ns(1.4)) ** 2.5
place('drums', rc, F['drop'] - rc.shape[1] / SR, 0.22)

# ── 3–5 · the groove under Find / Fix / Prove ──
g0, g1 = F['drop'], 11.25
CHORDS = [  # bar start, root, chord tones
    (4.0, 'D2', ['D3', 'F3', 'A3', 'E4']),
    (6.0, 'Bb1', ['Bb2', 'D3', 'F3', 'C4']),
    (8.0, 'F2', ['F3', 'A3', 'C4', 'G4']),
    (10.0, 'C2', ['C3', 'E3', 'G3', 'D4']),
]
ARP = {
    4.0: ['D4', 'A4', 'F4', 'A4', 'D5', 'A4', 'F4', 'E4'],
    6.0: ['Bb3', 'F4', 'D4', 'F4', 'Bb4', 'F4', 'D4', 'C4'],
    8.0: ['F4', 'C5', 'A4', 'C5', 'F5', 'C5', 'A4', 'G4'],
    10.0: ['C4', 'G4', 'E4', 'G4', 'C5', 'G4', 'E4', 'D4'],
}
kicks = []
b = g0
while b < g1 - 1e-6:
    kicks.append(b)
    place('drums', kick(), b, 0.9)
    beat_in_bar = int(round((b - g0) / BEAT)) % 4
    if beat_in_bar in (1, 3):
        place('drums', clap(), b, 0.42, 0.05, send=0.22)
    place('drums', hat(True), b + BEAT / 2, 0.24, 0.3)
    place('drums', hat(True), b + BEAT / 4, 0.07, -0.3)
    place('drums', hat(True), b + 3 * BEAT / 4, 0.07, -0.3)
    b += BEAT
for (bt, root, tones) in CHORDS:
    end = min(bt + 2.0, g1)
    if end <= bt:
        continue
    place('music', pad([hz(x) for x in tones], end - bt + 0.25, attack=0.08, release=0.3, cutoff=2000, level=1.0, air=0.5), bt, 0.42)
    pattern = [1, 1, 2, 1, 1, 2, 1, 1.5]
    for k in range(16):
        tt = bt + k * BEAT / 2
        if tt >= g1:
            break
        m = pattern[k % 8]
        place('music', bass_note(hz(root) * m), tt, 0.5)
    arp = ARP[bt]
    for k in range(16):
        tt = bt + k * BEAT / 4 + BEAT / 8 * 0
        if tt >= g1:
            break
        nm = arp[k % 8]
        place('music', pluck(hz(nm)), tt, 0.085 + (0.03 if k % 4 == 0 else 0), 0.45 if k % 2 else -0.45, send=0.25)
place('drums', crash(3.4, 1.2), g0, 0.42, send=0.2)
place('drums', boom(2.2, 66, 30), g0, 0.6)
place('drums', crash(2.0, 0.8), 8.0, 0.18)
for k in range(4):
    place('drums', snare(0.2), 11.0 + k * BEAT / 8, 0.14 + 0.06 * k, 0.1)

# ── Find SFX ──
for k in range(8):
    place('sfx', key_click(0.9), F['type'][0] + k * (F['type'][1] - F['type'][0]) / 8, 0.3, 0.35 + 0.02 * k)
place('sfx', whoosh(0.35, 400, 2600, q=0.9), F['load'] - 0.05, 0.18, 0.3)
b0, b1 = F['beam']
scan = whoosh(b1 - b0, 5200, 1500, q=2.2, shape='bell', curve=1.0)
place('sfx', scan, b0, 0.28, 0.35, send=0.2)
hum = np.sin(osc_phase(hz('A5'), ns(b1 - b0))) * np.sin(np.pi * np.linspace(0, 1, ns(b1 - b0))) ** 2
place('sfx', hum * (0.6 + 0.4 * np.sin(2 * np.pi * 8 * ts(ns(b1 - b0)))), b0, 0.025, 0.35)
for k in range(21):
    place('sfx', tick(3400 + 40 * k, 0.03, 0.004), b0 + (k + 1) * (b1 - b0) / 21.4, 0.09, 0.4)
for k, tp in enumerate(F['pins']):
    place('sfx', blip(1250, 760, 0.13), tp, 0.34, [0.45, 0.2, 0.35][k], send=0.25)
    place('sfx', blip(620, 460, 0.12), tp + 0.045, 0.2, [0.45, 0.2, 0.35][k], send=0.25)
place('sfx', blip(520, 400, 0.12), F['result'], 0.26, 0.4, send=0.2)
place('sfx', blip(400, 300, 0.14), F['result'] + 0.09, 0.26, 0.4, send=0.2)
place('sfx', whoosh(F['zoom'][1] - F['zoom'][0] + 0.06, 220, 5000, q=1.0, shape='rise', curve=2.6), F['zoom'][0], 0.7, 0.0, send=0.2)
# the impact: the rust dot slams into the struck line
place('drums', kick(140, 40, 0.6, 0.2), X['cut'], 0.9)
place('drums', boom(1.8, 75, 32), X['cut'], 0.55)
place('sfx', filt(noise(ns(0.5)), 'lp', 2600) * env_ad(ns(0.5), 0.002, 0.09), X['cut'], 0.45, 0.0, send=0.5)

# ── Fix SFX ──
place('sfx', whoosh(0.2, 6000, 1800, q=1.6, shape='fall'), X['strike'], 0.28, 0.25)
for i, tl in enumerate(X['lines']):
    for k in range(7):
        place('sfx', key_click(0.8 + 0.2 * rng.random()), tl + k * 0.03 + 0.004 * rng.random(), 0.16, 0.15 + 0.05 * i)
    place('sfx', whoosh(0.5, 2000, 9000, q=0.7, shape='bell'), tl + 0.12, 0.06, 0.3, send=0.3)
for k, tc in enumerate(X['checks']):
    place('sfx', glass(hz(['D6', 'F6', 'Bb6'][k]), 0.35), tc, 0.13, 0.25, send=0.35)
place('sfx', whoosh(X['cursor'][1] - X['cursor'][0], 900, 2800, q=0.9, shape='bell'), X['cursor'][0], 0.07, 0.5)
place('sfx', key_click(1.4), X['click'], 0.55, 0.0)
place('sfx', thock(180, 0.6, 0.08), X['click'] + 0.004, 0.35, 0.0)
place('sfx', bell(hz('C6'), 1.0, ratio=2.0, index=1.0, decay=0.35), X['toast'], 0.13, 0.15, send=0.45)
place('sfx', bell(hz('F6'), 1.2, ratio=2.0, index=1.0, decay=0.45), X['toast'] + 0.09, 0.13, 0.15, send=0.45)
for k, nm in enumerate(('F5', 'A5', 'C6', 'F6')):
    place('sfx', bell(hz(nm), 1.4, ratio=2.0, index=0.8, decay=0.5), X['merged'] + 0.045 * k, 0.12, -0.1 + 0.1 * k, send=0.5)
fr = X['flyRing']
place('sfx', whoosh(fr[1] - fr[0] + 0.1, 500, 4200, q=1.3, shape='bell', curve=1.3), fr[0], 0.45, 0.0, send=0.25)
place('drums', heartbeat(0.7), P['land'], 0.5)

# ── Prove SFX ──
ease_count = bezier(0.5, 0, 0.12, 1)
c0, c1 = P['count']
last = 61
steps = 4000
for s in range(steps + 1):
    u = s / steps
    v = 61 + 33 * ease_count(u)
    if int(v) > last:
        last = int(v)
        frac = (last - 61) / 33
        place('sfx', tick(1500 * 2 ** (frac * 1.0), 0.05, 0.007), c0 + u * (c1 - c0), 0.15, -0.15)
place('drums', boom(2.0, 70, 31), c1, 0.5)
place('drums', crash(3.0, 1.0), c1, 0.32, send=0.2)
for nm in ('C4', 'E4', 'G4', 'C5', 'E5'):
    place('music', bell(hz(nm), 1.8, ratio=2.0, index=1.4, decay=0.6), c1, 0.07, 0.0, send=0.35)
for k, tm in enumerate(P['markers']):
    place('sfx', bell(hz(['G5', 'A5', 'C6'][k]), 1.2, ratio=3.0, index=1.0, decay=0.4), tm, 0.11, 0.55, send=0.4)
k0, k1 = P['kpi']
lastk = 0
for s in range(2001):
    u = s / 2000
    v = 38 * (1 - (1 - u) ** 3)
    if int(round(v)) > lastk:
        lastk = int(round(v))
        place('sfx', tick(4200, 0.025, 0.003), k0 + u * (k1 - k0), 0.035, 0.6)
for tp in (P['chart'][1], P['chart'][1] + 0.5):
    place('sfx', glass(hz('A6'), 0.3), tp, 0.05, 0.65, send=0.4)

# ── the pull to the logo: implode, travel, charge ──
place('music', pad([hz('A2'), hz('C#3'), hz('E3'), hz('G3'), hz('A3')], 12.0 - 11.25, attack=0.5, release=0.02, cutoff=2600, level=1.0, air=1.2), 11.25, 0.5)
place('music', bass_note(hz('A1'), 0.7, 800, 140), 11.25, 0.45)
im0, im1 = P['implode']
place('sfx', whoosh(im1 - im0 + 0.05, 5200, 280, q=1.2, shape='rise', curve=0.7), im0, 0.65, 0.4, send=0.2)
rc2 = crash(1.2)[:, ::-1] * np.linspace(0, 1, ns(1.2)) ** 2.5
place('drums', rc2, L['hit'] - rc2.shape[1] / SR - 0.02, 0.3)
dc0, dc1 = P['dotCenter']
gl = np.sin(osc_phase(logsweep(ns(dc1 - dc0), hz('A5'), hz('D6')), ns(dc1 - dc0))) * np.sin(np.pi * np.linspace(0, 1, ns(dc1 - dc0))) ** 0.8
for k in range(8):
    seg = gl[k * len(gl) // 8:(k + 1) * len(gl) // 8]
    place('sfx', seg, dc0 + k * (dc1 - dc0) / 8, 0.09, 0.6 - 0.6 * k / 7)
ch0, ch1 = P['charge']
place('sfx', riser(ch1 - ch0 + 0.02, 900, 9000), ch0, 0.35, 0.0)

# ── 6 · the bloom ──
hit = L['hit']
place('drums', kick(170, 44, 0.8, 0.24), hit, 1.0)
place('drums', boom(3.0, 62, 27), hit, 0.85)
place('drums', crash(3.6, 1.3), hit, 0.5, send=0.35)
dmaj = [hz(x) for x in ('D3', 'F#3', 'A3', 'D4', 'F#4', 'A4')]
place('music', pad(dmaj, DUR - hit, attack=0.04, release=1.4, cutoff=2600, level=1.15, air=1.6), hit, 0.62)
place('music', bass_note(hz('D2'), 2.4, 900, 120), hit, 0.55)
for k, nm in enumerate(('D5', 'F#5', 'A5', 'D6', 'F#6')):
    place('music', bell(hz(nm), 2.6, ratio=2.0, index=1.6, decay=1.1), hit + 0.02 + k * L['petalStagger'], 0.12, -0.5 + 0.25 * k, send=0.55)
for k in range(6):
    place('sfx', key_click(0.5), L['word'] + k * 0.05 + 0.08, 0.06, -0.25 + 0.1 * k)
for k, (tg, nm) in enumerate(zip(L['tag'], ('A4', 'B4', 'D5'))):
    place('music', mallet(hz(nm), 1.4), tg, 0.34, -0.2 + 0.2 * k, send=0.45)
    place('music', bell(hz(nm) * 2, 1.6, ratio=2.0, index=0.8, decay=0.6), tg, 0.06, -0.2 + 0.2 * k, send=0.5)
place('sfx', glass(hz('F#6'), 0.6), L['url'], 0.08, 0.0, send=0.5)
place('sfx', key_click(0.8), L['url'], 0.12, 0.0)

# ───────────────────────── mix ─────────────────────────
# sidechain: the music breathes with the kick
sc = np.ones(N)
for kt in kicks + [X['cut'], hit]:
    i0 = int(kt * SR)
    n = min(ns(0.32), N - i0)
    t = ts(n)
    sc[i0:i0 + n] = np.minimum(sc[i0:i0 + n], 1 - 0.55 * np.exp(-t / 0.09) * np.minimum(1, t / 0.004 + 0.4))
music = BUS['music'] * sc
# widen the music above 200 Hz (mid/side), keep the low end mono
mid, side = (music[0] + music[1]) / 2, (music[0] - music[1]) / 2
side = filt(side, 'hp', 200) * 1.7
music = np.vstack([mid + side, mid - side])
drums = BUS['drums']
sfx = BUS['sfx']
wet = np.vstack([signal.fftconvolve(BUS['verb'][0], IR[0])[:N], signal.fftconvolve(BUS['verb'][1], IR[1])[:N]])
wet = np.vstack([filt(w, 'hp', 180) for w in wet])
out = drums * 0.95 + music * 0.85 + sfx * 0.9 + wet * 0.22

# the breath before the bloom: everything drops out for a moment
gap = np.ones(N)
gi0, gi1 = int((hit - 0.03) * SR), int(hit * SR)
gap[gi0:gi1] = np.linspace(1, 0.08, gi1 - gi0)
out[:, :gi1] *= gap[:gi1]

out = np.vstack([filt(ch, 'hp', 24) for ch in out])

# glue compression (feed-forward, RMS detector)
mono = np.sqrt(np.mean(out ** 2, axis=0))
win = ns(0.02)
rms = np.sqrt(signal.fftconvolve(mono ** 2, np.ones(win) / win, mode='same') + 1e-12)
thr, ratio = 0.18, 2.2
gain = np.where(rms > thr, (thr / rms) ** (1 - 1 / ratio), 1.0)
gain = signal.sosfilt(sos('lp', 8), gain)
out *= gain

# K-weighted loudness (BS.1770) -> -14 LUFS
def lufs(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=1), axis=1)
    blk, hop = ns(0.4), ns(0.1)
    zs = np.array([np.mean(np.sum(y[:, i:i + blk] ** 2, axis=0)) for i in range(0, y.shape[1] - blk, hop)])
    lk = -0.691 + 10 * np.log10(zs + 1e-12)
    g = zs[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = zs[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(np.mean(g2))

out *= 10 ** ((-14.0 - lufs(out)) / 20)
# true-peak-ish limiter to -1 dBFS (4x oversampled detector, 2 ms lookahead)
ceil = 10 ** (-1.0 / 20)
up = signal.resample_poly(np.max(np.abs(out), axis=0), 4, 1)
peak = up.reshape(-1, 4).max(axis=1)[:N]
la = ns(0.002)
from scipy.ndimage import maximum_filter1d
pk = maximum_filter1d(peak, size=2 * la + 1)
g = np.minimum(1.0, ceil / (pk + 1e-9))
rel = np.exp(-1 / (0.08 * SR))
gs = g.copy()
for i in range(1, N):
    if gs[i] > gs[i - 1]:
        gs[i] = gs[i - 1] * rel + gs[i] * (1 - rel)
gs = np.minimum(gs, g)
out *= gs
# fade the last breath
fo = ns(0.35)
out[:, -fo:] *= np.linspace(1, 0, fo) ** 2
out = np.clip(out, -ceil, ceil)

dst = os.path.join(ROOT, 'out', 'olmene-showreel.wav')
os.makedirs(os.path.dirname(dst), exist_ok=True)
pcm = np.round(out.T * (2 ** 23 - 1)).astype(np.int32)
raw = np.zeros((pcm.shape[0], 2, 3), dtype=np.uint8)
for c in range(2):
    v = pcm[:, c] & 0xFFFFFF
    raw[:, c, 0] = v & 0xFF
    raw[:, c, 1] = (v >> 8) & 0xFF
    raw[:, c, 2] = (v >> 16) & 0xFF
with wave.open(dst, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(3)
    w.setframerate(SR)
    w.writeframes(raw.tobytes())
print(f'wrote {dst}: {DUR:.2f}s, {lufs(out):.1f} LUFS, peak {20 * np.log10(np.max(np.abs(out))):.2f} dBFS')
