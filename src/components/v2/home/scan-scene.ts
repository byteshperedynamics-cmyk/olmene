/**
 * The homepage's signature moment (DESIGN.md §11): a real-time 3D scene of a
 * homepage being scanned. A light plane sweeps the page, three problems light
 * up where they are, pull request #14 lands, each problem turns green and the
 * readiness score climbs from 61 to 94.
 *
 * Plain three.js, loaded on demand by scan-stage.tsx after the hero has
 * painted, so the headline (the LCP element) never waits on it. HTML overlays
 * (chips, score, PR card) stay crisp: the scene only moves them. Rendering
 * stops when the stage is off screen or the tab is hidden; reduced motion gets
 * the finished state, rendered once.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface SceneHandle {
  dispose(): void;
  setPaused(paused: boolean): void;
  setUrl(url: string): void;
  setTheme(dark: boolean): void;
}

export interface SceneOptions {
  host: HTMLElement;
  chips: HTMLElement[];
  pr: HTMLElement;
  score: HTMLElement;
  scoreBox: HTMLElement;
  reduced: boolean;
  dark: boolean;
  url: string;
  fontFamily: string;
  onFirstFrame: () => void;
}

// ── Page texture ────────────────────────────────────────────────────────────

const TEX_W = 2048;
const TEX_H = 1280;
const SAMPLE_HOST = "acme-analytics.com";

/** Where each finding sits on the page texture, in texture pixels. */
const PINS = [
  { x: 1655, y: 36 }, // <head>: no meta description (shown at the address bar)
  { x: 1652, y: 126 }, // nav: no pricing link
  { x: 104, y: 300 }, // hero headline (left edge): no structured data for AI search
];

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function cleanHost(url: string): string {
  const h = url.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  return /^[a-z0-9.-]{3,60}$/.test(h) && h.includes(".") ? h : SAMPLE_HOST;
}

