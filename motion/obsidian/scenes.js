/* scenes.js: "Obsidian". Reel.render(t) poses the whole film for time t.
 *
 * One continuous camera move through a dark 3D space. The product's
 * artifacts float as lit objects; the camera glides between them on blended
 * rigs (never a cut). Structure stays achromatic. Colour only appears where
 * Olmene produces data: a rose leak, an emerald fix, a sky branch, an amber
 * "Example" label, exactly as docs/design/DESIGN.md prescribes.
 */
(function () {
  'use strict';
  const { clamp, lerp, prog, ease, rng, noise, V, Cam, DEG, S, show, n3, px, rgba } = M;
  const C = window.CUES;
  const $ = (s) => document.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const W = 1920, H = 1080, P = 1400;
  const TEL = { rose: [244, 63, 94], amber: [245, 158, 11], emerald: [16, 185, 129], sky: [56, 189, 248], white: [250, 250, 250] };
  let SUB = 0; // duration of the sub-frame being rendered (for analytic blur)

  /* ───────────────────────── the world ───────────────────────── */
  const ST = {
    s0: { el: $('#s0'), O: [0, 0, 0], yaw: 0 },
    s1: { el: $('#s1'), O: [2450, 140, -1500], yaw: -32 },
    s2: { el: $('#s2'), O: [4550, 420, -3850], yaw: -62 },
  };
  for (const k in ST) {
    const s = ST[k];
    S(s.el, { transform: `translate3d(${s.O[0]}px,${s.O[1]}px,${s.O[2]}px) rotateY(${s.yaw}deg) translate3d(-960px,-540px,0)` });
  }
  /** Station-local (designed in 1920x1080 screen px, z toward camera) to world. */
  const toWorld = (st, lx, ly, lz = 0) => V.add(st.O, Cam.orient([lx - 960, ly - 540, lz], st.yaw * DEG, 0));

  /* ───────────────────────── the camera ───────────────────────── */
  /** Frame a station point head-on at distance P*k, nudged by (dx, dy). */
  function frame(st, cx, cy, k = 1, dx = 0, dy = 0) {
    return { pos: toWorld(st, cx + dx, cy + dy, P * k), target: toWorld(st, cx + dx * 0.35, cy + dy * 0.35, 0), yaw: st.yaw };
  }
  const drift = (t, s, a = 1) => [a * 26 * noise(t * 0.33, s), a * 14 * noise(t * 0.29, s + 9)];
  const rigs = {
    open: (t) => { const u = ease.silk(prog(t, 0, 3.6)); const d = drift(t, 1, 0.6); return frame(ST.s0, 960, 540, lerp(1.1, 0.985, u), d[0] + lerp(0, 40, u), d[1]); },
    find: (t) => { const u = prog(t, 3.6, 7.6); const d = drift(t, 2); return frame(ST.s1, 975, 545, lerp(1.035, 0.985, ease.soft(u)), d[0] + lerp(-30, 25, u), d[1]); },
    fix: (t) => { const u = prog(t, 7.6, 11.6); const d = drift(t, 3); return frame(ST.s1, 985, 1240, lerp(1.035, 0.985, ease.soft(u)), d[0] + lerp(-25, 25, u), d[1]); },
    prove: (t) => { const u = prog(t, 11.6, 15.6); const d = drift(t, 4); return frame(ST.s2, 980, 545, lerp(1.035, 0.975, ease.soft(u)), d[0] + lerp(-25, 25, u), d[1]); },
    wide: (t) => {
      const u = ease.silk(prog(t, 15.0, 17.2));
      return frame(ST.s2, 1265, 560, lerp(1.0, 3.4, u), 0, lerp(0, -160, u));
    },
  };
  const LEGS = [
    ['open', C.open.depart, 'find', 260],
    ['find', C.find.depart, 'fix', 160],
    ['fix', C.fix.depart, 'prove', 300],
    ['prove', C.prove.depart, 'wide', 0],
  ];
  function camAt(t) {
    let a = 'open', b = null, u = 0, lift = 0;
    for (const [from, [t0, t1], to, l] of LEGS) {
      if (t < t0) { a = from; b = null; break; }
      if (t < t1) { a = from; b = to; u = ease.glide(prog(t, t0, t1)); lift = l; break; }
      a = to; b = null;
    }
    const ra = rigs[a](t);
    if (!b) return Object.assign(Cam.lookAt(ra.pos, ra.target, 0, P), { glide: 0, leg: a });
    const rb = rigs[b](t);
    let pos = V.lerp(ra.pos, rb.pos, u);
    const target = V.lerp(ra.target, rb.target, u);
    const back = V.norm(V.sub(pos, target));
    pos = V.add(pos, V.mul(back, lift * Math.sin(Math.PI * u)));
    const roll = -(rb.yaw - ra.yaw) * DEG * 0.12 * Math.sin(Math.PI * u);
    return Object.assign(Cam.lookAt(pos, target, roll, P), { glide: u, leg: b, from: a });
  }

  /* ───────────────────────── depth of field + light ───────────────────────── */
  const LEAVES = [
    ['#lineA', 's0', 960, 470], ['#lineB', 's0', 960, 604],
    ['#findLabel', 's1', 380, 520], ['#browser', 's1', 1250, 540], ['#pin1', 's1', 1150, 397, 40], ['#pin2', 's1', 1290, 327, 40], ['#pin3', 's1', 990, 623, 40],
    ['#fixLabel', 's1', 380, 1200], ['#diff', 's1', 1250, 1245], ['#fixrow', 's1', 1250, 1538],
    ['#proveLabel', 's2', 380, 520], ['#gauge', 's2', 1265, 540],
  ].map(([sel, st, x, y, z = 0]) => ({ el: $(sel), st, w: toWorld(ST[st], x, y, z) }));
  // when each part of the world is present: [fade in from, to, fade out from, to]
  const PRESENCE = {
    s0: [-1, 0, 3.55, 4.15],
    find: [3.0, 3.6, 99, 99],
    fix: [6.95, 7.75, 99, 99],
    s2: [10.95, 11.7, 15.45, 16.05],
  };
  const presence = (key, t) => { const [a, b, c, d] = PRESENCE[key]; return ease.soft(prog(t, a, b)) * (1 - ease.soft(prog(t, c, d))); };
  const LEAF_GROUP = { '#lineA': 's0', '#lineB': 's0', '#findLabel': 'find', '#browser': 'find', '#pin1': 'find', '#pin2': 'find', '#pin3': 'find', '#fixLabel': 'fix', '#diff': 'fix', '#fixrow': 'fix', '#proveLabel': 's2', '#gauge': 's2' };
  LEAVES.forEach((L, i) => { L.group = Object.values(LEAF_GROUP)[i]; });
  function lightLeaves(cam, t) {
    const f = V.len(V.sub(cam.target, cam.pos));
    const dim = finaleDim(t);
    for (const L of LEAVES) {
      const d = Cam.view(cam, L.w)[2];
      const off = Math.abs(d - f) / Math.max(d, 1);
      const blur = clamp(off * 13, 0, 9);
      const pres = presence(L.group, t) * dim;
      S(L.el, { opacity: n3(pres), visibility: pres > 0.002 ? 'visible' : 'hidden' });
      const lit = 1 - 0.62 * clamp(Math.abs(d - f) / 2300);
      const filt = (blur > 0.3 ? `blur(${n3(blur)}px) ` : '') + (lit < 0.995 ? `brightness(${n3(lit)})` : '');
      S(L.el, { filter: filt || 'none' });
    }
    for (const k in ST) {
      const c = ST[k].el.__center || (ST[k].el.__center = toWorld(ST[k], 960, k === 's1' ? 800 : 540));
      const d = Cam.view(cam, c)[2];
      show(ST[k].el, d > 220 && dim > 0.01);
    }
  }
  function finaleDim(t) { return 1 - ease.soft(prog(t, C.finale.dim[0], C.finale.dim[1])); }

  /* ───────────────────────── background: floor + dust ───────────────────────── */
  const bg = $('#bg').getContext('2d');
  const fg = $('#fg').getContext('2d');
  const FLOOR_Y = 1500;
  const DUST = (() => {
    const R = rng(1414);
    return Array.from({ length: 110 }, () => ({
      p: [lerp(-1800, 6800, R()), lerp(-1100, 1350, R()), lerp(-6000, 2400, R())],
      a: 30 + 70 * R(), f: 0.08 + 0.2 * R(), ph: R() * 6.28, s: 0.6 + 1.6 * R() * R(), b: 0.5 + 0.8 * R(),
    }));
  })();
  function drawFloor(cam, t) {
    bg.clearRect(0, 0, W, H);
    const fade = ease.soft(prog(t, 0.9, 2.6)) * lerp(1, 0.55, ease.soft(prog(t, C.finale.dim[0], C.finale.dim[1] + 0.8)));
    if (fade <= 0) return;
    const step = 200, X0 = -3000, X1 = 9200, Z0 = -8400, Z1 = 3000;
    bg.lineWidth = 1;
    const seg = (a, b) => {
      const pa = Cam.view(cam, a), pb = Cam.view(cam, b);
      if (pa[2] < 40 && pb[2] < 40) return;
      let A = pa, B = pb;
      if (A[2] < 40) { const u = (40 - A[2]) / (B[2] - A[2]); A = [lerp(A[0], B[0], u), lerp(A[1], B[1], u), 40]; }
      if (B[2] < 40) { const u = (40 - B[2]) / (A[2] - B[2]); B = [lerp(B[0], A[0], u), lerp(B[1], A[1], u), 40]; }
      const dm = (A[2] + B[2]) / 2;
      const a1 = 0.085 * fade * clamp((dm - 60) / 900) * Math.exp(-dm / 7200);
      if (a1 < 0.002) return;
      bg.strokeStyle = `rgba(255,255,255,${n3(a1)})`;
      bg.beginPath();
      bg.moveTo(W / 2 + A[0] * P / A[2], H / 2 + A[1] * P / A[2]);
      bg.lineTo(W / 2 + B[0] * P / B[2], H / 2 + B[1] * P / B[2]);
      bg.stroke();
    };
    const N = 10;
    for (let x = X0; x <= X1; x += step) for (let i = 0; i < N; i++) seg([x, FLOOR_Y, lerp(Z0, Z1, i / N)], [x, FLOOR_Y, lerp(Z0, Z1, (i + 1) / N)]);
    for (let z = Z0; z <= Z1; z += step) for (let i = 0; i < N; i++) seg([lerp(X0, X1, i / N), FLOOR_Y, z], [lerp(X0, X1, (i + 1) / N), FLOOR_Y, z]);
  }
  function drawDust(cam, t) {
    const f = V.len(V.sub(cam.target, cam.pos));
    const fade = ease.soft(prog(t, 0.4, 2.2)) * lerp(1, 0.4, ease.soft(prog(t, C.finale.dim[0], C.finale.dim[1] + 1)));
    fg.clearRect(0, 0, W, H);
    for (const q of DUST) {
      const p = [q.p[0] + q.a * Math.sin(q.f * t + q.ph), q.p[1] + q.a * 0.6 * Math.cos(q.f * 0.8 * t + q.ph * 1.3), q.p[2] + q.a * Math.sin(q.f * 0.6 * t + q.ph * 0.7)];
      const v = Cam.view(cam, p);
      if (v[2] < 60) continue;
      const sx = W / 2 + v[0] * P / v[2], sy = H / 2 + v[1] * P / v[2];
      if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) continue;
      const coc = clamp(Math.abs(v[2] - f) / v[2] * 26, 0, 40);
      const r = q.s * P / v[2] * 1.6 + coc;
      const a = fade * q.b * 0.22 / (1 + coc * 0.32) * clamp(v[2] / 400);
      const ctx = v[2] > f ? bg : fg;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(255,255,255,${n3(a)})`);
      g.addColorStop(0.45, `rgba(255,255,255,${n3(a * 0.45)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ───────────────────────── helpers ───────────────────────── */
  function rise(el, t, tIn, dIn = 0.7) {
    const a = ease.brand(prog(t, tIn, tIn + dIn));
    S(el, { transform: `translate3d(0,${n3((1 - a) * 128)}%,0)` });
    return a;
  }
  /** Light-wipe reveal, left to right, with a soft leading edge (px). */
  function wipeX(el, x, soft = 60) {
    if (x === null) { S(el, { 'mask-image': 'none' }); return; }
    S(el, { 'mask-image': `linear-gradient(to right, #000 0px, #000 ${n3(x - soft)}px, transparent ${n3(x)}px)` });
  }
  function bandX(el, x, w = 90) {
    S(el, { 'mask-image': `linear-gradient(to right, transparent ${n3(x - w)}px, #000 ${n3(x - 12)}px, transparent ${n3(x + 2)}px)` });
  }
  function wipeY(el, y, soft = 8) {
    if (y === null) { S(el, { 'mask-image': 'none' }); return; }
    S(el, { 'mask-image': `linear-gradient(to bottom, #000 0px, #000 ${n3(y - soft)}px, transparent ${n3(y)}px)` });
  }
  function bandY(el, y, h = 70) {
    S(el, { 'mask-image': `linear-gradient(to bottom, transparent ${n3(y - h)}px, #000 ${n3(y - 6)}px, transparent ${n3(y + 1)}px)` });
  }
  /** Glint: a specular band crossing a .metal element over [t0, t1]. */
  function glint(el, t, t0, t1) {
    const u = ease.silk(prog(t, t0, t1));
    S(el, { 'background-position': `${n3(lerp(140, -40, u))}% 0, 0 0` });
  }
  function ring(el, t, t0, cx, cy, r0, r1, dur, a0) {
    const u = prog(t, t0, t0 + dur);
    const on = t >= t0 && u < 1;
    show(el, on);
    if (on) S(el, { left: px(cx - lerp(r0, r1, ease.out(u))), top: px(cy - lerp(r0, r1, ease.out(u))), width: px(2 * lerp(r0, r1, ease.out(u))), height: px(2 * lerp(r0, r1, ease.out(u))), opacity: n3(a0 * (1 - u) * (1 - u)) });
  }

  /* ───────────────────────── S0 · the opening ───────────────────────── */
  const s0 = {
    a: $('#lineA .txt'), aHot: $('#lineA .hot'), b: $('#lineB .txt'), bHot: $('#lineB .hot'), metal: $('#metalB'),
    laser: $('#laser0'), line: $('#laserLine'), c1: $('#core1'), c2: $('#core2'),
  };
  const LASER_Y0 = 380, LASER_Y1 = 742;
  function renderOpen(t) {
    const O = C.open;
    const lw = ease.out(prog(t, O.stretch[0], O.stretch[1]));
    const su = prog(t, O.sweep[0], O.sweep[1]);
    const y = lerp(LASER_Y0, LASER_Y1, ease.silk(su));
    const fadeOut = 1 - ease.soft(prog(t, O.sweep[1] - 0.25, O.sweep[1] + 0.2));
    const on = t >= O.ignite && fadeOut > 0;
    show(s0.laser, on);
    if (on) {
      S(s0.laser, { transform: `translate3d(0,${n3(y)}px,0)`, opacity: n3(fadeOut) });
      S(s0.line, { width: px(Math.max(2, 1920 * lw)), opacity: n3(clamp((t - O.ignite) / 0.06)) });
      const flare = Math.exp(-Math.max(0, t - O.ignite) * 3.2) * clamp((t - O.ignite) / 0.05);
      const r1 = 40 + 220 * lw, r2 = 10 + 30 * lw;
      S(s0.c1, { left: px(-r1), top: px(-r1 * 0.35), width: px(2 * r1), height: px(2 * r1 * 0.35), opacity: n3(0.55 * flare) });
      S(s0.c2, { left: px(-r2), top: px(-r2), width: px(2 * r2), height: px(2 * r2), opacity: n3(0.9 * flare) });
    }
    // the laser writes both lines as it travels down
    const done = su >= 1;
    [[s0.a, s0.aHot, 418], [s0.b, s0.bHot, 552]].forEach(([txt, hot, top]) => {
      const b = y - top;
      if (done) { wipeY(txt, null); show(hot, false); return; }
      wipeY(txt, b + 2, 10);
      show(hot, b > -10 && b < 190);
      bandY(hot, b, 80);
      S(hot, { opacity: n3(0.9 * fadeOut) });
    });
    glint(s0.metal, t, O.glint[0], O.glint[1]);
  }

  /* ───────────────────────── S1 · Find ───────────────────────── */
  const fd = {
    label: $$('#findLabel .i'), title: $('#findTitle'), url: $('#urlText'), caret: $('#urlCaret'),
    blocks: $$('#page .blk'), scan: $('#scan'), readText: $('#readText'), readDot: $('#readDot'), sheen: $('#browser .sheen'),
    pins: [$('#pin1'), $('#pin2'), $('#pin3')],
  };
  fd.blockY = fd.blocks.map((b) => parseFloat(b.style.top) + parseFloat(b.style.height) / 2);
  fd.dots = fd.pins.map((p) => p.querySelector('.rd'));
  fd.checks = fd.pins.map((p) => p.querySelector('path'));
  // the scan order: nav (pin2), hero (pin1), cards (pin3)
  const PIN_AT = (i) => C.find.pins[[1, 0, 2][i]];
  function titleWipe(el, t, t0, w = 640) {
    const u = ease.silk(prog(t, t0, t0 + 0.95));
    if (u >= 1) { wipeX(el, null); return; }
    wipeX(el, lerp(-40, w + 80, u), 90);
  }
  function renderFind(t, cam) {
    const F = C.find;
    rise(fd.label[0], t, F.label[0]);
    titleWipe(fd.title, t, F.label[1], 560);
    glint(fd.title, t, F.label[1] + 0.25, F.label[1] + 1.25);
    rise(fd.label[1], t, F.label[2]);
    rise(fd.label[2], t, F.label[2] + 0.07);
    // the URL types itself; then the page lights up
    const url = 'acme-analytics.com'.slice(0, Math.round(18 * ease.soft(prog(t, F.type[0], F.type[1]))));
    if (fd.url.textContent !== url) fd.url.textContent = url;
    S(fd.caret, { opacity: t < F.load + 0.1 && Math.floor(t * 3.2) % 2 === 0 ? '1' : '0' });
    // the white laser sweeps the page; blocks brighten as it passes
    const lu = prog(t, F.laser[0], F.laser[1]);
    const ly = lerp(-10, 650, ease.soft(lu));
    S(fd.scan, { transform: `translate3d(0,${n3(ly)}px,0)`, opacity: n3(clamp(lu * 14) * clamp((1 - lu) * 9)) });
    fd.blocks.forEach((b, i) => {
      const d0 = F.load + (fd.blockY[i] / 640) * 0.22;
      const vis = 0.22 + 0.78 * ease.brand(prog(t, d0, d0 + 0.5));
      const lit = lu > 0 && lu < 1 ? Math.exp(-Math.pow((fd.blockY[i] - ly + 30) / 46, 2)) : 0;
      S(b, { opacity: n3(vis * (0.72 + 0.28 * lit + 0.12 * (lu >= 1 ? 1 : 0))) });
    });
    const n = Math.min(21, Math.floor(21 * clamp(lu * 1.03)));
    const read = t < F.leaks ? `checks ${String(n).padStart(2, '0')}/21` : '3 leaks · 18 passed';
    if (fd.readText.textContent !== read) fd.readText.textContent = read;
    S(fd.readText, { color: t < F.leaks ? 'var(--zinc-400)' : 'var(--rose)' });
    S(fd.readDot, { background: t < F.leaks ? 'var(--emerald)' : 'var(--rose)', transform: `scale(${n3(1 + 0.5 * Math.max(0, Math.sin(t * Math.PI * 2 * 2)))})` });
    // leak pins: rose until the fix lands, then an emerald check
    fd.pins.forEach((p, i) => {
      const t0 = PIN_AT(i);
      const a = ease.brand(prog(t, t0, t0 + 0.55));
      S(p, { opacity: n3(clamp(a * 1.6)), transform: `translate3d(0,${n3((1 - a) * 12)}px,${n3(40 * a)}px) scale(${n3(lerp(0.86, 1, a))})` });
      const fixT = C.fix.wires[i][1];
      const fx = ease.brand(prog(t, fixT, fixT + 0.35));
      S(fd.dots[i], { opacity: n3(1 - fx), transform: `scale(${n3(1 + 0.6 * Math.exp(-Math.max(0, t - t0) * 5) * (t >= t0 ? 1 : 0))})` });
      fd.checks[i].setAttribute('stroke-dashoffset', n3(20 * (1 - fx)));
    });
    sheenSweep(fd.sheen, t, C.open.depart, 0.07);
  }
  function sheenSweep(el, t, [t0, t1], a = 0.06) {
    const u = ease.silk(prog(t, t0 + (t1 - t0) * 0.35, t1 + 0.55));
    S(el, { '--sx': `${n3(lerp(-60, 130, u))}%`, '--sa': n3(a * Math.sin(Math.PI * u)) });
  }

  /* ───────────────────────── S1 · Fix ───────────────────────── */
  const DIFF = [
    { no: '12', mk: ' ', type: 'ctx', toks: [['a', '<head>']] },
    { no: '13', mk: '−', type: 'del', toks: [['a', '  <meta name='], ['s', '"description"'], ['a', ' content='], ['s', '""'], ['a', ' />']] },
    { no: '13', mk: '+', type: 'add', toks: [['a', '  <meta name='], ['s', '"description"'], ['a', ' content='], ['s', '"Product analytics…"'], ['a', ' />']] },
    { no: '14', mk: '+', type: 'add', toks: [['a', '  <a href='], ['s', '"/pricing"'], ['a', '>Pricing</a>']] },
    { no: '15', mk: '+', type: 'add', toks: [['a', '  <script type='], ['s', '"application/ld+json"'], ['a', '>{…}</script>']] },
    { no: '16', mk: ' ', type: 'ctx', toks: [['a', '</head>']] },
  ];
  const ROW0 = 70, ROWH = 52;
  const lines = DIFF.map((L, k) => {
    const row = document.createElement('div');
    row.className = 'ln ' + L.type;
    row.style.top = ROW0 + k * ROWH + 'px';
    row.innerHTML = `<div class="bg"></div><div class="sweep"></div><span class="no">${L.no}</span><span class="mk">${L.mk}</span><span class="cd"></span>${L.type === 'del' ? '<div class="strike"></div>' : ''}`;
    const cd = row.querySelector('.cd');
    const spans = L.toks.map(([k2, s]) => { const sp = document.createElement('span'); sp.className = 'tk-' + k2; sp.textContent = s; cd.appendChild(sp); return sp; });
    let caret = null;
    if (L.type === 'add') { caret = document.createElement('span'); caret.className = 'tcaret'; cd.appendChild(caret); }
    $('#lines').appendChild(row);
    return { L, row, spans, caret, cd, bg: row.querySelector('.bg'), mk: row.querySelector('.mk'), sweep: row.querySelector('.sweep'), strike: row.querySelector('.strike'), len: L.toks.reduce((n, [, s]) => n + s.length, 0) };
  });
  const fx = {
    label: $$('#fixLabel .i'), title: $('#fixTitle'), branch: $('#branch'), pr: $('#prchip'), example: $('#example1'),
    approve: $('#approve'), approveText: $('#approveText'), approveCheck: $('#approveCheck path'), approveSheen: $('#approveSheen'), ripple: $('#ripple'),
  };
  // wire endpoints, in station s1 coordinates (pin dot → the "+" of its line)
  const WIRES = [
    { from: [1029, 397, 40], to: [790, 1010 + ROW0 + 2 * ROWH + 26, 6] },
    { from: [1205, 327, 40], to: [790, 1010 + ROW0 + 3 * ROWH + 26, 6] },
    { from: [845, 623, 40], to: [790, 1010 + ROW0 + 4 * ROWH + 26, 6] },
  ].map((w) => {
    const a = w.from, b = w.to;
    const c1 = [a[0] - 30, a[1] + 260, a[2] + 70], c2 = [b[0] - 230, b[1] - 150, b[2] + 50];
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const u = i / 64, v = 1 - u;
      pts.push([0, 1, 2].map((j) => v * v * v * a[j] + 3 * v * v * u * c1[j] + 3 * v * u * u * c2[j] + u * u * u * b[j]));
    }
    return pts.map((p) => toWorld(ST.s1, p[0], p[1], p[2]));
  });
  function drawWires(cam, t) {
    const dim = finaleDim(t);
    WIRES.forEach((pts, i) => {
      const [w0, w1] = C.fix.wires[i];
      if (t < w0 || dim <= 0) return;
      const u = ease.silk(prog(t, w0, w1));
      const sp = pts.map((p) => Cam.project(cam, p)).filter((q) => q.d > 60);
      if (sp.length < 2) return;
      const k = sp.reduce((s, q) => s + q.s, 0) / sp.length;
      // the dashed track
      fg.save();
      fg.setLineDash([3 * k, 6 * k]);
      fg.strokeStyle = `rgba(255,255,255,${n3(0.16 * dim * clamp((t - w0) / 0.25))})`;
      fg.lineWidth = 1.2 * k;
      fg.beginPath(); sp.forEach((q, j) => (j ? fg.lineTo(q.x, q.y) : fg.moveTo(q.x, q.y))); fg.stroke();
      fg.restore();
      // the emerald fix, drawing itself pin → line
      const n = Math.max(1, Math.round(u * (sp.length - 1)));
      fg.save();
      fg.lineCap = 'round'; fg.lineJoin = 'round';
      fg.shadowColor = `rgba(16,185,129,${n3(0.85 * dim)})`; fg.shadowBlur = 14 * k;
      fg.strokeStyle = `rgba(16,185,129,${n3(dim)})`; fg.lineWidth = 2.2 * k;
      fg.beginPath(); for (let j = 0; j <= n; j++) (j ? fg.lineTo(sp[j].x, sp[j].y) : fg.moveTo(sp[j].x, sp[j].y)); fg.stroke();
      fg.restore();
      // a spark rides the head; afterwards, a packet of light travels the wire
      const head = sp[n];
      const sparkA = u < 1 ? 1 : Math.exp(-(t - w1) * 6);
      const packets = t > w1 + 0.3 ? [((t - w1 - 0.3) / 1.35) % 1] : [];
      [[head, sparkA, 6]].concat(packets.map((pu) => [sp[Math.min(sp.length - 1, Math.floor(ease.soft(pu) * (sp.length - 1)))], 0.75 * Math.sin(Math.PI * pu), 4.5])).forEach(([q, a, r]) => {
        if (!q || a <= 0.01) return;
        const g = fg.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4 * k);
        g.addColorStop(0, `rgba(230,255,244,${n3(a * dim)})`);
        g.addColorStop(0.25, `rgba(16,185,129,${n3(0.7 * a * dim)})`);
        g.addColorStop(1, 'rgba(16,185,129,0)');
        fg.fillStyle = g; fg.beginPath(); fg.arc(q.x, q.y, r * 4 * k, 0, Math.PI * 2); fg.fill();
      });
    });
  }
  function renderFix(t) {
    const X = C.fix;
    rise(fx.label[0], t, X.label[0]);
    titleWipe(fx.title, t, X.label[1], 470);
    glint(fx.title, t, X.label[1] + 0.25, X.label[1] + 1.25);
    rise(fx.label[1], t, X.label[2]);
    rise(fx.label[2], t, X.label[2] + 0.07);
    lines.forEach((ln, k) => {
      if (ln.L.type !== 'add') {
        if (ln.strike) {
          const su = ease.brand(prog(t, X.strike, X.strike + 0.32));
          S(ln.strike, { width: px(ln.cd.getBoundingClientRect ? ln.textW || (ln.textW = ln.cd.offsetWidth + 8) : 600), transform: `scaleX(${n3(su)})` });
          S(ln.cd, { opacity: n3(lerp(1, 0.5, su)) });
          S(ln.row, { transform: `translate3d(${n3(-6 * su)}px,0,0)` });
        }
        return;
      }
      const i = k - 2, t0 = X.wires[i][1];
      const vis = ease.brand(prog(t, t0 - 0.05, t0 + 0.2));
      S(ln.bg, { opacity: n3(vis) });
      S(ln.mk, { opacity: n3(vis) });
      const typed = Math.floor(ln.len * ease.soft(prog(t, t0, t0 + 0.32)));
      let left = typed;
      ln.spans.forEach((sp, j) => {
        const full = ln.L.toks[j][1];
        const s = full.slice(0, Math.max(0, Math.min(full.length, left)));
        left -= full.length;
        if (sp.textContent !== s) sp.textContent = s;
      });
      S(ln.caret, { opacity: t >= t0 && t < t0 + 0.4 ? '1' : '0' });
      const su = prog(t, t0 + 0.15, t0 + 0.9);
      S(ln.sweep, { opacity: n3(Math.sin(Math.PI * su)), transform: `translate3d(${n3(lerp(-400, 1150, ease.soft(su)))}px,0,0)` });
    });
    // branch, PR, example: the provenance of the change
    [fx.branch, fx.pr, fx.example].forEach((el, i) => {
      const a = ease.brand(prog(t, X.branch[i], X.branch[i] + 0.5));
      S(el, { opacity: n3(a), transform: `translate3d(${n3((1 - a) * -14)}px,0,0)` });
    });
    // approve: a press, a ripple, a check
    const pr = Math.sin(Math.PI * prog(t, X.click - 0.04, X.click + 0.16));
    S(fx.approve, { transform: `scale(${n3(1 - 0.035 * pr)})` });
    const txt = t < X.click + 0.05 ? 'Approve 3 changes' : 'Approved';
    if (fx.approveText.textContent !== txt) fx.approveText.textContent = txt;
    const ck = ease.brand(prog(t, X.click + 0.05, X.click + 0.4));
    fx.approveCheck.setAttribute('stroke-dashoffset', n3(22 * (1 - ck)));
    S($('#approveCheck'), { display: t >= X.click + 0.05 ? 'block' : 'none' });
    const sh = prog(t, X.click - 0.6, X.click + 0.1);
    S(fx.approveSheen, { transform: `translate3d(${n3(lerp(-200, 500, ease.soft(sh)))}px,0,0)`, opacity: n3(Math.sin(Math.PI * sh)) });
    const bx = 700 + 1100 - 130, by = 1508 + 29;
    ring(fx.ripple, t, X.click, bx, by, 20, 190, 0.7, 0.55);
  }

  /* ───────────────────────── S2 · Prove ───────────────────────── */
  const gs = $('#gaugeSvg');
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent = gs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; };
  const GC = { x: 505, y: 408, r: 250 };
  const ARC = Math.PI * GC.r;
  const arcD = `M ${GC.x - GC.r} ${GC.y} A ${GC.r} ${GC.r} 0 0 1 ${GC.x + GC.r} ${GC.y}`;
  for (let i = 0; i <= 50; i++) {
    const a = Math.PI + (i / 50) * Math.PI, major = i % 5 === 0;
    const r0 = GC.r + 30, r1 = GC.r + (major ? 48 : 40);
    mk('line', { x1: GC.x + r0 * Math.cos(a), y1: GC.y + r0 * Math.sin(a), x2: GC.x + r1 * Math.cos(a), y2: GC.y + r1 * Math.sin(a), stroke: `rgba(255,255,255,${major ? 0.32 : 0.14})`, 'stroke-width': major ? 2 : 1.4, 'stroke-linecap': 'round' });
  }
  mk('path', { d: arcD, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 20, 'stroke-linecap': 'round' });
  const arcAmber = mk('path', { d: arcD, fill: 'none', stroke: '#F59E0B', 'stroke-width': 20, 'stroke-linecap': 'round' });
  const arcEm = mk('path', { d: arcD, fill: 'none', stroke: '#10B981', 'stroke-width': 20, 'stroke-linecap': 'round' });
  const needle = mk('g', {});
  mk('line', { x1: 0, y1: 16, x2: 0, y2: -(GC.r - 46), stroke: '#FAFAFA', 'stroke-width': 4, 'stroke-linecap': 'round' }, needle);
  mk('circle', { cx: GC.x, cy: GC.y, r: 15, fill: '#FAFAFA' });
  mk('circle', { cx: GC.x, cy: GC.y, r: 6, fill: '#121216' });
  const pv = {
    label: $$('#proveLabel .i'), title: $('#proveTitle'), score: $('#score'), odoT: $('#odoT'), odoO: $('#odoO'), merged: $('#merged'),
    sheen: $('#gauge .sheen'), bridgePr: $('#bridgePr'), s94: $('#score94'),
  };
  [pv.odoT, pv.odoO].forEach((el) => { el.innerHTML = '01234567890'.split('').map((d) => `<span>${d}</span>`).join(''); });
  const bs = $('#bridgeSvg');
  mk('path', { d: 'M 150 32 L 740 32', stroke: 'rgba(255,255,255,.16)', 'stroke-width': 1.5, 'stroke-dasharray': '3 6', fill: 'none' }, bs);
  const bridgeLine = mk('path', { d: 'M 150 32 L 740 32', stroke: '#38BDF8', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }, bs);
  /** The site's damped spring (a = 170·(94 − x) − 17·v), solved analytically. */
  function spring(t) {
    const tau = t - C.prove.spring;
    if (tau <= 0) return 61;
    const w = Math.sqrt(170), zw = 8.5, wd = Math.sqrt(170 - zw * zw);
    return 94 - 33 * Math.exp(-zw * tau) * (Math.cos(wd * tau) + (zw / wd) * Math.sin(wd * tau));
  }
  function renderProve(t) {
    const R_ = C.prove;
    rise(pv.label[0], t, R_.label[0]);
    titleWipe(pv.title, t, R_.label[1], 600);
    glint(pv.title, t, R_.label[1] + 0.25, R_.label[1] + 1.25);
    rise(pv.label[1], t, R_.label[2]);
    rise(pv.label[2], t, R_.label[2] + 0.07);
    // merged: the chip turns emerald (crossfade in colour, never on structure)
    const mu = ease.brand(prog(t, R_.merged, R_.merged + 0.35));
    S(pv.merged, { color: `rgb(${[0, 1, 2].map((j) => Math.round(lerp(150, TEL.emerald[j], mu))).join(',')})`, 'border-color': `rgba(${TEL.emerald.join(',')},${n3(0.42 * mu)})`, background: `rgba(16,185,129,${n3(0.10 * mu)})` });
    // the needle springs; the readout counts and lands on 94
    const x = spring(t), p = clamp(x / 100, 0, 1);
    needle.setAttribute('transform', `translate(${GC.x} ${GC.y}) rotate(${n3(-90 + p * 180)})`);
    const good = clamp((x - 89.5) / 1.0);
    arcAmber.setAttribute('stroke-dasharray', `${n3(ARC * p)} ${n3(ARC * 2)}`);
    arcEm.setAttribute('stroke-dasharray', `${n3(ARC * p)} ${n3(ARC * 2)}`);
    arcAmber.setAttribute('opacity', n3(1 - good));
    arcEm.setAttribute('opacity', n3(good));
    const v = Math.min(94, Math.max(61, x));
    const ones = v % 10, tens = Math.floor(v / 10) + Math.max(0, ones - 9);
    S(pv.odoO, { transform: `translate3d(0,${n3(-ones)}em,0)` });
    S(pv.odoT, { transform: `translate3d(0,${n3(-(tens % 10))}em,0)` });
    S(pv.score, { color: good > 0.5 ? 'var(--emerald)' : 'var(--fg)' });
    // the score bridge: 61 → PR #14 → 94
    const bu = ease.soft(prog(t, R_.bridge[0], R_.bridge[1]));
    bridgeLine.setAttribute('stroke-dasharray', `${n3(590 * bu)} 600`);
    const pa = ease.brand(prog(t, R_.pr, R_.pr + 0.45));
    S(pv.bridgePr, { opacity: n3(pa), transform: `scale(${n3(lerp(0.88, 1, pa))})` });
    const sa = ease.brand(prog(t, R_.s94, R_.s94 + 0.5));
    S(pv.s94, { opacity: n3(sa), transform: `translate3d(${n3((1 - sa) * 16)}px,0,0)` });
    sheenSweep(pv.sheen, t, C.fix.depart, 0.07);
  }

  /* ───────────────────────── finale ───────────────────────── */
  const fn = {
    root: $('#finale'), flower: $('#flower'), petals: [0, 1, 2, 3, 4].map((i) => $('#fp' + i)), all: $('#fl-all'),
    word: $('#wordmark .txt'), wordHot: $('#wordmark .hot'), tag: $('#tagline .i'), url: $('#url .i'), live: $('#liveDot'),
  };
  const cs = $('#cardSvg');
  const CARD = { w: 1400, h: 780, r: 40 };
  const perim = 2 * (CARD.w + CARD.h - 4 * CARD.r) + 2 * Math.PI * CARD.r;
  const rectAttrs = { x: 0.5, y: 0.5, width: CARD.w - 1, height: CARD.h - 1, rx: CARD.r, fill: 'none' };
  const cardBase = mk('rect', Object.assign({ stroke: 'rgba(255,255,255,.12)', 'stroke-width': 1.5 }, rectAttrs), cs);
  const cardGlow = mk('rect', Object.assign({ stroke: 'rgba(255,255,255,.55)', 'stroke-width': 6, filter: 'blur(6px)' }, rectAttrs), cs);
  const cardLight = mk('rect', Object.assign({ stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' }, rectAttrs), cs);
  const laserF = document.createElement('div');
  laserF.className = 'laser';
  laserF.style.cssText = 'position:absolute;top:539px;left:960px';
  fn.root.prepend(laserF);
  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;left:0;top:0;border-radius:50%;background:radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,.35) 22%, rgba(255,255,255,.06) 55%, rgba(255,255,255,0));';
  const streak = document.createElement('div');
  streak.style.cssText = 'position:absolute;left:0;top:0;border-radius:50%;background:radial-gradient(closest-side, rgba(255,255,255,.7), rgba(255,255,255,.12) 40%, rgba(255,255,255,0));';
  fn.root.prepend(streak);
  fn.root.prepend(flash);
  const FL_Y = 300, WORD_W = 560;
  function renderFinale(t) {
    const Fn = C.finale;
    const on = t >= Fn.laser[0];
    show(fn.root, on);
    if (!on) return;
    // the laser returns and condenses into the mark
    const grow = ease.out(prog(t, Fn.laser[0], Fn.hit));
    const shrink = ease.inOutCubic(prog(t, Fn.hit, Fn.hit + 0.55));
    const lw = 1920 * grow * (1 - shrink);
    S(laserF, { width: px(Math.max(0, lw)), opacity: n3(lw > 2 ? 1 : 0) });
    const fl = Math.exp(-Math.max(0, t - Fn.hit) * 3.2) * clamp((t - Fn.hit + 0.04) / 0.04);
    const fr = 70 + 110 * (1 - Math.exp(-Math.max(0, t - Fn.hit) * 4));
    S(flash, { left: px(960 - fr), top: px(540 - fr), width: px(2 * fr), height: px(2 * fr), opacity: n3(0.85 * fl) });
    const sw = 700 + 500 * (1 - Math.exp(-Math.max(0, t - Fn.hit) * 3)), sh = 26;
    S(streak, { left: px(960 - sw), top: px(540 - sh), width: px(2 * sw), height: px(2 * sh), opacity: n3(0.75 * fl) });
    // the flower blooms from the light, then rises into the lockup
    fn.petals.forEach((pt, k) => {
      const t0 = Fn.hit + 0.04 + k * Fn.petalStagger;
      const u = ease.silk(prog(t, t0, t0 + 1.0));
      pt.setAttribute('transform', `rotate(${n3(k * 72 + lerp(-38, 0, u))}) scale(${n3(lerp(0.15, 1, u))})`);
      pt.setAttribute('opacity', n3(clamp(u * 2.4)));
    });
    const ru = ease.glide(prog(t, Fn.rise[0], Fn.rise[1]));
    const breathe = 1 + 0.016 * Math.sin(Math.PI * 2 * Math.max(0, t - 17.6) / 3.2);
    const spin = lerp(-30, 0, ease.silk(prog(t, Fn.hit, Fn.hit + 1.5)));
    S(fn.flower, { transform: `translate3d(0,${n3(lerp(540, FL_Y, ru))}px,0) rotate(${n3(spin)}deg) scale(${n3(lerp(1.12, 0.84, ru) * breathe)})` });
    // light writes the wordmark
    const wu = ease.silk(prog(t, Fn.word[0], Fn.word[1]));
    const x = lerp(-60, 1920 / 2 + WORD_W / 2 + 120, wu);
    const wx = x - (960 - WORD_W / 2) + 960 - WORD_W / 2;
    if (wu >= 1) { wipeX(fn.word, null); show(fn.wordHot, false); }
    else { wipeX(fn.word, wx, 70); show(fn.wordHot, wu > 0); bandX(fn.wordHot, wx, 110); }
    rise(fn.tag, t, Fn.tag, 0.8);
    rise(fn.url, t, Fn.url, 0.8);
    const lp = Math.max(0, t - Fn.url - 0.3) % 1.6 / 1.6;
    S(fn.live, { 'box-shadow': `0 0 0 ${n3(10 * ease.out(lp))}px rgba(16,185,129,${n3(0.4 * (1 - lp) * (t > Fn.url + 0.3 ? 1 : 0))}), 0 0 12px rgba(16,185,129,.6)` });
    // the card frame draws itself, then a light travels its edge
    const cu = ease.silk(prog(t, Fn.card[0], Fn.card[1]));
    cardBase.setAttribute('stroke-dasharray', `${n3(perim * cu)} ${n3(perim)}`);
    cardBase.setAttribute('stroke-dashoffset', n3(-perim * 0.5 * (1 - cu)));
    const eu = prog(t, Fn.edge[0], Fn.edge[1]);
    const seg = 260 * Math.sin(Math.PI * clamp(eu * 1.15));
    const off = -perim * (0.08 + 0.92 * ease.soft(eu)) + perim * 0.25;
    [cardLight, cardGlow].forEach((r) => { r.setAttribute('stroke-dasharray', `${n3(seg)} ${n3(perim)}`); r.setAttribute('stroke-dashoffset', n3(off)); });
    S(cardGlow, { opacity: n3(seg > 1 ? 0.7 : 0) });
    S(cardLight, { opacity: n3(seg > 1 ? 1 : 0) });
    const push = lerp(1, 1.03, ease.soft(prog(t, Fn.hit, Fn.end)));
    S(fn.root, { transform: `scale(${n3(push)})`, 'transform-origin': '960px 540px' });
  }

  /* ───────────────────────── frame ───────────────────────── */
  const world = $('#world'), cone = $('#cone'), blackout = $('#blackout');
  let lastCam = null;
  function render(t, opts) {
    SUB = (opts && opts.dt) || 0;
    const cam = camAt(t);
    lastCam = cam;
    S(world, { transform: Cam.css(cam) });
    lightLeaves(cam, t);
    drawFloor(cam, t);
    drawDust(cam, t);
    renderOpen(t);
    renderFind(t, cam);
    renderFix(t);
    drawWires(cam, t);
    renderProve(t);
    renderFinale(t);
    S(cone, { opacity: n3((0.8 + 0.2 * Math.sin(t * 0.9)) * ease.soft(prog(t, 0.2, 2.0))) });
    S(blackout, { opacity: n3(1 - ease.soft(prog(t, C.open.fadeIn[0], C.open.fadeIn[1]))) });
    return { vig: 0.36 };
  }

  const ready = (async () => {
    const faces = ['500 108px Newsreader', '600 176px Newsreader', '400 20px Inter', '600 20px Inter', '400 20px "JetBrains Mono"', '500 20px "JetBrains Mono"'];
    await Promise.all(faces.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    render(0);
    return true;
  })();

  window.Reel = {
    ready, render, cues: C,
    // for checking the camera maths against Chromium's own layout
    probe: (t, sel) => { render(t); const r = document.querySelector(sel).getBoundingClientRect(); return { rect: [r.left, r.top, r.width, r.height], cam: lastCam }; },
    project: (t, st, x, y, z = 0) => { const cam = camAt(t); return Cam.project(cam, toWorld(ST[st], x, y, z)); },
    beginSample: () => ({ x: 0, y: 0, w: 1, h: 1 }), endSample: () => {},
  };
})();
