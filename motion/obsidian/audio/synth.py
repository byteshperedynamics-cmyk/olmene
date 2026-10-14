#!/usr/bin/env python3
"""synth.py: the "Obsidian" score, synthesised from nothing and locked to cues.js.

120 BPM in half time. A minor while the site leaks customers, a quiet groove
under Find / Fix / Prove, and C major when the flower blooms. Sound follows
the picture's colour rule: dissonant bells for a rose leak, consonant C-major
chimes as each emerald fix locks into its line, a whirr that ticks with the
needle's exact spring. Everything is generated here with numpy + scipy.

    python3 audio/synth.py            -> out/olmene-obsidian.wav (48 kHz, 24-bit)
"""
import json
import os
import re
import wave

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = open(os.path.join(ROOT, 'cues.js')).read()
C = json.loads(re.split(r'^window\.CUES\s*=', SRC, flags=re.M)[1].strip().rstrip(';'))
DUR = C['duration']
N = int(round(DUR * SR))
BAR = 2.0
rng = np.random.default_rng(14102026)

BUS = {k: np.zeros((2, N)) for k in ('drums', 'music', 'sfx', 'verb')}


def place(bus, sig, t0, gain=1.0, pan=0.0, send=0.0):
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


# ───────────────────────── dsp ─────────────────────────
def ts(n):
    return np.arange(n) / SR


def ns(sec):
    return max(1, int(round(sec * SR)))


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, noise(n)) * 3.5


