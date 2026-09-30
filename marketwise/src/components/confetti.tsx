"use client";

import { useEffect, useRef } from "react";

/**
 * Celebration confetti — one-shot, zero dependencies, brand-flavoured.
 *
 * Pieces are a mix of paper slips (rects), dots and Marketwise flower
 * *petals* (ellipses) in the brand palette (terracotta, rust, ochre,
 * warm ink, cream, sage). Two side cannons fire first, then a slower
 * 360° petal bloom blooms from the centre of the stage.
 *
 * Physics is deliberately light (gravity + drag + tumble + flutter) so
 * ~140 particles cost nothing on the main thread. The canvas is
 * pointer-events-none, stops its rAF loop as soon as every piece has
 * left the viewport, and renders nothing at all when the visitor
 * prefers reduced motion.
 */

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  flutter: number;
  vflutter: number;
  size: number;
  color: string;
  shape: "slip" | "petal" | "dot";
};

type Cannon = { x: number; y: number; angle: number; spread: number; count: number; speed: [number, number]; at: number };

const PALETTE = ["#A55026", "#7C3A1D", "#C97B4F", "#D9A441", "#3A3835", "#F0E7D8", "#8A9B7C"];

export function ConfettiBurst({ fire, duration = 3800 }: { fire: boolean; duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!fire || firedRef.current) return;
    firedRef.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Layout: two side cannons + a centre petal bloom.
    const cannons: Cannon[] = [
      { x: w * 0.06, y: h * 0.72, angle: -Math.PI / 3, spread: 0.42, count: 46, speed: [10, 17], at: 0 },
      { x: w * 0.94, y: h * 0.72, angle: (-Math.PI * 2) / 3, spread: 0.42, count: 46, speed: [10, 17], at: 150 },
      { x: w * 0.5, y: h * 0.38, angle: 0, spread: Math.PI, count: 30, speed: [3.5, 7.5], at: 300 },
    ];

    const pieces: Piece[] = [];
    const spawn = (c: Cannon) => {
      for (let i = 0; i < c.count; i++) {
        const a = c.angle + (Math.random() - 0.5) * 2 * c.spread;
        const s = c.speed[0] + Math.random() * (c.speed[1] - c.speed[0]);
        const bloom = c.spread === Math.PI; // centre bloom → petals only, gentler
        pieces.push({
          x: c.x,
          y: c.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.45,
          flutter: Math.random() * Math.PI * 2,
          vflutter: 0.08 + Math.random() * 0.12,
          size: 1 + Math.random() * 1.6,
          color: PALETTE[(Math.random() * PALETTE.length) | 0],
          shape: bloom ? "petal" : Math.random() < 0.55 ? "slip" : Math.random() < 0.6 ? "petal" : "dot",
        });
      }
    };

    const G = 0.16; // gravity per frame (60fps-normalised)
    const DRAG = 0.985;
    const start = performance.now();
    let raf = 0;
    let stopped = false;

    const frame = (now: number) => {
      const t = now - start;
      for (const c of cannons) if (t >= c.at && !(c as Cannon & { done?: boolean }).done) {
        (c as Cannon & { done?: boolean }).done = true;
        spawn(c);
      }

      // Gentle global fade for the last half-second.
      let alpha = 1;
      const fadeFrom = duration - 500;
      if (t > fadeFrom) alpha = Math.max(0, 1 - (t - fadeFrom) / 500);

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = alpha;

      let alive = false;
      for (const p of pieces) {
        p.vy += G;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.flutter += p.vflutter;
        if (p.y < h + 40) alive = true;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const squash = 0.35 + Math.abs(Math.cos(p.flutter)) * 0.65; // paper flip
        ctx.scale(1, squash);
        ctx.fillStyle = p.color;
        if (p.shape === "slip") {
          ctx.fillRect(-4.5 * p.size, -2 * p.size, 9 * p.size, 4 * p.size);
        } else if (p.shape === "petal") {
          ctx.beginPath();
          ctx.ellipse(0, 0, 5.5 * p.size, 2.6 * p.size, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 2.6 * p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (t < duration && alive) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
        stopped = true;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      if (!stopped) ctx.clearRect(0, 0, w, h);
    };
  }, [fire, duration]);

  if (!fire) return null;
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />;
}
