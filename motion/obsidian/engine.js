/* engine.js: a small deterministic motion toolkit, with a 3D camera.
 *
 * Every value is a pure function of time t (seconds). Nothing carries state
 * from one frame to the next, so any frame renders identically, in any order,
 * on any worker. That is what makes sub-frame motion blur and parallel
 * rendering possible.
 *
 * The camera mirrors CSS 3D exactly: the world <div> gets
 * Cam.css(cam) and Cam.project(cam, p) returns the same screen point
 * Chromium draws, so canvas-drawn light (wires, the floor grid, dust) sits
 * precisely on the DOM panels.
 */
(function (g) {
  'use strict';

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, u) => a + (b - a) * u;
  const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
  const smooth = (u) => u * u * (3 - 2 * u);
  const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

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
    // Long, cinematic in-out for camera glides: no lurch, no stall.
    glide: bezier(0.65, 0, 0.35, 1),
    silk: bezier(0.45, 0, 0.2, 1),
    soft: bezier(0.45, 0, 0.55, 1),
    outCubic: (u) => 1 - Math.pow(1 - u, 3),
    inCubic: (u) => u * u * u,
    outQuart: (u) => 1 - Math.pow(1 - u, 4),
    inQuart: (u) => u * u * u * u,
    outQuint: (u) => 1 - Math.pow(1 - u, 5),
    inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    inOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
    smooth,
    smoother,
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
    return lerp(hash(i, seed), hash(i + 1, seed), smoother(f)) * 2 - 1;
  }

  /* ───────────── vectors + the CSS camera ───────────── */
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    lerp: (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  };
  // CSS rotation matrices (column vectors, y down, z toward the viewer).
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; };
  const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; };
  const DEG = Math.PI / 180;

  /**
   * A camera is { pos, yaw, pitch, roll, P } (angles in radians, P = CSS
   * perspective in px). The world element sits at the stage centre with
   * preserve-3d inside a container with `perspective: P`.
   */
  const Cam = {
    lookAt(pos, target, roll = 0, P = 1400) {
      const d = V.norm(V.sub(target, pos));
      return { pos, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(clamp(d[1], -1, 1)), roll, P, target };
    },
    /** Transform for the world element: the inverse of the camera pose. */
    css(c) {
      const f = (v) => (Math.round(v * 10000) / 10000).toString();
      return `translateZ(${f(c.P)}px) rotateZ(${f(-c.roll / DEG)}deg) rotateX(${f(-c.pitch / DEG)}deg) rotateY(${f(-c.yaw / DEG)}deg) translate3d(${f(-c.pos[0])}px,${f(-c.pos[1])}px,${f(-c.pos[2])}px)`;
    },
    /** World point to camera space: [x, y, depth] with depth > 0 in front. */
    view(c, p) {
      let q = V.sub(p, c.pos);
      q = rotY(q, -c.yaw);
      q = rotX(q, -c.pitch);
      q = rotZ(q, -c.roll);
      return [q[0], q[1], -q[2]];
    },
    /** World point to screen pixels (stage 1920x1080), plus depth and scale. */
    project(c, p, W = 1920, H = 1080) {
      const v = Cam.view(c, p);
      const s = c.P / v[2];
      return { x: W / 2 + v[0] * s, y: H / 2 + v[1] * s, d: v[2], s };
    },
    /** Rotate a local vector by an object's yaw/pitch (CSS order rotateY then rotateX). */
    orient(v, yaw = 0, pitch = 0) { return rotY(rotX(v, pitch), yaw); },
  };

  /**
   * Cubic Hermite through keys [{t, v:[...]}], tangents from neighbours
   * scaled by time (so velocity is continuous across keys). Keys flagged
   * hold:true get zero velocity, for a settle that never stops dead.
   */
  function hermite(keys, t) {
    const n = keys.length;
    if (t <= keys[0].t) return keys[0].v.slice();
    if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    const h = b.t - a.t, u = (t - a.t) / h;
    const tan = (k) => {
      const K = keys[k];
      if (K.hold || k === 0 || k === n - 1) return K.v.map(() => 0);
      const p = keys[k - 1], q = keys[k + 1];
      return K.v.map((_, j) => (q.v[j] - p.v[j]) / (q.t - p.t));
    };
    const m0 = tan(i), m1 = tan(i + 1);
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return a.v.map((_, j) => h00 * a.v[j] + h10 * h * m0[j] + h01 * b.v[j] + h11 * h * m1[j]);
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

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixRGB = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${n3(a)})`;

  g.M = { clamp, lerp, prog, smooth, smoother, bezier, ease, tw, track, rng, hash, noise, V, Cam, DEG, hermite, S, show, n3, px, hex, mixRGB, rgba };
})(window);