/** A believable light-theme SaaS homepage (the example customer, labelled "Example" on the stage). */
function drawPage(g: CanvasRenderingContext2D, host: string, font: string) {
  const f = (w: number, px: number) => `${w} ${px}px ${font}`;
  g.clearRect(0, 0, TEX_W, TEX_H);
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, TEX_W, TEX_H);

  // Browser chrome
  g.fillStyle = "#F4F4F5";
  g.fillRect(0, 0, TEX_W, 74);
  g.fillStyle = "#E4E4E7";
  g.fillRect(0, 73, TEX_W, 2);
  ["#D4D4D8", "#D4D4D8", "#D4D4D8"].forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(40 + i * 28, 37, 8, 0, Math.PI * 2);
    g.fill();
  });
  roundRect(g, 300, 16, 1448, 42, 21);
  g.fillStyle = "#FFFFFF";
  g.fill();
  g.strokeStyle = "#E4E4E7";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "#A1A1AA";
  roundRect(g, 330, 30, 12, 14, 3);
  g.fill();
  g.fillStyle = "#52525B";
  g.font = f(500, 24);
  g.textBaseline = "middle";
  g.fillText(host, 358, 38);

  // Site nav (no Pricing link: one of the three findings)
  g.fillStyle = "#09090B";
  g.beginPath();
  g.moveTo(120, 146);
  g.lineTo(140, 108);
  g.lineTo(160, 146);
  g.closePath();
  g.fill();
  g.font = f(700, 34);
  g.fillText("Acme", 176, 128);
  g.font = f(500, 25);
  g.fillStyle = "#52525B";
  ["Product", "Customers", "Docs", "Blog"].forEach((l, i) => g.fillText(l, 1080 + i * 140, 128));
  roundRect(g, 1770, 102, 158, 52, 26);
  g.strokeStyle = "#D4D4D8";
  g.stroke();
  g.fillStyle = "#09090B";
  g.font = f(600, 24);
  g.fillText("Sign in", 1808, 129);

  // Hero copy
  g.fillStyle = "#09090B";
  g.font = f(700, 100);
  g.fillText("Product analytics", 116, 320);
  g.fillText("for small teams.", 116, 440);
  g.fillStyle = "#52525B";
  g.font = f(400, 32);
  g.fillText("See where users drop off in your product", 120, 545);
  g.fillText("and fix it the same day.", 120, 590);
  roundRect(g, 120, 650, 268, 74, 37);
  g.fillStyle = "#09090B";
  g.fill();
  g.fillStyle = "#FFFFFF";
  g.font = f(600, 28);
  g.fillText("Start free", 186, 688);
  roundRect(g, 408, 650, 250, 74, 37);
  g.strokeStyle = "#D4D4D8";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "#09090B";
  g.fillText("Book a demo", 452, 688);

  // Product card with a chart
  const cx = 1090;
  const cy = 236;
  roundRect(g, cx, cy, 840, 540, 28);
  g.fillStyle = "#FAFAFA";
  g.fill();
  g.strokeStyle = "#E4E4E7";
  g.stroke();
  g.fillStyle = "#71717A";
  g.font = f(500, 24);
  g.fillText("Weekly active users", cx + 44, cy + 62);
  g.fillStyle = "#09090B";
  g.font = f(700, 60);
  g.fillText("12,480", cx + 44, cy + 132);
  g.fillStyle = "#52525B";
  g.font = f(500, 24);
  g.fillText("+8.2% vs last week", cx + 300, cy + 136);
  const pts = [0.62, 0.58, 0.64, 0.55, 0.5, 0.56, 0.44, 0.47, 0.38, 0.4, 0.31, 0.27];
  const x0 = cx + 44;
  const x1 = cx + 796;
  const y0 = cy + 200;
  const y1 = cy + 470;
  const P = pts.map((v, i) => [x0 + ((x1 - x0) * i) / (pts.length - 1), y0 + (y1 - y0) * v] as const);
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, "rgba(9,9,11,0.12)");
  grad.addColorStop(1, "rgba(9,9,11,0)");
  g.beginPath();
  g.moveTo(P[0][0], y1);
  P.forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(P[P.length - 1][0], y1);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.beginPath();
  P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.strokeStyle = "#09090B";
  g.lineWidth = 5;
  g.lineJoin = "round";
  g.stroke();
  g.strokeStyle = "#E4E4E7";
  g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = y0 + ((y1 - y0) * i) / 3;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
  }

  // Feature row
  [
    ["Funnels", "Find the step where signups stall."],
    ["Retention", "Cohorts by week, plan and channel."],
    ["Session replay", "Watch the visits that churned."],
  ].forEach(([title, body], i) => {
    const x = 120 + i * 610;
    roundRect(g, x, 880, 570, 280, 26);
    g.fillStyle = "#FAFAFA";
    g.fill();
    g.strokeStyle = "#E4E4E7";
    g.stroke();
    roundRect(g, x + 40, 920, 56, 56, 14);
    g.fillStyle = "#09090B";
    g.fill();
    g.fillStyle = "#09090B";
    g.font = f(700, 34);
    g.fillText(title, x + 40, 1036);
    g.fillStyle = "#71717A";
    g.font = f(400, 26);
    g.fillText(body, x + 40, 1088);
  });
}

function gradientTexture(stops: Array<[number, string]>, w = 4, h = 256, radial = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = radial ? h : w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = radial ? g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2) : g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gridTexture(dark: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "rgba(9,9,11,0.16)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(36, 36);
  t.anisotropy = 8;
  return t;
}

// ── Timeline ────────────────────────────────────────────────────────────────

const LOOP = 12.5; // seconds
const SWEEP_START = 0.5;
const SWEEP_END = 2.9;
const PR_AT = 3.4;
const FIX_AT = [3.9, 4.4, 4.9];
const RESET_AT = 11.2;
const FINAL_T = 9; // the held finished state (reduced motion, paused)

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function scoreAt(t: number): number {
  const p = clamp01((t - FIX_AT[0]) / (FIX_AT[2] + 0.9 - FIX_AT[0]));
  return Math.round(61 + (94 - 61) * (1 - Math.pow(1 - p, 3)));
}

// ── Scene ───────────────────────────────────────────────────────────────────