def sos(kind, f, order=2):
    if kind == 'bp':
        return signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype='band', output='sos')
    return signal.butter(order, f / (SR / 2), btype={'lp': 'low', 'hp': 'high'}[kind], output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def svf(x, fc, q=0.707, mode='lp'):
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
    return f0 * (f1 / f0) ** (np.linspace(0, 1, n) ** shape)


def osc_phase(freq, n):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return 2 * np.pi * np.cumsum(f) / SR


def saw(freq, n, phase0=0.0):
    return 2 * ((osc_phase(freq, n) / (2 * np.pi) + phase0) % 1.0) - 1


def env_asr(n, a, r):
    t = ts(n)
    e = np.minimum(1, t / max(a, 1e-4))
    rel = ns(r)
    if rel < n:
        e[-rel:] *= np.linspace(1, 0, rel) ** 1.5
    return e


def ramp(n, a=0.0005):
    return np.minimum(1, ts(n) / a)


NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(name):
    m = re.match(r'([A-G][#b]?)(-?\d)', name)
    return 440.0 * 2 ** ((12 * (int(m.group(2)) + 1) + NOTE[m.group(1)] - 69) / 12)


# ───────────────────────── instruments ─────────────────────────
def kick(f0=120, f1=42, length=0.7, tone=0.22):
    n = ns(length)
    t = ts(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    body = np.sin(osc_phase(f, n)) * (np.exp(-t / tone) * 0.85 + 0.15 * np.exp(-t / (length * 0.5)))
    click = filt(noise(n), 'bp', (1200, 5000)) * np.exp(-t / 0.003) * 0.12 * ramp(n, 0.0006)
    return np.tanh(1.5 * (body + click)) / np.tanh(1.5)


def boom(length=3.0, f0=58, f1=27):
    """Sub impact that settles fast onto f1, so it sits in tune under the bass."""
    n = ns(length)
    t = ts(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.09)
    return np.sin(osc_phase(f, n)) * np.minimum(1, t / 0.008) * np.exp(-t / 0.85)


def snap(length=0.6):
    """A soft, wide snap: three tight bursts and a dark tail."""
    n = ns(length)
    t = ts(n)
    e = np.zeros(n)
    for k, dt in enumerate((0.0, 0.008, 0.017)):
        e += (t >= dt) * np.exp(-np.maximum(0, t - dt) / 0.006) * (0.9 - 0.15 * k)
    e += (t >= 0.022) * np.exp(-np.maximum(0, t - 0.022) / 0.11) * 0.4
    x = filt(noise(n), 'bp', (1100, 6000)) * e * ramp(n, 0.0008)
    return np.vstack([x, np.roll(x, 29)])


def tick_hat(level=1.0, open_=False):
    n = ns(0.3 if open_ else 0.05)
    t = ts(n)
    x = filt(noise(n), 'hp', 8000, 4) * np.exp(-t / (0.11 if open_ else 0.016)) * ramp(n, 0.0004)
    return filt(x, 'lp', 14500) * level


def crash(length=3.4):
    n = ns(length)
    t = ts(n)
    nz = filt(filt(noise(n), 'hp', 4200, 2), 'lp', 12500) * np.exp(-t / 1.1)
    x = nz * np.minimum(1, t / 0.002)
    return np.vstack([x, np.roll(x, 41)])


def sub(freq, length, a=0.06, r=0.5):
    n = ns(length)
    return np.sin(osc_phase(freq, n)) * env_asr(n, a, r) + 0.15 * np.sin(osc_phase(freq * 2, n)) * env_asr(n, a, r)


def epiano(freq, length=2.2, vel=1.0):
    """FM electric piano: bright tine at the attack, warm sustain."""
    n = ns(length)
    t = ts(n)
    idx = (1.1 + 1.6 * vel) * np.exp(-t / 0.35)
    mod = np.sin(osc_phase(freq, n)) * idx
    x = np.sin(osc_phase(freq, n) + mod) * np.exp(-t / 1.4)
    tine = np.sin(osc_phase(freq * 14.0, n)) * np.exp(-t / 0.03) * 0.12 * vel
    trem = 1 + 0.05 * np.sin(2 * np.pi * 4.6 * t)
    return (x + tine) * trem * ramp(n, 0.002) * vel


def pad(freqs, length, attack=0.6, release=0.8, cutoff=1600, level=1.0, air=0.0):
    n = ns(length)
    L = np.zeros(n)
    R = np.zeros(n)
    for f in freqs:
        for k, dc in enumerate((-8, -3, 3, 8)):
            v = saw(f * 2 ** (dc / 1200), n, rng.random())
            (L if k % 2 == 0 else R)[:] += v
            (R if k % 2 == 0 else L)[:] += 0.15 * v
    L = filt(L, 'lp', cutoff, 2)
    R = filt(R, 'lp', cutoff, 2)
    e = env_asr(n, attack, release)
    st = np.vstack([L, R]) * e / (len(freqs) * 3.0) * level
    if air:
        a = filt(pink(n), 'bp', (3500, 10000)) * e * air * 0.025
        st += np.vstack([a, np.roll(a, 233)])
    return st


def glass(freq, length=0.8, decay=0.25):
    n = ns(length)
    t = ts(n)
    x = np.sin(osc_phase(freq, n)) * np.exp(-t / decay)
    x += 0.35 * np.sin(osc_phase(freq * 2.01, n)) * np.exp(-t / (decay * 0.4))
    x += 0.12 * np.sin(osc_phase(freq * 3.98, n)) * np.exp(-t / (decay * 0.2))
    return x * ramp(n, 0.0012)


def bell(freq, length=2.4, ratio=3.5, index=1.8, decay=0.9):
    n = ns(length)
    t = ts(n)
    mod = np.sin(osc_phase(freq * ratio, n)) * index * np.exp(-t / 0.2)
    x = np.sin(osc_phase(freq, n) + mod) * np.exp(-t / decay)
    x += 0.18 * np.sin(osc_phase(freq * 2.756, n)) * np.exp(-t / (decay * 0.35))
    return x * ramp(n, 0.0015)


def key_click(bright=1.0):
    n = ns(0.03)
    t = ts(n)
    return (filt(noise(n), 'bp', (2500, 8500)) * np.exp(-t / 0.0024) * bright + np.sin(osc_phase(2100, n)) * np.exp(-t / 0.003) * 0.2) * ramp(n, 0.0004)


def tick(freq=2600, length=0.04, d=0.005):
    n = ns(length)
    t = ts(n)
    return (np.sin(osc_phase(freq, n)) * np.exp(-t / d) + filt(noise(n), 'hp', 5000) * np.exp(-t / 0.0012) * 0.25) * ramp(n, 0.0004)


def whoosh(length, f0, f1, q=1.3, shape='bell', curve=1.0):
    n = ns(length)
    u = np.linspace(0, 1, n)
    x = svf(pink(n), logsweep(n, f0, f1, curve), q=q, mode='bp')
    e = np.sin(np.pi * u) ** 1.7 if shape == 'bell' else u ** 2.2 if shape == 'rise' else (1 - u) ** 2
    return x * e


def glide_tone(f0, f1, length, shape=1.4):
    n = ns(length)
    u = np.linspace(0, 1, n)
    f = f0 * (f1 / f0) ** (u ** shape)
    x = np.sin(osc_phase(f, n)) + 0.25 * np.sin(osc_phase(f * 2, n))
    return x * np.sin(np.pi * np.minimum(1, u * 1.15)) ** 1.2


def shimmer(length, f_lo=2400, f_hi=5200, voices=7):
    n = ns(length)
    t = ts(n)
    x = np.zeros(n)
    for k in range(voices):
        f = f_lo * (f_hi / f_lo) ** (k / max(1, voices - 1))
        am = 0.5 + 0.5 * np.sin(2 * np.pi * (0.7 + 0.9 * rng.random()) * t + rng.random() * 6.28)
        x += np.sin(osc_phase(f * (1 + 0.003 * rng.standard_normal()), n)) * am
    return x / voices


def riser(length, f0=300, f1=8000):
    n = ns(length)
    u = np.linspace(0, 1, n)
    nz = svf(pink(n), logsweep(n, f0, f1, 1.3), q=0.85, mode='hp') * u ** 2.4
    pitch = 330 * 2 ** (u ** 1.5)
    tone = filt(saw(pitch, n) * 0.5 + saw(pitch * 1.5, n) * 0.3, 'lp', 3000) * u ** 2 * 0.3
    return nz + tone


def make_ir(rt60=2.6, length=3.6):
    n = ns(length)
    t = ts(n)
    chans = []
    for c in range(2):
        nz = rng.standard_normal(n)
        dark = filt(nz, 'lp', 2200)
        w = np.minimum(1, t / 1.0)
        x = (nz * (1 - w) + dark * w * 1.6) * np.exp(-6.9 * t / rt60)
        x[: ns(0.018)] = 0
        for k in range(8):
            d = ns(0.019 + 0.012 * k + 0.005 * c)
            x[d] += (0.42 - 0.045 * k) * (1 if (k + c) % 2 else -1)
        chans.append(x)
    ir = np.vstack(chans)
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR = make_ir()

# ───────────────────────── harmony ─────────────────────────
CHORDS = {
    'Am9': ('A1', ['A2', 'E3', 'G3', 'B3', 'C4']),
    'Fmaj9': ('F1', ['F2', 'C3', 'E3', 'G3', 'A3']),
    'Cmaj9': ('C2', ['C3', 'G3', 'B3', 'D4', 'E4']),
    'G69': ('G1', ['G2', 'D3', 'E3', 'A3', 'B3']),
}
PROG = ['Am9', 'Fmaj9', 'Am9', 'Fmaj9', 'Cmaj9', 'G69', 'Am9', 'Fmaj9', 'Cmaj9', 'Cmaj9']

O, F, X, P, Fn = C['open'], C['find'], C['fix'], C['prove'], C['finale']
hit = Fn['hit']

# pads and sub, bar by bar (the last two bars ring as one)
for b, name in enumerate(PROG[:8]):
    root, tones = CHORDS[name]
    t0 = b * BAR
    lvl = 0.55 if b < 2 else 0.7
    place('music', pad([hz(x) for x in tones], BAR + 0.5, attack=0.9 if b == 0 else 0.35, release=0.5, cutoff=1300 if b < 2 else 1800, level=lvl, air=0.6), t0, 0.5)
    if b >= 1:
        place('music', sub(hz(root), BAR + 0.1, 0.08, 0.3), t0, 0.32)
root, tones = CHORDS['Cmaj9']
place('music', pad([hz(x) for x in tones + ['G4']], DUR - hit, attack=0.05, release=2.2, cutoff=2400, level=1.0, air=1.4), hit, 0.62)
place('music', sub(hz('C2'), DUR - hit, 0.02, 2.0), hit, 0.36)

# electric piano: soft voicings on each bar, then a slow 8th arpeggio under the product
for b, name in enumerate(PROG[:8]):
    _, tones = CHORDS[name]
    t0 = b * BAR
    if b < 2:
        for k, x in enumerate(tones[1:]):
            place('music', epiano(hz(x), 2.4, 0.45), t0 + 0.012 * k, 0.07, -0.3 + 0.15 * k, send=0.35)
    else:
        arp = tones[1:] + [tones[2]] * 0
        for k in range(8):
            nm = arp[[0, 2, 1, 3, 2, 4, 3, 1][k] % len(arp)]
            f = hz(nm) * (2 if k % 4 == 3 else 1)
            place('music', epiano(f, 1.2, 0.5 + (0.15 if k % 4 == 0 else 0)), t0 + k * 0.25, 0.045, -0.45 if k % 2 else 0.45, send=0.4)

# ── the opening: light ignites, writes, glints ──
place('music', np.sin(osc_phase(hz('A1'), ns(2.15))) * env_asr(ns(2.15), 1.2, 0.55), 0.0, 0.16)
place('sfx', glass(hz('E7'), 1.4, 0.45), O['ignite'], 0.11, 0.0, send=0.7)
place('sfx', whoosh(O['stretch'][1] - O['stretch'][0] + 0.2, 2400, 9000, q=0.7, shape='bell'), O['ignite'], 0.15, 0.0, send=0.3)
st = shimmer(O['stretch'][1] - O['stretch'][0] + 0.6, 3000, 6400) * np.sin(np.pi * np.linspace(0, 1, ns(O['stretch'][1] - O['stretch'][0] + 0.6))) ** 1.2
place('sfx', np.vstack([st, -np.roll(st, 117)]), O['ignite'], 0.05, send=0.4)
s0, s1 = O['sweep']
scan = np.sin(osc_phase(hz('E6') * (1 + 0.004 * np.sin(2 * np.pi * 5 * ts(ns(s1 - s0)))), ns(s1 - s0))) * np.sin(np.pi * np.linspace(0, 1, ns(s1 - s0))) ** 1.4
place('sfx', scan, s0, 0.03, 0.0, send=0.4)
for k in range(46):
    u = (k + rng.random() * 0.6) / 46
    place('sfx', key_click(0.5 + 0.4 * rng.random()), s0 + 0.05 + u * (s1 - s0 - 0.1), 0.05, -0.6 + 1.2 * u)
g0, g1 = O['glint']
place('sfx', bell(hz('B6'), 1.6, ratio=2.0, index=0.9, decay=0.6), g0 + 0.25, 0.075, 0.3, send=0.6)
place('sfx', whoosh(g1 - g0, 4000, 11000, q=0.6, shape='bell'), g0, 0.09, 0.4, send=0.3)

# ── glides: air that moves with the camera ──
for (a, b), (f0, f1), pan in ((O['depart'], (260, 3200), 0.35), (F['depart'], (2600, 380), 0.0), (X['depart'], (300, 4200), 0.3)):
    w = whoosh(b - a + 0.15, f0, f1, q=1.1, shape='bell', curve=1.2)
    place('sfx', np.vstack([w * (1 - pan), w * (1 + pan)]), a, 0.36, send=0.3)
place('sfx', riser(O['depart'][1] - O['depart'][0] + 0.25, 260, 6000), O['depart'][0] - 0.25, 0.22)

# ── the groove: half time from the drop to the pull-back ──
kicks = []
for b in range(2, 8):
    t0 = b * BAR
    kicks.append(t0)
    place('drums', kick(), t0, 0.82)
    if b in (3, 5):
        kicks.append(t0 + 1.5)
        place('drums', kick(110, 44, 0.5, 0.15), t0 + 1.5, 0.45)
    if t0 + 1.0 < P['depart'][0]:
        place('drums', snap(), t0 + 1.0, 0.36, send=0.45)
    for k in range(8):
        tt = t0 + k * 0.25
        if tt >= P['depart'][0]:
            break
        place('drums', tick_hat(1.0 if k % 2 else 0.55), tt + 0.012 * (k % 2), 0.11, 0.35 if k % 2 else -0.35)
    if b == 7:
        break
place('drums', boom(2.4, 62, hz('A0')), F['land'], 0.42)  # lands on A, an octave under the sub
place('drums', crash(3.0), 4.0, 0.12, send=0.25)
place('drums', boom(2.0, 58, hz('A0')), 12.0, 0.3)

# ── Find: typing, the scan, three leaks ──
t0, t1 = F['type']
for k in range(18):
    place('sfx', key_click(0.8 + 0.3 * rng.random()), t0 + (k + 0.3 * rng.random()) * (t1 - t0) / 18, 0.12, 0.3)
place('sfx', whoosh(0.4, 500, 2400, q=0.9), F['load'] - 0.06, 0.1, 0.3)
l0, l1 = F['laser']
lz = svf(pink(ns(l1 - l0)), logsweep(ns(l1 - l0), 6200, 1400, 1.0), q=2.2, mode='bp') * np.sin(np.pi * np.linspace(0, 1, ns(l1 - l0))) ** 1.5
place('sfx', lz, l0, 0.2, 0.3, send=0.25)
for k in range(21):
    place('sfx', tick(3200 + 50 * k, 0.03, 0.004), l0 + (k + 1) * (l1 - l0) / 21.6, 0.06, 0.35)
for k, tp in enumerate(F['pins']):
    pan = [0.45, 0.25, 0.15][k]
    place('sfx', bell(hz(['E6', 'F6', 'E6'][k]), 1.0, ratio=3.0, index=1.1, decay=0.35), tp, 0.07, pan, send=0.45)
    place('sfx', bell(hz(['F6', 'E6', 'F#6'][k]), 0.9, ratio=3.0, index=1.0, decay=0.3), tp + 0.03, 0.05, pan, send=0.45)
place('sfx', tick(700, 0.12, 0.03), F['leaks'], 0.16, 0.4, send=0.3)
place('sfx', tick(520, 0.14, 0.035), F['leaks'] + 0.08, 0.16, 0.4, send=0.3)

# ── Fix: light flows down the wires and locks into each line ──
for k, (w0, w1) in enumerate(X['wires']):
    place('sfx', glide_tone(hz('A4'), hz(['C6', 'E6', 'G6'][k]), w1 - w0, 1.8), w0, 0.05, 0.1 - 0.15 * k, send=0.5)
    place('sfx', bell(hz(['C6', 'E6', 'G6'][k]), 2.0, ratio=2.0, index=1.2, decay=0.8), w1, 0.11, 0.1 - 0.15 * k, send=0.55)
    for j in range(8):
        place('sfx', key_click(0.6), w1 + 0.02 + j * 0.036, 0.06, 0.15)
place('sfx', whoosh(0.28, 7000, 2000, q=1.4, shape='fall'), X['strike'], 0.12, 0.2)
for k, tb in enumerate(X['branch']):
    place('sfx', tick(1800 + 300 * k, 0.05, 0.008), tb, 0.06, -0.2 + 0.2 * k, send=0.3)
place('sfx', key_click(1.3), X['click'], 0.4, 0.3)
place('sfx', tick(240, 0.08, 0.02), X['click'] + 0.004, 0.25, 0.3)
for k, nm in enumerate(('G4', 'B4', 'D5', 'E5', 'A5')):
    place('music', epiano(hz(nm), 2.4, 0.8), X['click'] + 0.06 + 0.02 * k, 0.09, -0.2 + 0.1 * k, send=0.5)
place('sfx', shimmer(1.4, 3200, 7000) * np.exp(-ts(ns(1.4)) / 0.5), X['click'] + 0.05, 0.05, 0.2, send=0.5)

# ── Prove: merged, the needle, the bridge ──
place('sfx', bell(hz('G5'), 1.4, ratio=2.0, index=1.0, decay=0.5), P['merged'], 0.08, -0.2, send=0.5)
place('sfx', bell(hz('C6'), 1.8, ratio=2.0, index=1.0, decay=0.7), P['merged'] + 0.09, 0.08, -0.1, send=0.5)


def spring(tau):
    w2, zw = 170.0, 8.5
    wd = np.sqrt(w2 - zw * zw)
    return np.where(tau <= 0, 61.0, 94 - 33 * np.exp(-zw * tau) * (np.cos(wd * tau) + (zw / wd) * np.sin(wd * tau)))


tt = np.linspace(0, 1.4, 14001)
xs = spring(tt)
peak = 61
for i in range(1, len(tt)):
    v = int(np.floor(xs[i]))
    if v > peak and v <= 96:
        peak = v
        place('sfx', tick(1400 + 28 * (v - 61), 0.04, 0.005), P['spring'] + tt[i], 0.08, 0.2)
wl = ns(1.1)
whirr = filt(saw(logsweep(wl, 90, 260, 0.6), wl) * np.exp(-ts(wl) / 0.45), 'lp', 1400) * ramp(wl, 0.01)
place('sfx', whirr, P['spring'], 0.08, 0.2)
place('sfx', key_click(1.0), P['spring'] + 1.05, 0.12, 0.2)
b0, b1 = P['bridge']
place('sfx', glide_tone(hz('E5'), hz('B5'), b1 - b0, 1.0), b0, 0.035, -0.4, send=0.5)
place('sfx', tick(2200, 0.06, 0.01), P['pr'], 0.08, 0.0, send=0.4)
for k, nm in enumerate(('C6', 'E6', 'G6')):
    place('sfx', bell(hz(nm), 1.8, ratio=2.0, index=0.9, decay=0.6), P['s94'] + 0.04 * k, 0.07, 0.4, send=0.55)

# ── the pull back, the laser's return, the bloom ──
d0, d1 = P['depart']
place('sfx', whoosh(d1 - d0, 3200, 220, q=1.0, shape='rise', curve=0.8), d0, 0.4, send=0.35)
rc = crash(1.3)[:, ::-1] * np.linspace(0, 1, ns(1.3)) ** 2.5
place('drums', rc, hit - 1.3 - 0.02, 0.22)
la0 = Fn['laser'][0]
place('sfx', glide_tone(hz('E5'), hz('E6'), hit - la0, 2.2), la0, 0.05, send=0.4)
place('sfx', riser(hit - la0 + 0.05, 600, 9000), la0, 0.16)
place('drums', kick(140, 40, 1.0, 0.3), hit, 0.95)
place('drums', boom(3.4, 66, hz('C1')), hit, 0.75)  # lands on C under the C major bloom
place('drums', crash(3.8), hit, 0.24, send=0.4)
for k, nm in enumerate(('C6', 'E6', 'G6', 'B6', 'D7')):
    place('music', bell(hz(nm), 3.0, ratio=2.0, index=1.4, decay=1.3), hit + 0.04 + k * Fn['petalStagger'], 0.075, -0.5 + 0.25 * k, send=0.6)
for k, nm in enumerate(('C4', 'G4', 'B4', 'E5')):
    place('music', epiano(hz(nm), 3.6, 0.9), hit + 0.01 * k, 0.11, -0.3 + 0.2 * k, send=0.55)
w0, w1 = Fn['word']
place('sfx', whoosh(w1 - w0, 1800, 7000, q=0.7, shape='bell'), w0, 0.1, send=0.4)
place('sfx', key_click(0.6), Fn['tag'], 0.05, 0.0)
c0, c1 = Fn['card']
place('sfx', glide_tone(hz('G5'), hz('D6'), c1 - c0, 1.0), c0, 0.025, send=0.6)
place('sfx', tick(2600, 0.05, 0.008), Fn['url'], 0.07, 0.0, send=0.4)
e0, e1 = Fn['edge']
ed = shimmer(e1 - e0, 4200, 8800, 9)
pan = np.linspace(-0.8, 0.8, ns(e1 - e0))
place('sfx', np.vstack([ed * (1 - pan) * 0.5, ed * (1 + pan) * 0.5]) * np.sin(np.pi * np.linspace(0, 1, ns(e1 - e0))) ** 1.5, e0, 0.06, send=0.5)
place('music', epiano(hz('G5'), 2.6, 0.5), 18.0, 0.05, 0.2, send=0.6)
place('music', epiano(hz('E5'), 2.4, 0.45), 18.5, 0.045, -0.2, send=0.6)

# ───────────────────────── mix ─────────────────────────
sc = np.ones(N)
for kt in kicks + [hit]:
    i0 = int(kt * SR)
    n = min(ns(0.45), N - i0)
    t = ts(n)
    sc[i0:i0 + n] = np.minimum(sc[i0:i0 + n], 1 - 0.45 * np.exp(-t / 0.13) * np.minimum(1, t / 0.006 + 0.3))
music = BUS['music'] * sc
mid, side = (music[0] + music[1]) / 2, (music[0] - music[1]) / 2
side = filt(side, 'hp', 220) * 1.6
music = np.vstack([mid + side, mid - side])
wet = np.vstack([signal.fftconvolve(BUS['verb'][0], IR[0])[:N], signal.fftconvolve(BUS['verb'][1], IR[1])[:N]])
wet = np.vstack([filt(w, 'hp', 200) for w in wet])
out = BUS['drums'] * 0.95 + music * 0.9 + BUS['sfx'] * 0.95 + wet * 0.26

# a breath of silence before the bloom
gap = np.ones(N)
gi0, gi1 = int((hit - 0.05) * SR), int(hit * SR)
gap[gi0:gi1] = np.linspace(1, 0.1, gi1 - gi0)
out[:, :gi1] *= gap[:gi1]
out = np.vstack([filt(ch, 'hp', 24) for ch in out])

mono = np.sqrt(np.mean(out ** 2, axis=0))
win = ns(0.025)
rms = np.sqrt(signal.fftconvolve(mono ** 2, np.ones(win) / win, mode='same') + 1e-12)
thr, ratio = 0.16, 2.0
gain = np.where(rms > thr, (thr / rms) ** (1 - 1 / ratio), 1.0)
out *= signal.sosfilt(sos('lp', 6), gain)


def lufs(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=1), axis=1)
    blk, hop = ns(0.4), ns(0.1)
    zs = np.array([np.mean(np.sum(y[:, i:i + blk] ** 2, axis=0)) for i in range(0, y.shape[1] - blk, hop)])
    lk = -0.691 + 10 * np.log10(zs + 1e-12)
    g = zs[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    return -0.691 + 10 * np.log10(np.mean(zs[(lk > -70) & (lk > rel)]))


out *= 10 ** ((-14.5 - lufs(out)) / 20)
ceil = 10 ** (-1.0 / 20)
up = signal.resample_poly(np.max(np.abs(out), axis=0), 4, 1)
peakv = up.reshape(-1, 4).max(axis=1)[:N]
pk = maximum_filter1d(peakv, size=2 * ns(0.002) + 1)
g = np.minimum(1.0, ceil / (pk + 1e-9))
rel_c = np.exp(-1 / (0.09 * SR))
gs = g.copy()
for i in range(1, N):
    if gs[i] > gs[i - 1]:
        gs[i] = gs[i - 1] * rel_c + gs[i] * (1 - rel_c)
out *= np.minimum(gs, g)
fo = ns(0.6)
out[:, -fo:] *= np.linspace(1, 0, fo) ** 2
out = np.clip(out, -ceil, ceil)

dst = os.path.join(ROOT, 'out', 'olmene-obsidian.wav')
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
