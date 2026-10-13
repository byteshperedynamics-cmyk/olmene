/* engine.js: a small deterministic motion toolkit.
 *
 * Every value is a pure function of time t (seconds). Nothing carries state
 * from one frame to the next, so any frame renders identically, in any order,
 * on any worker. That is what makes sub-frame motion blur and parallel
 * rendering possible.
 */
(function (g) {
  'use strict';

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, u) => a + (b - a) * u;
  const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
  const smooth = (u) => u * u * (3 - 2 * u);

  /** CSS-style cubic-bezier easing, solved with Newton steps plus bisection. */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - x;
        if (Math.abs(e) < 1e-7) return sy(u);
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      let lo = 0, hi = 1;
      u = x;
      for (let i = 0; i < 40; i++) {
        const v = sx(u);
        if (Math.abs(v - x) < 1e-7) break;
        if (v < x) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
      return sy(u);
    };
  }

  const ease = {
    linear: (u) => u,
    // The product's own --ease-out-expo (globals.css): fast start, long settle.
    brand: bezier(0.22, 1, 0.36, 1),
    out: bezier(0.16, 1, 0.3, 1),
    in: bezier(0.7, 0, 0.84, 0),
    inOut: bezier(0.87, 0, 0.13, 1),
    snap: bezier(0.76, 0, 0.24, 1),
    soft: bezier(0.45, 0, 0.55, 1),
    outCubic: (u) => 1 - Math.pow(1 - u, 3),
    inCubic: (u) => u * u * u,
    outQuart: (u) => 1 - Math.pow(1 - u, 4),
    inQuart: (u) => u * u * u * u,
    outQuint: (u) => 1 - Math.pow(1 - u, 5),
    inQuint: (u) => u * u * u * u * u,
    outExpo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
    inExpo: (u) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10)),
    inOutExpo: (u) =>
      u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2,
    inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    inOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
    smooth,
  };

  /** Tween: value from a to b over [t0, t0 + d]. */
  const tw = (t, t0, d, a, b, e = ease.brand) => lerp(a, b, e(prog(t, t0, t0 + d)));

  /** Keyframe track: [[time, value], [time, value, easeIntoThisKey], ...]. */
  function track(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      if (t <= k[0]) {
        const p = keys[i - 1];
        return lerp(p[1], k[1], (k[2] || ease.brand)(prog(t, p[0], k[0])));
      }
    }
    return keys[keys.length - 1][1];
  }

  /** mulberry32: small, fast, seeded PRNG. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(i, seed) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Smooth 1D value noise in [-1, 1]. */
  function noise(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    return lerp(hash(i, seed), hash(i + 1, seed), smooth(f)) * 2 - 1;
  }

  function fbm(x, seed = 0, oct = 3) {
    let a = 0.5, s = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      s += a * noise(x * f, seed + o * 17);
      f *= 2;
      a *= 0.5;
    }
    return s;
  }

  /** Sum of decaying, noisy impulses: camera shake from a list of hits. */
  function shake(t, hits, seed) {
    let x = 0, y = 0, r = 0;
    for (const [t0, amp, dur] of hits) {
      if (t < t0 || t > t0 + dur) continue;
      const u = (t - t0) / dur;
      const k = amp * Math.pow(1 - u, 2.6);
      const f = 38; // Hz-ish feel, sampled from smooth noise
      x += k * noise(t * f, seed + 1);
      y += k * noise(t * f, seed + 2);
      r += k * 0.045 * noise(t * f * 0.8, seed + 3);
    }
    return { x, y, r };
  }

  /** Write styles, skipping values that did not change since last frame. */
  function S(el, o) {
    const c = el.__s || (el.__s = {});
    for (const k in o) {
      const v = o[k];
      if (c[k] !== v) {
        c[k] = v;
        el.style.setProperty(k, v);
      }
    }
  }
  const show = (el, on) => S(el, { display: on ? (el.dataset.display || 'block') : 'none' });
  const n3 = (v) => (Math.round(v * 1000) / 1000).toString();
  const px = (v) => n3(v) + 'px';

  /** Hex "#rrggbb" to [r, g, b]. */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixRGB = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${n3(a)})`;

  g.M = { clamp, lerp, prog, smooth, bezier, ease, tw, track, rng, hash, noise, fbm, shake, S, show, n3, px, hex, mixRGB, rgba };
})(window);