const ROSE = new THREE.Color("#F43F5E");
const EMERALD = new THREE.Color("#10B981");

export function mountScanScene(o: SceneOptions): SceneHandle {
  const { host } = o;
  const disposers: Array<() => void> = [];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = "o-stage-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 60);

  // Key light for a specular edge on the frame
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 4, 5);
  scene.add(key);

  // ── The page slab
  const SW = 3.2;
  const SH = SW * (TEX_H / TEX_W);
  const slab = new THREE.Group();
  scene.add(slab);

  const bezel = new THREE.Mesh(
    new RoundedBoxGeometry(SW + 0.12, SH + 0.12, 0.09, 6, 0.06),
    new THREE.MeshPhysicalMaterial({ color: "#1d1d22", metalness: 0.92, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
  );
  slab.add(bezel);

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = TEX_W;
  pageCanvas.height = TEX_H;
  const pageCtx = pageCanvas.getContext("2d")!;
  let host_ = cleanHost(o.url);
  drawPage(pageCtx, host_, o.fontFamily);
  const pageTex = new THREE.CanvasTexture(pageCanvas);
  pageTex.colorSpace = THREE.SRGBColorSpace;
  pageTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // The page itself is unlit and untoned so white stays white and text stays sharp;
  // a thin glass layer on top picks up the room reflections.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: pageTex, toneMapped: false }));
  screen.position.z = 0.0455;
  slab.add(screen);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SH),
    new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.06, transparent: true, opacity: 0.1, envMapIntensity: 1.6, depthWrite: false }),
  );
  glass.position.z = 0.047;
  slab.add(glass);

  // ── Scan beam: a bright line, a soft trailing glow and the scanned tint
  const beam = new THREE.Group();
  const beamLine = new THREE.Mesh(
    new THREE.PlaneGeometry(SW * 1.04, 0.008),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const glowTex = gradientTexture([
    [0, "rgba(255,255,255,0)"],
    [0.82, "rgba(200,210,255,0.28)"],
    [1, "rgba(255,255,255,0.9)"],
  ]);
  const glowGeo = new THREE.PlaneGeometry(SW, 0.3);
  glowGeo.translate(0, 0.15, 0); // origin at the line, glow trails upward over the scanned part
  const beamGlow = new THREE.Mesh(
    glowGeo,
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.add(beamLine, beamGlow);
  beam.position.z = 0.06;
  slab.add(beam);

  const scannedGeo = new THREE.PlaneGeometry(SW, 1);
  scannedGeo.translate(0, -0.5, 0); // origin at the top edge, grows downward
  const scanned = new THREE.Mesh(
    scannedGeo,
    new THREE.MeshBasicMaterial({ color: "#9aa4ff", transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scanned.position.set(0, SH / 2, 0.05);
  slab.add(scanned);

  // ── Pins: a bead, a halo and a ring pulse at each finding
  const haloTex = gradientTexture(
    [
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,0.45)"],
      [1, "rgba(255,255,255,0)"],
    ],
    4,
    128,
    true,
  );
  const pins = PINS.map((p) => {
    const g = new THREE.Group();
    g.position.set((p.x / TEX_W - 0.5) * SW, (0.5 - p.y / TEX_H) * SH, 0.11);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshBasicMaterial({ color: ROSE.clone() }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: ROSE.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.34);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.062, 48),
      new THREE.MeshBasicMaterial({ color: ROSE.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.065, 8),
      new THREE.MeshBasicMaterial({ color: ROSE.clone(), transparent: true, opacity: 0.6 }),
    );
    stem.rotation.x = Math.PI / 2;
    stem.position.z = -0.033;
    g.add(stem, halo, bead, ring);
    g.scale.setScalar(0.0001);
    slab.add(g);
    return { g, bead, halo, ring, stem, y: (0.5 - p.y / TEX_H) * SH };
  });

  // ── Floor: a fading grid and a soft contact shadow
  let grid = gridTexture(o.dark);
  const floorMat = new THREE.MeshBasicMaterial({ map: grid, transparent: true, opacity: 0.55, depthWrite: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.32;
  scene.add(floor);
  const shadowTex = gradientTexture(
    [
      [0, "rgba(0,0,0,0.55)"],
      [1, "rgba(0,0,0,0)"],
    ],
    4,
    128,
    true,
  );
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.3;
  scene.add(shadow);

  const fogColor = () => new THREE.Color(o.dark ? "#09090B" : "#FAFAFA");
  scene.fog = new THREE.Fog(fogColor(), 7, 17);

  // ── Layout
  let width = 1;
  let height = 1;
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fitW = (SW * 1.32) / (2 * tan * camera.aspect);
    const fitH = (SH * 1.9) / (2 * tan);
    const d = Math.max(fitW, fitH);
    camera.position.set(0, 0.62, d);
    camera.lookAt(0, -0.12, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ── Input: pointer parallax and scroll
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  const onLeave = () => {
    pointer.tx = 0;
    pointer.ty = 0;
  };
  if (!o.reduced) {
    host.addEventListener("pointermove", onPointer);
    host.addEventListener("pointerleave", onLeave);
  }

  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) kick();
  });
  io.observe(host);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  // ── Overlay state (DOM writes only on change)
  const chipState: string[] = o.chips.map(() => "");
  const setAttr = (el: HTMLElement, i: number, v: string) => {
    if (chipState[i] !== v) {
      chipState[i] = v;
      el.dataset.state = v;
    }
  };
  let prState = "";
  let lastScore = -1;
  const v3 = new THREE.Vector3();

  // ── Frame
  let raf = 0;
  let paused = o.reduced;
  let t = o.reduced ? FINAL_T : 0;
  let last = performance.now();
  let first = true;

  function applyTimeline(time: number) {
    const sweep = clamp01((time - SWEEP_START) / (SWEEP_END - SWEEP_START));
    const sweepE = easeInOut(sweep);
    const resetting = time > RESET_AT;
    const fade = resetting ? 1 - clamp01((time - RESET_AT) / 0.8) : 1;
    const beamY = SH / 2 - sweepE * SH;
    beam.visible = sweep > 0 && sweep < 1;
    beam.position.y = beamY;
    (beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.sin(Math.PI * Math.min(1, sweep * 1.05));
    beamGlow.scale.y = Math.max(0.0001, Math.min(1, (SH / 2 - beamY) / 0.3));
    scanned.scale.y = Math.max(0.0001, sweepE * SH);
    (scanned.material as THREE.MeshBasicMaterial).opacity = 0.05 * fade * (sweep > 0 ? 1 : 0);

    pins.forEach((p, i) => {
      const hitAt = SWEEP_START + (SWEEP_END - SWEEP_START) * findSweepTime((SH / 2 - p.y) / SH);
      const since = time - hitAt;
      const appear = clamp01(since / 0.35);
      const s = (appear < 1 ? 1 + 0.35 * Math.sin(appear * Math.PI) : 1) * appear * fade;
      p.g.scale.setScalar(Math.max(0.0001, s));
      const fixT = clamp01((time - FIX_AT[i]) / 0.45);
      const col = ROSE.clone().lerp(EMERALD, fixT);
      (p.bead.material as THREE.MeshBasicMaterial).color.copy(col);
      p.halo.material.color.copy(col);
      (p.stem.material as THREE.MeshBasicMaterial).color.copy(col);
      const ringMat = p.ring.material as THREE.MeshBasicMaterial;
      ringMat.color.copy(col);
      const pulse = since > 0 && since < 0.9 ? since / 0.9 : fixT > 0 && fixT < 1 ? fixT : -1;
      if (pulse >= 0) {
        p.ring.scale.setScalar(1 + pulse * 2.6);
        ringMat.opacity = (1 - pulse) * 0.9;
      } else ringMat.opacity = 0;
      p.halo.material.opacity = 0.75 + 0.25 * Math.sin(time * 3 + i);

      // Overlay chip follows the pin
      const chip = o.chips[i];
      if (chip) {
        p.g.getWorldPosition(v3);
        v3.project(camera);
        const x = (v3.x * 0.5 + 0.5) * width;
        const y = (-v3.y * 0.5 + 0.5) * height;
        chip.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        setAttr(chip, i, since < 0 || fade < 0.5 ? "hidden" : fixT >= 0.5 ? "fixed" : "found");
      }
    });

    const pr = time >= PR_AT && fade > 0.5 ? "on" : "off";
    if (pr !== prState) {
      prState = pr;
      o.pr.dataset.state = pr;
    }
    const score = resetting && fade < 0.5 ? 61 : scoreAt(time);
    if (score !== lastScore) {
      lastScore = score;
      o.score.textContent = String(score);
      o.scoreBox.dataset.state = score >= 90 ? "good" : score >= 75 ? "mid" : "low";
    }
  }

  // Adaptive quality: if frames run long (an integrated GPU on a big screen),
  // drop to 1x pixels once; the timeline itself is wall-clock based.
  let slowFrames = 0;
  let lowered = false;

  function frame(now: number) {
    raf = 0;
    const raw = (now - last) / 1000;
    const dt = Math.min(0.25, raw); // a long gap (tab switch, scroll jank) skips ahead at most 250 ms
    last = now;
    if (!lowered && !first) {
      slowFrames = raw > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 24) {
        lowered = true;
        renderer.setPixelRatio(1);
        resize();
      }
    }
    if (!paused) {
      t += dt;
      if (t > LOOP) t = 0;
    }
    applyTimeline(t);

    // Pose: scroll turns the page toward the viewer; the pointer adds a little parallax.
    const r = host.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const sp = clamp01((vh - r.top) / (vh + r.height * 0.35));
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    const time = now / 1000;
    slab.rotation.x = THREE.MathUtils.lerp(-0.62, -0.3, sp) + pointer.y * 0.06;
    slab.rotation.y = THREE.MathUtils.lerp(0.5, 0.22, sp) + pointer.x * 0.1;
    slab.rotation.z = THREE.MathUtils.lerp(0.06, 0.02, sp);
    slab.position.y = o.reduced ? 0 : Math.sin(time * 0.7) * 0.035;
    shadow.scale.setScalar(1 - slab.position.y * 0.6);

    renderer.render(scene, camera);
    if (first) {
      first = false;
      o.onFirstFrame();
    }
    kick();
  }

  function kick() {
    if (raf || !visible || document.hidden) return;
    if (o.reduced && !first) return; // finished state, rendered once (re-rendered on resize below)
    if (performance.now() - last > 300) last = performance.now(); // resuming: don't jump the timeline
    raf = requestAnimationFrame(frame);
  }

  if (o.reduced) {
    const rerender = () => {
      applyTimeline(FINAL_T);
      renderer.render(scene, camera);
    };
    ro.disconnect();
    const ro2 = new ResizeObserver(() => {
      resize();
      rerender();
    });
    ro2.observe(host);
    disposers.push(() => ro2.disconnect());
  }
  kick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
      disposers.forEach((d) => d());
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      [pageTex, glowTex, haloTex, shadowTex, grid, envTex].forEach((x) => x.dispose());
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
    setPaused(p: boolean) {
      if (o.reduced) return;
      paused = p;
      if (p) t = FINAL_T;
      kick();
    },
    setUrl(url: string) {
      const h = cleanHost(url);
      if (h === host_) return;
      host_ = h;
      drawPage(pageCtx, host_, o.fontFamily);
      pageTex.needsUpdate = true;
      if (o.reduced) {
        applyTimeline(FINAL_T);
        renderer.render(scene, camera);
      }
    },
    setTheme(dark: boolean) {
      o.dark = dark;
      grid.dispose();
      grid = gridTexture(dark);
      floorMat.map = grid;
      floorMat.needsUpdate = true;
      (scene.fog as THREE.Fog).color = fogColor();
      if (o.reduced) {
        applyTimeline(FINAL_T);
        renderer.render(scene, camera);
      }
    },
  };
}


/** Sweep progress is eased; invert it so a pin lights exactly as the line crosses. */
function findSweepTime(target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (easeInOut(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
