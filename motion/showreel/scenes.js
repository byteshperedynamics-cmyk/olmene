/* scenes.js: the film. Reel.render(t) poses every element for time t.
 *
 * Motif: the green dot. In Olmene's design system green light means the
 * agent at work, so one leaf-green dot threads the whole piece: a heartbeat,
 * the period of "ships the fix.", a portal, a merge check that grows into the
 * readiness ring, the chart's live point, and finally the flower itself.
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, ease, track, rng, noise, shake, S, show, n3, px, hex, mixRGB, rgba } = M;
  const C = window.CUES;
  const $ = (s) => document.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const W = 1920, H = 1080, CX = 960, CY = 540;
  const RGB = {
    paper: hex('#F2F1EC'), leaf: hex('#69C27E'), rust: hex('#DE8354'), rustL: hex('#B5532A'),
    del: hex('#3C3128'), mint: hex('#9BE3AD'), amberish: hex('#F0B08A'),
  };

  // Duration of the sub-frame being rendered (0 when not motion-blurring).
  // Circles that zoom violently soften their edge by exactly how far it
  // travels in that slice, so the accumulated sub-frames blend into one
  // continuous blur instead of stepped rings.
  let SUB = 0;
  const travel = (fn, t) => (SUB > 0 ? Math.abs(fn(t + SUB / 2) - fn(t - SUB / 2)) : 0);
  /** Solid disc with a soft edge of width w (px), drawn as a radial gradient. */
  function disc(el, cx, cy, r, w, color, extra) {
    if (r <= 0.01) { S(el, { 'background-image': 'none', 'background-color': 'transparent' }); return; }
    const R = r + w / 2 + 1;
    const a = Math.max(0, r - w / 2), b = Math.max(a + 0.75, r + w / 2);
    S(el, Object.assign({
      left: px(cx - R), top: px(cy - R), width: px(2 * R), height: px(2 * R), 'border-radius': '50%', 'background-color': 'transparent',
      'background-image': `radial-gradient(circle at 50% 50%, ${color} ${n3(a)}px, ${color.replace(/,[\d.]+\)$/, ',0)')} ${n3(b)}px)`,
    }, extra || {}));
  }

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  /** Masked rise: enters from below at tIn, optionally leaves upward at tOut. */
  function rise(el, t, tIn, dIn = 0.62, tOut = Infinity, dOut = 0.32) {
    const a = ease.brand(prog(t, tIn, tIn + dIn));
    const b = tOut === Infinity ? 0 : ease.in(prog(t, tOut, tOut + dOut));
    S(el, { transform: `translate3d(0,${n3((1 - a) * 128 - b * 118)}%,0)` });
    return a * (1 - b);
  }
  function fadeUp(el, t, tIn, d = 0.5, dist = 22) {
    const a = ease.brand(prog(t, tIn, tIn + d));
    S(el, { opacity: n3(a), transform: `translate3d(0,${n3((1 - a) * dist)}px,0)` });
    return a;
  }
  /** Heartbeat swell: fast attack, exponential decay, summed over hits. */
  function beats(t, times, decay = 7) {
    let v = 0;
    for (const t0 of times) if (t >= t0) v += Math.min(1, (t - t0) / 0.035) * Math.exp(-(t - t0) * decay);
    return v;
  }
  function circle(el, cx, cy, r, extra) {
    S(el, Object.assign({ left: px(cx - r), top: px(cy - r), width: px(2 * r), height: px(2 * r) }, extra || {}));
  }
  /** A pulse ring launched at t0: grows from r0 to r1 and fades. */
  function ring(el, t, t0, cx, cy, r0, r1, dur = 0.6, a0 = 0.7) {
    const u = prog(t, t0, t0 + dur);
    const on = t >= t0 && u < 1;
    show(el, on);
    if (on) circle(el, cx, cy, lerp(r0, r1, ease.out(u)), { opacity: n3(a0 * (1 - u) * (1 - u)) });
  }

  /* ───────────────────────── camera + post ───────────────────────── */
  const cam = $('#cam');
  function renderCam(t) {
    const sh = shake(t, C.post.shake, 11);
    const over = 1 + (Math.abs(sh.x) + Math.abs(sh.y)) / 700;
    S(cam, { transform: `translate3d(${n3(sh.x)}px,${n3(sh.y)}px,0) rotate(${n3(sh.r)}deg) scale(${n3(over)})`, 'transform-origin': '960px 540px' });
  }
  function aberration(t) {
    let a = 0;
    for (const [t0, amt, dur] of C.post.aberration) if (t >= t0 && t < t0 + dur) a += amt * Math.pow(1 - (t - t0) / dur, 2);
    return a;
  }

  /* ───────────────────────── night ground ───────────────────────── */
  const night = { el: $('#bg-night'), grid: $('#night-grid'), wash: $('#night-wash') };
  function renderNight(t, gx = 0, gy = 0, gs = 1) {
    const on = (t < C.answer.portal[1] + 0.04) || (t >= C.find.zoom[1] - 0.04 && t < C.logo.hit + 0.6);
    show(night.el, on);
    if (!on) return;
    const R = lerp(60, 1700, ease.out(prog(t, 0.0, 1.5)));
    S(night.grid, {
      'mask-image': `radial-gradient(circle ${n3(R)}px at 1072px 652px, #000 0%, #000 55%, transparent 100%)`,
      transform: `translate3d(${n3(gx)}px,${n3(gy)}px,0) scale(${n3(gs)})`, 'transform-origin': '1072px 652px',
    });
    const glow = 0.85 * beats(t, [C.hook.ignite, C.hook.pulse], 3) * (1 - prog(t, 0.45, 0.8))
      + 0.55 * prog(t, C.answer.dot - 0.4, C.answer.dot) * (1 - prog(t, C.answer.zoom[0], C.answer.zoom[0] + 0.2));
    S(night.wash, { opacity: n3(clamp(glow)), transform: `translate3d(${n3(state.washX - 960)}px,${n3(state.washY - 540)}px,0)` });
  }

  const state = { washX: 960, washY: 540 };

  /* ───────────────────────── 1 · hook ───────────────────────── */
  const hk = {
    sec: $('#s-hook'), dot: $('#ig-dot'), halo: $('#ig-halo'), r1: $('#ig-ring1'), r2: $('#ig-ring2'),
    l1: $('#hook-l1'), l2: $('#hook-l2'), words: $$('#hook-l1 .i'), cust: $('#customers'),
  };
  function hookZoom(t) {
    return { s: lerp(1.085, 1, ease.out(prog(t, 0.45, C.hook.dissolve[0]))), r: lerp(-1.2, 0, ease.out(prog(t, 0.45, C.hook.dissolve[0]))) };
  }
  function renderHook(t) {
    const K = C.hook;
    const on = t < K.lineOut[1] + 0.02;
    show(hk.sec, on);
    if (!on) return;
    // the heartbeat: ignite, lub-dub, then gone just before the first word
    const din = ease.out(prog(t, K.ignite, K.ignite + 0.16));
    const dout = ease.in(prog(t, K.dotOut[0], K.dotOut[1]));
    const b = beats(t, [K.ignite, K.pulse], 9);
    const r = 11 * din * (1 - dout) * (1 + 0.32 * b);
    circle(hk.dot, 0, 0, r);
    circle(hk.halo, 0, 0, r * 10, { opacity: n3(clamp(0.55 + 0.45 * b) * din * (1 - dout)) });
    ring(hk.r1, t, K.ignite + 0.02, 0, 0, 12, 150, 0.7, 0.75);
    ring(hk.r2, t, K.pulse, 0, 0, 12, 190, 0.7, 0.6);

    const z = hookZoom(t);
    const tr = `translate3d(0,0,0) scale(${n3(z.s)}) rotate(${n3(z.r)}deg)`;
    S(hk.l1, { transform: tr, 'transform-origin': '960px 165px' });
    S(hk.l2, { transform: tr, 'transform-origin': '960px -5px' });
    hk.words.forEach((el, i) => rise(el, t, K.words[i], 0.62, K.lineOut[0] + i * 0.035, 0.3));
    rise(hk.cust, t, K.words[4], 0.62);
    // "customers." hands over to the particle field the moment it dissolves
    S(hk.l2, { visibility: (t < K.dissolve[0] || sampling) ? 'visible' : 'hidden' });
  }

  /* ───────────────────────── particles ───────────────────────── */
  const pc = $('#particles');
  const pctx = pc.getContext('2d');
  const P = { n: 0 };
  let sampling = false;

  function setParticles(d) {
    const n = d.x.length;
    const R = rng(20261013);
    const D = C.hook.dissolve, V = C.answer.converge;
    let xmin = Infinity, xmax = -Infinity;
    for (let i = 0; i < n; i++) { xmin = Math.min(xmin, d.x[i]); xmax = Math.max(xmax, d.x[i]); }
    const f32 = () => new Float32Array(n);
    Object.assign(P, {
      n, x0: Float32Array.from(d.x), y0: Float32Array.from(d.y), a: Float32Array.from(d.a),
      rel: f32(), vx: f32(), vy: f32(), p1: f32(), p2: f32(), f1: f32(), f2: f32(),
      conv: f32(), dur: f32(), swirl: f32(), size: f32(), xmin, xmax,
    });
    for (let i = 0; i < n; i++) {
      const u = (P.x0[i] - xmin) / (xmax - xmin);
      // a ragged dissolve front sweeping left to right
      P.rel[i] = D[0] + u * (D[1] - D[0] - 0.16) + 0.1 * R() + 0.05 * noise(P.y0[i] * 0.045, 5);
      const sp = R();
      P.vx[i] = 120 + 980 * sp * sp + 260 * u;
      P.vy[i] = (R() - 0.62) * 900 * (0.35 + sp);
      P.p1[i] = R() * 6.283; P.p2[i] = R() * 6.283;
      P.f1[i] = 2 + 3 * R(); P.f2[i] = 2 + 3 * R();
      P.conv[i] = V[0] + 0.12 + 0.30 * R() + 0.12 * (1 - u);
      P.dur[i] = 0.30 + 0.14 * R();
      P.swirl[i] = (R() < 0.5 ? -1 : 1) * (1.6 + 2.2 * R());
      P.size[i] = R() < 0.07 ? 3.4 + 1.6 * R() : 1.2 + 1.5 * R();
    }
    // keep every particle home before the dot pops
    for (let i = 0; i < n; i++) P.conv[i] = Math.min(P.conv[i], C.answer.dot - P.dur[i] - 0.005);
  }

  /** Where particle i drifts to, blown away from the word (closed form). */
  function drift(i, t, out) {
    const tau = Math.max(0, t - P.rel[i]);
    const k = 2.1, f = (1 - Math.exp(-k * tau)) / k;
    const sw = 70 * tau * tau;
    out[0] = P.x0[i] + P.vx[i] * f + 210 * tau + sw * Math.sin(P.f1[i] * tau + P.p1[i]);
    out[1] = P.y0[i] + P.vy[i] * f - 60 * tau + sw * Math.cos(P.f2[i] * tau + P.p2[i]);
    return tau;
  }

  const tmp = [0, 0];
  function renderParticles(t) {
    const D = C.hook.dissolve;
    const on = P.n > 0 && t >= D[0] && t < C.answer.dot + 0.02 && !sampling;
    show(pc, on);
    let absorbed = 0;
    if (!on) { state.absorbed = t >= C.answer.dot ? 1 : 0; return; }
    pctx.clearRect(0, 0, W, H);
    const T = state.dotTarget;
    for (let i = 0; i < P.n; i++) {
      const a0 = P.a[i];
      if (t < P.rel[i]) {
        pctx.fillStyle = rgba(RGB.paper, a0);
        pctx.fillRect(P.x0[i] - 1, P.y0[i] - 1, 2, 2);
        continue;
      }
      const tau = drift(i, t, tmp);
      const s = prog(t, P.conv[i], P.conv[i] + P.dur[i]);
      if (s >= 1) { absorbed++; continue; }
      const e = ease.inCubic(s);
      let x = tmp[0], y = tmp[1];
      if (s > 0) {
        const dx = x - T.x, dy = y - T.y;
        const ang = P.swirl[i] * e, c = Math.cos(ang), sn = Math.sin(ang), m = 1 - e;
        x = T.x + (dx * c - dy * sn) * m;
        y = T.y + (dx * sn + dy * c) * m;
      }
      const big = P.size[i] > 3;
      const cr = mixRGB(mixRGB(RGB.paper, big ? RGB.amberish : RGB.rust, clamp(tau / 0.22)), RGB.leaf, e);
      const sz = lerp(lerp(2, P.size[i], clamp(tau / 0.1)), 1.6, e);
      const tw = 0.75 + 0.25 * Math.sin(tau * 23 + P.p1[i] * 3);
      const al = clamp((lerp(a0, 0.35 + 0.65 * a0, clamp(tau / 0.15)) * (1 - 0.45 * clamp((tau - 0.25) / 0.6)) * tw) + 0.7 * e);
      pctx.fillStyle = rgba(cr, al);
      pctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    state.absorbed = absorbed / P.n;
  }

  /* ───────────────────────── 2 · answer ───────────────────────── */
  const an = {
    sec: $('#s-answer'), line: $('#answer-line'), words: $$('#answer-line .i'), ems: $$('#answer-line em'),
    wrap: $('#answer-dot'), dot: $('#ad-dot'), halo: $('#ad-halo'), ring: $('#ad-ring'), slot: $('#dot-slot'),
  };
  const rim = $('#portal-rim');
  const DOT_R = 10.5;
  function zoomScale(t) {
    const A = C.answer;
    return Math.exp(Math.log(150) * ease.inExpo(prog(t, A.zoom[0], A.zoom[1])));
  }
  function renderAnswer(t) {
    const A = C.answer;
    const on = t >= A.words[0] - 0.02 && t < A.portal[1] + 0.01;
    show(an.sec, on);
    if (!on) return;
    an.words.forEach((el, i) => rise(el, t, A.words[i], 0.62));
    // sheen of light across the italic answer
    const sh = prog(t, A.sheen[0], A.sheen[1]);
    an.ems.forEach((el) => S(el, { 'background-position': `${n3(lerp(120, -40, ease.inOutSine(sh)))}% 0` }));

    // the period: grows as the scattered particles come home
    const T = state.dotTarget;
    const grown = Math.sqrt(clamp(state.absorbed));
    const pop = ease.brand(prog(t, A.dot, A.dot + 0.35));
    const b = beats(t, [A.dot, A.pulse], 8);
    const r = DOT_R * Math.max(grown * 0.85, pop) * (1 + 0.28 * b);
    S(an.wrap, { left: px(T.x), top: px(T.y) });
    const zw = r * travel(zoomScale, t) / zoomScale(t);
    disc(an.dot, 0, 0, r, zw, 'rgba(105,194,126,1)');
    circle(an.halo, 0, 0, r * 8.5, { opacity: n3(clamp(0.35 + 0.65 * b) * clamp(grown + pop)) });
    ring(an.ring, t, A.pulse, 0, 0, DOT_R, 120, 0.6, 0.7);

    // zoom through the dot
    const z = zoomScale(t);
    S(an.sec, { transform: `scale(${n3(z)})`, 'transform-origin': `${n3(T.x)}px ${n3(T.y)}px` });
    S(an.line, { visibility: z > 40 ? 'hidden' : 'visible' });
    state.washX = T.x; state.washY = T.y;
  }
  /** The portal: Find, seen through the growing dot, with a thin leaf rim. */
  function portalRadius(t) {
    const A = C.answer;
    const outer = DOT_R * zoomScale(t);
    const inner = lerp(0, 1500, ease.inCubic(prog(t, A.portal[0], A.portal[1])));
    return Math.max(0, Math.min(inner, outer - 5));
  }

  /* ───────────────────────── 3 · find ───────────────────────── */
  const fd = {
    sec: $('#s-find'), cam: $('#find-cam'), grid: $('#find-grid'), col: $$('#find-col .i'), p3: $('#find-p3'),
    browser: $('#browser'), url: $('#url-text'), caret: $('#url-caret'), chip: $('#scan-chip'), count: $('#scan-count'),
    sdot: $('#scan-dot'), res: $('#scan-res'), blocks: $$('#page .blk'), beam: $('#beam'),
    hl: [$('#hl1'), $('#hl2'), $('#hl3')], pins: [$('#pin1'), $('#pin2'), $('#pin3')], pin1dot: $('#pin1-dot'),
  };
  const morph = $('#morph');
  // pins pop in scan order: nav (pin2), hero (pin1), cards (pin3)
  const PIN_ORDER = [1, 0, 2];
  fd.blockTop = fd.blocks.map((el) => parseFloat(el.style.top));

  function renderFind(t) {
    const F = C.find, A = C.answer;
    const on = t >= A.portal[0] && t < F.zoom[1];
    show(fd.sec, on);
    show(rim, false);
    if (!on) { state.pinDot = null; return; }

    // portal clip while we fly in through the dot
    const T = state.dotTarget;
    if (t < A.portal[1]) {
      const pr = portalRadius(t), pw = travel(portalRadius, t);
      const pa = Math.max(0, pr - pw / 2), pb = Math.max(pa + 0.75, pr + pw / 2);
      S(fd.sec, { 'mask-image': `radial-gradient(circle at ${n3(T.x)}px ${n3(T.y)}px, #000 ${n3(pa)}px, transparent ${n3(pb)}px)` });
    } else S(fd.sec, { 'mask-image': 'none' });

    // the camera keeps travelling forward: the scene arrives from depth
    const settle = ease.out(prog(t, A.portal[0], F.drop + 0.9));
    const sc = lerp(0.8, 1, settle) * (1 + 0.045 * ease.inOutSine(prog(t, F.drop + 0.4, F.zoom[0] + 0.1)));
    const rot = lerp(5, 0, settle);

    // column copy
    rise(fd.col[0], t, F.title[0]);
    rise(fd.col[1], t, F.title[1], 0.7);
    rise(fd.col[2], t, F.title[2]);
    rise(fd.col[3], t, F.title[2] + 0.07);

    // browser pose: slow orbit, a breath of float
    const orb = ease.inOutSine(prog(t, A.portal[0], F.zoom[1]));
    const ry = lerp(-17, -6.5, orb) + 0.4 * noise(t * 0.7, 3);
    const rx = lerp(7, 2.5, orb) + 0.3 * noise(t * 0.6, 4);
    S(fd.browser, { transform: `translate3d(0,${n3(4 * noise(t * 0.8, 9))}px,0) rotateX(${n3(rx)}deg) rotateY(${n3(ry)}deg)` });

    // URL types itself, then the page loads in from top to bottom
    const typed = 'acme.com'.slice(0, Math.ceil(8 * prog(t, F.type[0], F.type[1])));
    if (fd.url.textContent !== typed) fd.url.textContent = typed;
    const blink = t < F.load + 0.05 ? 1 : 0;
    S(fd.caret, { opacity: blink ? '1' : '0' });
    fd.blocks.forEach((el, i) => {
      const d = F.load + (fd.blockTop[i] / 630) * 0.24;
      const a = ease.brand(prog(t, d, d + 0.42));
      S(el, { opacity: n3(a), transform: `translate3d(0,${n3((1 - a) * 14)}px,0)` });
    });

    // scan beam + live counter
    const bu = prog(t, F.beam[0], F.beam[1]);
    const by = lerp(-8, 640, ease.inOutSine(bu));
    S(fd.beam, { transform: `translate3d(0,${n3(by)}px,0)`, opacity: n3(clamp(bu * 12) * clamp((1 - bu) * 10)) });
    const n = Math.min(21, Math.floor(21 * clamp((t - F.beam[0]) / (F.beam[1] - F.beam[0]) * 1.02)));
    const label = `checks ${String(n).padStart(2, '0')}/21`;
    if (fd.count.textContent !== label) fd.count.textContent = label;
    const chipOut = ease.in(prog(t, F.result - 0.16, F.result));
    S(fd.chip, { opacity: n3(fadeIn(t, F.type[1], 0.3) * (1 - chipOut)), transform: `translate3d(0,${n3(-chipOut * 10)}px,0)` });
    const sb = beats(t, [4.55, 4.75, 5.0, 5.25, 5.5].filter((x) => x <= t), 10);
    S(fd.sdot, { transform: `scale(${n3(1 + 0.6 * sb)})` });
    const resIn = ease.brand(prog(t, F.result + 0.02, F.result + 0.45));
    S(fd.res, { opacity: n3(resIn), transform: `translate3d(0,${n3((1 - resIn) * 12)}px,0)` });

    // findings: highlight + pin, lifted off the page in z
    const focus = ease.inOutSine(prog(t, F.focus, F.focus + 0.3));
    PIN_ORDER.forEach((pi, k) => {
      const t0 = F.pins[k];
      const a = ease.brand(prog(t, t0, t0 + 0.5));
      const dim = pi === 0 ? 1 : 1 - 0.7 * focus;
      const grow = pi === 0 ? 1 + 0.1 * focus : 1;
      S(fd.hl[pi], { opacity: n3(a * dim * (pi === 0 ? 1 - 0.4 * focus : 1)), transform: `scale(${n3(lerp(1.06, 1, a))})` });
      S(fd.pins[pi], {
        opacity: n3(clamp(a * 1.4) * dim),
        transform: `translate3d(0,${n3((1 - a) * 16)}px,${n3(70 * a)}px) scale(${n3(lerp(0.55, 1, a) * grow)})`,
      });
    });

    // camera: settle in, then dive into the rust dot of "No meta description"
    const zu = prog(t, F.zoom[0], F.zoom[1]);
    const settleTf = `translate3d(${n3(T.x * (1 - sc))}px,${n3(T.y * (1 - sc))}px,0) scale(${n3(sc)}) rotate(${n3(rot)}deg)`;
    S(fd.cam, { transform: settleTf, 'transform-origin': '0 0' });
    if (zu > 0) {
      // measured through the settled camera, then zoomed on top of it
      const p0 = box(fd.pin1dot);
      const Z = Math.exp(Math.log(220) * ease.inExpo(zu));
      const e = ease.inOut(zu);
      const pdx = lerp(p0.cx, CX, e), pdy = lerp(p0.cy, CY, e);
      S(fd.cam, { transform: `translate3d(${n3(pdx - Z * p0.cx)}px,${n3(pdy - Z * p0.cy)}px,0) scale(${n3(Z)}) ${settleTf}` });
      const zf = (tt) => Math.exp(Math.log(220) * ease.inExpo(prog(tt, F.zoom[0], F.zoom[1])));
      state.pinDot = { x: pdx, y: pdy, r: (Math.max(p0.w, p0.h) / 2) * Z, w: (Math.max(p0.w, p0.h) / 2) * travel(zf, t) };
    } else state.pinDot = null;
  }
  function fadeIn(t, t0, d) { return ease.brand(prog(t, t0, t0 + d)); }

  /* ───────────────────────── 4 · fix ───────────────────────── */
  const DIFF = [
    { no: '12', mk: '', type: 'ctx', toks: [['k', 'export const '], ['k', 'metadata'], ['p', ' = {']] },
    { no: '13', mk: '−', type: 'del', toks: [['k', '  title: '], ['s', '"Acme"'], ['p', ',']] },
    { no: '13', mk: '+', type: 'add', toks: [['k', '  title: '], ['s', '"Acme · Product analytics"'], ['p', ',']] },
    { no: '14', mk: '+', type: 'add', toks: [['k', '  description: '], ['s', '"See where users drop off."'], ['p', ',']] },
    { no: '15', mk: '+', type: 'add', toks: [['k', '  alternates: '], ['p', '{ '], ['k', 'canonical: '], ['s', '"/"'], ['p', ' },']] },
    { no: '16', mk: '+', type: 'add', toks: [['k', '  openGraph: '], ['p', '{ '], ['k', 'images: '], ['p', '['], ['s', '"/og.png"'], ['p', '] },']] },
    { no: '17', mk: '', type: 'ctx', toks: [['p', '};']] },
  ];
  const diffEl = $('#diff');
  const lines = DIFF.map((L, i) => {
    const row = document.createElement('div');
    row.className = 'ln ' + L.type;
    row.style.top = 12 + i * 48 + 'px';
    row.innerHTML = '<div class="bg"></div><div class="sweep"></div>'
      + `<span class="no">${L.no}</span><span class="mk">${L.mk}</span><span class="cd"></span>`
      + (L.type === 'del' ? '<div class="strike"></div>' : '');
    const cd = row.querySelector('.cd');
    const spans = L.toks.map(([k, s]) => {
      const sp = document.createElement('span');
      sp.className = 'tk-' + k;
      sp.textContent = s;
      cd.appendChild(sp);
      return sp;
    });
    let caret = null;
    if (L.type === 'add') { caret = document.createElement('span'); caret.className = 'tcaret'; cd.appendChild(caret); }
    diffEl.appendChild(row);
    return { L, row, bg: row.querySelector('.bg'), sweep: row.querySelector('.sweep'), mk: row.querySelector('.mk'), no: row.querySelector('.no'), spans, caret, strike: row.querySelector('.strike'), len: L.toks.reduce((n, [, s]) => n + s.length, 0) };
  });
  const fx = {
    sec: $('#s-fix'), cam: $('#fix-cam'), col: $$('#fix-col .i'), panel: $('#panel'), flower: $('#work-flower'),
    title: $('#work-title'), steps: [1, 2, 3, 4, 5].map((i) => $('#st' + i)),
    checks: [0, 1, 2].map((i) => $('#ck' + i)), boxes: [0, 1, 2].map((i) => $('#bx' + i)),
    approve: $('#approve'), approveT: $('#approve-t'), cursor: $('#cursor'), ripple: $('#ripple'),
    toast: $('#toast'), tdot: $('#toast-dot'), tpulse: $('#toast-pulse'), tring: $('#toast-ring'), tcheck: $('#toast-check'), t1: $('#toast-t1'), t2: $('#toast-t2'),
    others: [], fb: $('#panel .fb'), hd: $('#panel .hd'),
  };
  const CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8.4 L6.4 11.6 L13 4.6" fill="none" stroke="#1E1F1C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="20" stroke-dashoffset="20"/></svg>';
  fx.boxes.forEach((b) => (b.innerHTML = CHECK_SVG));
  fx.boxPaths = fx.boxes.map((b) => b.querySelector('path'));
  fx.panelParts = [fx.hd, fx.fb, ...fx.checks, fx.approve, $('#panel .note')];
  const TOAST = { x: 1046, y: 952, w: 600 };
  const PANEL = { x: 690, y: 140, w: 1080, h: 800 };

  function stepState(i, t) {
    const X = C.fix;
    const on = [null, null, [0, 7.82], [7.82, X.toast], [X.toast, 99]][i];
    if (!on) return 'done';
    if (t >= on[1]) return 'done';
    if (t >= on[0]) return 'on';
    return '';
  }

  function renderFix(t) {
    const X = C.fix;
    const on = t >= X.cut - 0.001 && t < X.flyRing[1] + 0.3;
    show(fx.sec, on);
    if (!on) { show(fx.toast, false); show(fx.cursor, false); show(fx.ripple, false); state.delRect = null; return; }

    // camera: pull back from the struck line, then a slow 3D drift
    const pull = ease.out(prog(t, X.cut, X.cut + 1.5));
    const k = lerp(1.42, 1, pull);
    const pv = { x: 1180, y: 336 };
    const exitU = prog(t, X.flyRing[0] - 0.04, X.flyRing[1] - 0.1);
    const ex = ease.in(exitU);
    S(fx.cam, { transform: `translate3d(${n3(pv.x * (1 - k) - 260 * ex)}px,${n3(pv.y * (1 - k))}px,0) scale(${n3(k)})` });
    const orb = ease.inOutSine(prog(t, X.morph[1], X.flyRing[0]));
    S(fx.panel, {
      transform: `translate3d(0,0,${n3(-380 * ex)}px) rotateY(${n3(lerp(0, -8, orb) + 26 * ex)}deg) rotateX(${n3(lerp(0, 3, orb))}deg)`,
      opacity: n3(1 - ease.inCubic(exitU)),
    });
    fx.col.forEach((el, i) => rise(el, t, X.morph[0] + 0.2 + i * 0.07 - (i > 2 ? 0.04 : 0), 0.62, X.flyRing[0] + i * 0.03, 0.3));

    // panel chrome fades up under the rust overlay
    const pin = ease.brand(prog(t, X.morph[0] + 0.12, X.morph[1]));
    fx.panelParts.forEach((el) => S(el, { opacity: n3(pin) }));
    S(fx.flower, { transform: `scale(${n3(1 + 0.07 * Math.sin(t * Math.PI * 2 / 1.6))})` });
    const title = t < 7.82 ? 'Olmene is working' : t < X.toast ? 'Waiting for your review' : 'Pull request opened';
    if (fx.title.textContent !== title) fx.title.textContent = title;
    fx.steps.forEach((el, i) => {
      const st = stepState(i, t);
      const cls = 'step' + (st ? ' ' + st : '');
      if (el.className !== cls) el.className = cls;
    });

    // diff: context fades in, the old title is struck, new lines type in
    lines.forEach((ln, i) => {
      if (ln.L.type === 'ctx') { S(ln.row, { opacity: n3(pin) }); return; }
      if (ln.L.type === 'del') {
        S(ln.row, { opacity: '1' });
        const tx = [ln.no, ln.mk, ln.row.querySelector('.cd')];
        tx.forEach((el) => S(el, { opacity: n3(ease.brand(prog(t, X.morph[1] - 0.1, X.morph[1] + 0.12)) * lerp(1, 0.55, prog(t, X.strike + 0.1, X.strike + 0.4))) }));
        S(ln.strike, { width: px(state.delTextW + 8), transform: `scaleX(${n3(ease.brand(prog(t, X.strike, X.strike + 0.2)))})` });
        S(ln.sweep, { opacity: '0' });
        return;
      }
      const t0 = X.lines[i - 2];
      const vis = ease.brand(prog(t, t0 - 0.04, t0 + 0.12));
      S(ln.row, { opacity: n3(vis), transform: `translate3d(${n3((1 - vis) * -18)}px,0,0)` });
      const typed = Math.floor(ln.len * prog(t, t0, t0 + 0.2));
      let left = typed;
      ln.spans.forEach((sp, j) => {
        const full = ln.L.toks[j][1];
        const s = full.slice(0, Math.max(0, Math.min(full.length, left)));
        left -= full.length;
        if (sp.textContent !== s) sp.textContent = s;
      });
      S(ln.caret, { opacity: t >= t0 && t < t0 + 0.24 ? '1' : '0' });
      const su = prog(t, t0 + 0.12, t0 + 0.6);
      S(ln.sweep, { opacity: n3(Math.sin(Math.PI * su)), transform: `translate3d(${n3(lerp(-380, 1100, ease.inOutSine(su)))}px,0,0)` });
    });

    // checklist ticks
    fx.checks.forEach((el, i) => {
      const t0 = X.checks[i];
      const a = ease.brand(prog(t, t0 - 0.14, t0 + 0.3));
      S(el, { opacity: n3(a * pin), transform: `translate3d(${n3((1 - a) * 24)}px,0,0)` });
      const on = t >= t0;
      const cls = 'bx' + (on ? ' on' : '');
      if (fx.boxes[i].className !== cls) fx.boxes[i].className = cls;
      fx.boxPaths[i].setAttribute('stroke-dashoffset', n3(20 * (1 - ease.brand(prog(t, t0, t0 + 0.22)))));
    });

    // the human moment: cursor, click, approve
    const ab = box(fx.approve);
    const target = { x: ab.x + ab.w * 0.42, y: ab.y + ab.h * 0.55 };
    const cu = prog(t, X.cursor[0], X.cursor[1]);
    const ce = ease.snap(cu);
    const p0 = { x: 1460, y: 1140 }, p1 = { x: 1060, y: 780 };
    const cxp = (1 - ce) * (1 - ce) * p0.x + 2 * (1 - ce) * ce * p1.x + ce * ce * target.x;
    const cyp = (1 - ce) * (1 - ce) * p0.y + 2 * (1 - ce) * ce * p1.y + ce * ce * target.y;
    const pr = Math.sin(Math.PI * prog(t, X.click - 0.02, X.click + 0.12));
    const cOut = ease.in(prog(t, X.click + 0.32, X.click + 0.62));
    show(fx.cursor, t >= X.cursor[0] && cOut < 1);
    S(fx.cursor, { transform: `translate3d(${n3(cxp - 4 + cOut * 60)}px,${n3(cyp - 3 + cOut * 120)}px,0) scale(${n3(1 - 0.12 * pr)})`, 'transform-origin': '4px 3px', opacity: n3(1 - cOut) });
    S(fx.approve, { transform: `scale(${n3(1 - 0.045 * pr)})` });
    const at = t < X.click ? 'Approve 3 changes' : 'Approved';
    if (fx.approveT.textContent !== at) fx.approveT.textContent = at;
    ring(fx.ripple, t, X.click, target.x, target.y, 10, 120, 0.55, 0.9);

    // toast: PR opened, then merged
    const ti = ease.brand(prog(t, X.toast, X.toast + 0.5));
    const tOut = ease.in(prog(t, X.flyRing[0] + 0.02, X.flyRing[0] + 0.32));
    show(fx.toast, t >= X.toast && tOut < 1);
    S(fx.toast, { left: px(TOAST.x), top: px(TOAST.y), width: px(TOAST.w), opacity: n3(ti * (1 - tOut)), transform: `translate3d(0,${n3((1 - ti) * 70 + tOut * 40)}px,0)` });
    const merged = t >= X.merged;
    const t1 = merged ? 'PR #14 merged · live' : 'PR #14 opened · 3 fixes';
    if (fx.t1.textContent !== t1) fx.t1.textContent = t1;
    const t2 = merged ? 'verified ✓' : 'view diff →';
    if (fx.t2.textContent !== t2) fx.t2.textContent = t2;
    const mu = ease.brand(prog(t, X.merged, X.merged + 0.3));
    fx.tdot.setAttribute('r', n3(6 * (1 - mu)));
    const tp = (t - X.toast) % 0.5 / 0.5;
    fx.tpulse.setAttribute('r', n3(6 + 9 * ease.out(tp)));
    fx.tpulse.setAttribute('opacity', n3(t < X.merged ? 0.7 * (1 - tp) : 0));
    const circ = 2 * Math.PI * 13;
    fx.tring.setAttribute('stroke-dasharray', `${n3(circ * mu)} ${n3(circ)}`);
    fx.tring.setAttribute('transform', 'rotate(-90 15 15)');
    fx.tcheck.setAttribute('stroke-dasharray', '24');
    fx.tcheck.setAttribute('stroke-dashoffset', n3(24 * (1 - ease.brand(prog(t, X.merged + 0.1, X.merged + 0.34)))));
    const hand = t >= X.flyRing[0];
    S(fx.tring, { opacity: hand ? '0' : '1' });
    S(fx.tcheck, { opacity: hand ? '0' : '1' });

    // geometry the transitions need
    const dl = lines[1].bg;
    state.delRect = box(dl);
    state.toastRing = { x: TOAST.x + 22 + 15, y: TOAST.y + 22 + 15 + (1 - ti) * 70 };
  }

  /* rust dot of the finding -> struck line of the diff (match cut) */
  function renderMorph(t) {
    const F = C.find, X = C.fix;
    const phase1 = t >= F.zoom[0] && t < F.zoom[1] && state.pinDot && state.pinDot.r > 60;
    const phase2 = t >= X.cut && t < X.morph[1] && state.delRect;
    show(morph, phase1 || phase2);
    if (phase1) {
      const d = state.pinDot;
      disc(morph, d.x, d.y, d.r, d.w, rgba(RGB.rustL), { opacity: '1' });
    } else if (phase2) {
      const r = state.delRect;
      const hu = ease.out(prog(t, X.cut, X.cut + 0.3));
      const wu = ease.out(prog(t, X.cut + 0.03, X.morph[1] - 0.06));
      const cu = ease.out(prog(t, X.cut, X.cut + 0.34));
      const h = lerp(2400, r.h, hu), w = lerp(2400, r.w, wu);
      const cx = lerp(CX, r.cx, cu), cy = lerp(CY, r.cy, cu);
      const rad = Math.min(w, h) / 2 * (1 - ease.out(prog(t, X.cut + 0.1, X.morph[1] - 0.1)));
      const col = mixRGB(RGB.rustL, RGB.del, ease.inOutSine(prog(t, X.cut + 0.12, X.morph[1] - 0.08)));
      const fade = 1 - ease.inOutSine(prog(t, X.morph[1] - 0.16, X.morph[1]));
      S(morph, { left: px(cx - w / 2), top: px(cy - h / 2), width: px(w), height: px(h), 'border-radius': px(rad), 'background-color': rgba(col), 'background-image': 'none', opacity: n3(fade) });
    }
  }

  /* ───────────────────────── 5 · prove ───────────────────────── */
  const RC = { x: 960, y: 540, r: 190 };
  const pv = {
    sec: $('#s-prove'), cam: $('#prove-cam'), col: $$('#prove-col .i'), g: $('#ring-g'), track: $('#ring-track'), ticks: $('#ring-ticks'),
    glow: $('#ring-glow'), arc: $('#ring-arc'), tip: $('#ring-tip'), tipglow: $('#ring-tipglow'),
    check: $('#ring-check'), score: $('#score'), odoT: $('#odo-t'), odoO: $('#odo-o'), label: $('#score-label'), delta: $('#score-delta .i'),
    chart: $('#chart'), kpi: $('#kpi'), plot: $('#plot'),
  };
  // odometer strips: 0..9 then 0 again so the roll can wrap seamlessly
  [pv.odoT, pv.odoO].forEach((el) => { el.innerHTML = '01234567890'.split('').map((d) => `<span>${d}</span>`).join(''); });

  // chart data (example data, labelled as such on screen)
  const CH = { x0: 30, x1: 536, y0: 540, y1: 290, days: 60, vmax: 400 };
  const MARK = [{ day: 15, pr: '#9' }, { day: 28, pr: '#12' }, { day: 42, pr: '#14' }];
  const series = (() => {
    const R = rng(612);
    const out = [];
    for (let d = 0; d < CH.days; d++) {
      let v = 196 + 10 * Math.sin(d * 0.9) + 16 * (R() - 0.5);
      MARK.forEach((m, j) => { v += [26, 30, 58][j] * clamp((d - m.day) / 6); });
      out.push(v);
    }
    out[CH.days - 1] = 332;
    return out;
  })();
  const dayX = (d) => lerp(CH.x0, CH.x1, d / (CH.days - 1));
  const valY = (v) => lerp(CH.y0, CH.y1, v / CH.vmax);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent = pv.plot) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    parent.appendChild(el);
    return el;
  };
  mk('defs', {}).innerHTML = '<linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#69C27E" stop-opacity=".30"/><stop offset="1" stop-color="#69C27E" stop-opacity="0"/></linearGradient>'
    + '<clipPath id="area-clip"><rect id="area-rect" x="0" y="0" width="0" height="600"/></clipPath>'
    + '<filter id="line-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>';
  const gridLines = [100, 200, 300, 400].map((v) => mk('line', { x1: CH.x0, x2: CH.x1, y1: valY(v), y2: valY(v), stroke: 'rgba(245,244,239,.07)', 'stroke-width': 1 }));
  const base = mk('line', { x1: CH.x0, x2: CH.x1, y1: CH.y0, y2: CH.y0, stroke: 'rgba(245,244,239,.16)', 'stroke-width': 1 });
  const pts = series.map((v, d) => [dayX(d), valY(v)]);
  const lineD = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  const area = mk('path', { d: lineD + ` L${CH.x1} ${CH.y0} L${CH.x0} ${CH.y0} Z`, fill: 'url(#area-g)', 'clip-path': 'url(#area-clip)' });
  const markers = MARK.map((m) => {
    const x = dayX(m.day);
    return {
      day: m.day,
      line: mk('line', { x1: x, x2: x, y1: CH.y0, y2: CH.y1 - 8, stroke: '#D9B45A', 'stroke-width': 1.5, 'stroke-dasharray': '5 5', opacity: 0 }),
      label: mk('text', { x: x, y: CH.y1 - 18, fill: '#D9B45A', 'font-family': 'JetBrains Mono', 'font-size': 14, 'text-anchor': 'middle', opacity: 0 }),
      x,
    };
  });
  markers.forEach((m, j) => (m.label.textContent = 'PR ' + MARK[j].pr));
  const lineGlow = mk('path', { d: lineD, fill: 'none', stroke: '#69C27E', 'stroke-width': 6, opacity: 0.45, filter: 'url(#line-glow)', 'stroke-linejoin': 'round' });
  const linePath = mk('path', { d: lineD, fill: 'none', stroke: '#69C27E', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const endRing = mk('circle', { r: 8, fill: 'none', stroke: '#69C27E', 'stroke-width': 2, opacity: 0 });
  const endDot = mk('circle', { r: 7, fill: '#69C27E', opacity: 0 });
  const lineLen = linePath.getTotalLength();
  // cumulative length at each day, to place the draw head exactly
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const CHART_KEYS = () => {
    const P_ = C.prove;
    return [[P_.chart[0], 0], [P_.markers[0], MARK[0].day, ease.linear], [P_.markers[1], MARK[1].day, ease.linear], [P_.markers[2], MARK[2].day, ease.linear], [P_.chart[1], CH.days - 1, ease.outCubic]];
  };

  function arcValue(t) {
    const P_ = C.prove;
    if (t < P_.land) return 1;
    if (t < P_.count[0]) return lerp(1, 0.61, ease.brand(prog(t, P_.land, P_.count[0] - 0.02)));
    return lerp(0.61, 0.94, M.bezier(0.5, 0, 0.12, 1)(prog(t, P_.count[0], P_.count[1])));
  }

  function renderProve(t) {
    const X = C.fix, P_ = C.prove;
    const on = t >= X.flyRing[0] && t < P_.implode[1] + 0.02;
    show(pv.sec, on);
    if (!on) { state.endDot = null; return; }

    // the merged check flies over and becomes the readiness ring
    const fu = prog(t, X.flyRing[0], X.flyRing[1]);
    const fe = ease.snap(fu);
    const from = state.toastRing || { x: TOAST.x + 37, y: TOAST.y + 37 };
    const ctrl = { x: lerp(from.x, RC.x, 0.25), y: Math.min(from.y, RC.y) - 260 };
    const gx = (1 - fe) * (1 - fe) * from.x + 2 * (1 - fe) * fe * ctrl.x + fe * fe * RC.x;
    const gy = (1 - fe) * (1 - fe) * from.y + 2 * (1 - fe) * fe * ctrl.y + fe * fe * RC.y;
    const r = 13 * Math.pow(RC.r / 13, ease.inOut(fu));
    const sw = lerp(2.5, 22, ease.inOut(fu));
    const land = ease.brand(prog(t, 10.0, 10.5));
    const bump = Math.sin(Math.PI * prog(t, 10.0, 10.32)) * 0.035;
    S(pv.g, { transform: `translate(${n3(gx)}px,${n3(gy)}px) scale(${n3(1 + bump)})` });
    [pv.track, pv.glow, pv.arc].forEach((el) => { el.setAttribute('r', n3(r)); el.setAttribute('stroke-width', n3(sw)); });
    pv.ticks.setAttribute('r', n3(r * 1.18));
    S(pv.ticks, { opacity: n3(0.9 * ease.brand(prog(t, 9.0, 9.6))), transform: `rotate(${n3(lerp(-30, 0, ease.out(prog(t, 9.0, 10.2))))}deg)` });
    S(pv.track, { opacity: n3(ease.inOutSine(prog(t, X.flyRing[1] - 0.12, P_.land + 0.12))) });

    const v = arcValue(t);
    const circ = 2 * Math.PI * r;
    const col = rgba(mixRGB(RGB.mint, RGB.leaf, ease.inOutSine(fu)));
    [pv.arc, pv.glow].forEach((el) => {
      el.setAttribute('stroke-dasharray', `${n3(circ * v)} ${n3(circ * 2)}`);
      el.setAttribute('transform', 'rotate(-90)');
      el.setAttribute('stroke', col);
    });
    S(pv.glow, { opacity: n3(0.55 + 0.45 * Math.exp(-Math.max(0, t - 10.0) * 4) * (t >= 10 ? 1 : 0)) });
    const ang = -Math.PI / 2 + 2 * Math.PI * v;
    const tipOn = ease.brand(prog(t, P_.land, P_.land + 0.3));
    pv.tip.setAttribute('cx', n3(r * Math.cos(ang))); pv.tip.setAttribute('cy', n3(r * Math.sin(ang)));
    pv.tipglow.setAttribute('cx', n3(r * Math.cos(ang))); pv.tipglow.setAttribute('cy', n3(r * Math.sin(ang)));
    S(pv.tip, { opacity: n3(tipOn) });
    S(pv.tipglow, { opacity: n3(tipOn * (0.7 + 0.6 * Math.exp(-Math.max(0, t - 10.0) * 3) * (t >= 10 ? 1 : 0))) });

    // the number rolls like an odometer and lands on the beat
    const val = 100 * v;
    const shown = Math.max(61, val);
    const ones = shown % 10;
    const tens = Math.floor(shown / 10) + Math.max(0, ones - 9);
    const numIn = ease.brand(prog(t, P_.count[0] - 0.12, P_.count[0] + 0.2));
    const ck = 1 - ease.in(prog(t, X.flyRing[0] + 0.12, X.flyRing[1] - 0.02));
    pv.check.setAttribute('transform', `scale(${n3(r / 13)})`);
    pv.check.setAttribute('stroke-width', n3(2.6));
    S(pv.check, { opacity: n3(ck) });
    S(pv.odoO, { transform: `translate3d(0,${n3(-ones)}em,0)` });
    S(pv.odoT, { transform: `translate3d(0,${n3(-(tens % 10))}em,0)` });
    S(pv.score, { opacity: n3(numIn), transform: `translate3d(0,${n3((1 - numIn) * 30)}px,0) scale(${n3(1 + bump * 1.4)})` });
    S(pv.label, { opacity: n3(ease.brand(prog(t, P_.land + 0.05, P_.land + 0.4))) });
    rise(pv.delta, t, 10.08, 0.6);

    // column
    rise(pv.col[0], t, P_.land - 0.06);
    rise(pv.col[1], t, P_.land + 0.02, 0.7);
    rise(pv.col[2], t, P_.land + 0.1);
    rise(pv.col[3], t, P_.land + 0.16);

    // chart panel
    const ci = ease.brand(prog(t, 9.06, 9.62));
    S(pv.chart, { opacity: n3(ci), transform: `translate3d(${n3((1 - ci) * 160)}px,0,0)` });
    gridLines.forEach((l, i) => S(l, { opacity: n3(ease.brand(prog(t, 9.2 + i * 0.05, 9.6 + i * 0.05))) }));
    const day = track(t, CHART_KEYS());
    const di = Math.min(CH.days - 2, Math.floor(day)), df = day - di;
    const len = lerp(cum[di], cum[di + 1], df);
    [linePath, lineGlow].forEach((p) => { p.setAttribute('stroke-dasharray', `${n3(len)} ${n3(lineLen + 10)}`); });
    S(linePath, { opacity: day > 0 ? '1' : '0' });
    S(lineGlow, { opacity: day > 0 ? '0.45' : '0' });
    const hx = lerp(pts[di][0], pts[di + 1][0], df);
    const hy = lerp(pts[di][1], pts[di + 1][1], df);
    $('#area-rect').setAttribute('width', n3(hx));
    markers.forEach((m, j) => {
      const t0 = P_.markers[j];
      const a = ease.brand(prog(t, t0, t0 + 0.4));
      m.line.setAttribute('opacity', n3(a));
      m.line.setAttribute('y2', n3(lerp(CH.y0, CH.y1 - 8, a)));
      m.label.setAttribute('opacity', n3(a));
      m.label.setAttribute('transform', `translate(0 ${n3((1 - a) * 10)})`);
    });
    const done = t >= P_.chart[1];
    endDot.setAttribute('cx', n3(hx)); endDot.setAttribute('cy', n3(hy));
    endDot.setAttribute('opacity', day > 0.3 ? '1' : '0');
    const rp = done ? ((t - P_.chart[1]) % 0.5) / 0.5 : 0;
    endRing.setAttribute('cx', n3(hx)); endRing.setAttribute('cy', n3(hy));
    endRing.setAttribute('r', n3(7 + 16 * ease.out(rp)));
    endRing.setAttribute('opacity', n3(done ? 0.8 * (1 - rp) : 0));
    const kv = Math.round(38 * ease.outCubic(prog(t, P_.kpi[0], P_.kpi[1])));
    const ks = `+${kv}%`;
    if (pv.kpi.textContent !== ks) pv.kpi.textContent = ks;

    // implode into the live point of the chart
    const cb = box(pv.chart);
    const E = { x: cb.x + hx * (cb.w / 568), y: cb.y + hy * (cb.h / 600) };
    const iu = prog(t, P_.implode[0], P_.implode[1]);
    if (iu > 0) {
      const kk = 1 - ease.inQuart(iu);
      const rot = -14 * ease.inCubic(iu);
      const cam = `translate3d(${n3(E.x)}px,${n3(E.y)}px,0) rotate(${n3(rot)}deg) scale(${n3(Math.max(kk, 0.0001))}) translate3d(${n3(-E.x)}px,${n3(-E.y)}px,0)`;
      S(pv.cam, { transform: cam, opacity: n3(1 - ease.inCubic(clamp((iu - 0.35) / 0.65))) });
    } else S(pv.cam, { transform: 'none', opacity: '1' });
    if (iu === 0) state.endDot = E;
    else if (!state.endDot) state.endDot = E;
  }

  /* the live point travels to centre and gathers itself */
  const tv = { el: $('#travel'), dot: $('#tr-dot'), halo: $('#tr-halo') };
  function renderTravel(t) {
    const P_ = C.prove, L = C.logo;
    const on = t >= P_.implode[0] + 0.1 && t < L.hit + 0.02;
    show(tv.el, on);
    if (!on) return;
    const E = state.endPoint || { x: 1600, y: 420 };
    const u = ease.snap(prog(t, P_.dotCenter[0], P_.dotCenter[1]));
    const ctrl = { x: lerp(E.x, CX, 0.6), y: Math.min(E.y, CY) - 160 };
    const x = (1 - u) * (1 - u) * E.x + 2 * (1 - u) * u * ctrl.x + u * u * CX;
    const y = (1 - u) * (1 - u) * E.y + 2 * (1 - u) * u * ctrl.y + u * u * CY;
    const ch = ease.inCubic(prog(t, P_.charge[0], P_.charge[1]));
    const r = lerp(lerp(7, 12, u), 4.5, ch);
    S(tv.el, { left: px(x), top: px(y) });
    circle(tv.dot, 0, 0, r, { 'background-color': rgba(mixRGB(RGB.leaf, [236, 255, 240], ch)) });
    circle(tv.halo, 0, 0, lerp(70, 150, ch), { opacity: n3(0.6 + 0.4 * ch) });
  }

  /* ───────────────────────── 6 · logo ───────────────────────── */
  const lg = {
    sec: $('#s-logo'), cam: $('#logo-cam'), flower: $('#logo-flower'), all: $('#lf-all'),
    petals: [0, 1, 2, 3, 4].map((i) => $('#lp' + i)), letters: $$('#wordmark .i'), tag: $$('#tagline .i'),
    url: $('#url .i'), urlDot: $('#url-dot'), shock: $('#shockring'), wash: $('#logo-wash'),
  };
  function renderLogo(t) {
    const L = C.logo;
    const on = t >= L.hit;
    show(lg.sec, on);
    if (!on) return;
    // the oat world opens from the dot
    const oatR = (tt) => lerp(4, 1180, ease.out(prog(tt, L.hit, L.hit + 0.55)));
    const R = oatR(t), rw = travel(oatR, t);
    S(lg.sec, { 'mask-image': R < 1170 ? `radial-gradient(circle at 960px 540px, #000 ${n3(Math.max(0, R - rw / 2))}px, transparent ${n3(Math.max(R - rw / 2 + 0.75, R + rw / 2))}px)` : 'none' });
    ring(lg.shock, t, L.hit + 0.02, 960, 540, 20, 760, 0.9, 0.5);

    // bloom: five petals unfurl from the centre, one after another
    lg.petals.forEach((p, k) => {
      const t0 = L.hit + 0.02 + k * L.petalStagger;
      const u = ease.out(prog(t, t0, t0 + 0.95));
      const s = lerp(0.0, 1, u);
      const a = lerp(-48, 0, u);
      p.setAttribute('transform', `rotate(${n3(k * 72 + a)}) scale(${n3(s)})`);
      p.setAttribute('opacity', n3(clamp(u * 3)));
    });
    // the mark rises to sit above the wordmark, and breathes once settled
    const ru = ease.inOutCubic(prog(t, L.rise[0], L.rise[1]));
    const breathe = 1 + 0.022 * Math.sin(Math.PI * 2 * Math.max(0, t - 13.2) / 3.2);
    const fsc = lerp(1.18, 0.86, ru) * breathe;
    const spin = lerp(-58, 0, ease.out(prog(t, L.hit, L.hit + 1.25))) + 6 * Math.sin(Math.max(0, t - 13.2) * 0.5) * prog(t, 13.2, 14.2);
    S(lg.flower, { transform: `translate3d(960px,${n3(lerp(540, 334, ru))}px,0) rotate(${n3(spin)}deg) scale(${n3(fsc)})` });

    lg.letters.forEach((el, i) => {
      const t0 = L.word + i * 0.05;
      const a = ease.brand(prog(t, t0, t0 + 0.75));
      S(el, { transform: `translate3d(0,${n3((1 - a) * 150)}%,0) rotate(${n3((1 - a) * 8)}deg)` });
    });
    lg.tag.forEach((el, i) => rise(el, t, L.tag[i], 0.62));
    rise(lg.url, t, L.url, 0.62);
    const ub = ((t - L.url) % 1.0) / 1.0;
    S(lg.urlDot, { 'box-shadow': `0 0 0 ${n3(9 * ease.out(ub))}px rgba(37,96,57,${n3(0.35 * (1 - ub))})` });

    // a slow push-in to finish
    const push = lerp(1, 1.035, ease.inOutSine(prog(t, L.hit + 0.6, L.end)));
    S(lg.cam, { transform: `scale(${n3(push)})`, 'transform-origin': '960px 560px' });
    S(lg.wash, { opacity: n3(ease.brand(prog(t, L.hit, L.hit + 1.0))) });
  }

  /* ───────────────────────── frame ───────────────────────── */
  function render(t, opts) {
    SUB = (opts && opts.dt) || 0;
    renderCam(t);
    renderNight(t, ...gridCam(t));
    renderHook(t);
    renderParticles(t);
    renderAnswer(t);
    renderFind(t);
    renderFix(t);
    renderMorph(t);
    renderProve(t);
    if (t < C.prove.implode[0] + 0.1) state.endPoint = state.endDot;
    renderTravel(t);
    renderLogo(t);
    // oat scenes take a lighter vignette; blend it across each transition
    const A = C.answer, F = C.find, L = C.logo;
    const light = ease.inOutSine(prog(t, A.portal[0], A.portal[1])) * (1 - ease.inOutSine(prog(t, F.zoom[0] + 0.15, F.zoom[1])))
      + ease.inOutSine(prog(t, L.hit, L.hit + 0.5));
    return { ca: aberration(t), vig: lerp(0.32, 0.12, clamp(light)) };
  }
  /** The night grid drifts with the camera so moves read as travel. */
  function gridCam(t) {
    const X = C.fix, P_ = C.prove;
    const gx = -120 * ease.inOutCubic(prog(t, X.flyRing[0], X.flyRing[1] + 0.2)) - 40 * ease.inOutSine(prog(t, 9.2, 11.3));
    const gs = 1 - 0.16 * ease.in(prog(t, P_.implode[0], P_.implode[1] + 0.2));
    return [gx, 0, gs];
  }

  /* ───────────────────────── boot ───────────────────────── */
  function measure() {
    const slot = an.slot.getBoundingClientRect();
    const fs = 150;
    state.dotTarget = { x: slot.left + 0.075 * fs, y: slot.top - 0.062 * fs };
    const cd = lines[1].row.querySelector('.cd');
    state.delTextW = cd.getBoundingClientRect().width;
  }
  const ready = (async () => {
    const faces = ['500 150px Newsreader', 'italic 500 150px Newsreader', '600 200px Newsreader', '400 20px Inter', '500 20px Inter', '600 20px Inter', '400 20px "JetBrains Mono"', '500 20px "JetBrains Mono"'];
    await Promise.all(faces.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    // measure with everything at rest
    [an.sec, fx.sec].forEach((el) => show(el, true));
    measure();
    render(0);
    return true;
  })();

  function beginSample() {
    sampling = true;
    document.body.classList.add('sample');
    render(C.hook.dissolve[0] - 1 / 240);
    const r = box($('#customers'));
    return { x: Math.floor(r.x - 24), y: Math.floor(r.y - 10), w: Math.ceil(r.w + 48), h: Math.ceil(r.h + 30) };
  }
  function endSample(d) {
    sampling = false;
    document.body.classList.remove('sample');
    setParticles(d);
    render(0);
  }

  window.Reel = { ready, render, beginSample, endSample, cues: C, state };
})();
