// frontend/src/components/core/SkyBackdrop.tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePalette } from '@/lib/useTheme';
import type { Palette } from '@/lib/theme';

/**
 * The sky behind the whole site: a deep navy night, slightly lighter toward
 * the middle, and thousands of small blue-white stars with a few bright blue
 * ones and the odd red giant. The Milky Way band is not here — it belongs to
 * the Hero only (see MilkyWay.tsx).
 *
 * Painted once into a fixed canvas at load (and again on a real resize, or
 * when the admin changes the sky colours — see Palette['sky'] in theme.ts).
 * Nothing here animates; the drifting stars and the figures move in front of
 * it, which is what makes it read as distance.
 *
 * Over it drift a few long, faint strokes of colour (SkyWisps) — rose, teal,
 * violet, amber — the way real sky is never one flat colour. They are not
 * fixed in place: each wanders on its own slow loop and shifts a little as
 * the page scrolls, so the sky changes with the reader instead of sitting
 * there as a stain in one corner. Strong local colour still belongs to the
 * figures (GraphJourney's GLOW).
 */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#d2e1ff' → '210,225,255', for building rgba() strings. */
function rgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function paint(canvas: HTMLCanvasElement, sky: Palette['sky']) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(window.innerWidth * dpr);
  const H = Math.round(window.innerHeight * dpr);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep navy, a touch lighter in the middle of the frame.
  const base = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
  base.addColorStop(0, sky.center);
  base.addColorStop(0.55, sky.mid);
  base.addColorStop(1, sky.edge);
  const star = rgb(sky.star);
  const brightStar = rgb(sky.bright);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  const rand = rng(0x51c7);
  const count = Math.round((W * H) / 900);
  for (let k = 0; k < count; k++) {
    const px = rand() * W;
    const py = rand() * H;
    const size = (rand() < 0.93 ? 0.35 + rand() * 0.5 : 0.8 + rand() * 0.7) * dpr;
    const tint = rand();
    const col =
      tint < 0.6 ? star : tint < 0.86 ? '255,255,255' : tint < 0.95 ? '160,190,255' : '255,214,180';
    ctx.fillStyle = `rgba(${col},${(0.3 + rand() * 0.6).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  const bright = Math.round((W * H) / 110000);
  for (let k = 0; k < bright; k++) {
    const px = rand() * W;
    const py = rand() * H;
    const c = rand() < 0.08 ? '255,170,140' : rand() < 0.75 ? brightStar : '235,242,255';
    const R = (1.4 + rand() * 1.8) * dpr;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, R * 3.2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.18, `rgba(${c},0.85)`);
    grad.addColorStop(0.45, `rgba(${c},0.2)`);
    grad.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, R * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The drifting strokes. Each is a long soft ellipse of colour at very low
 * alpha, screen-blended over the navy. Position, size and angle are in
 * viewport units; `dur` is its wander loop in seconds and `par` how far it
 * slides (px) as the page scrolls. Alphas stay under ~0.1: they tint, they
 * never become a colour of their own.
 */
const WISPS: {
  x: number; y: number; w: number; h: number; rot: number;
  col: string; a: number; dur: number; delay: number; par: number;
}[] = [
  { x: 8, y: 22, w: 70, h: 14, rot: -18, col: '170,60,120', a: 0.09, dur: 95, delay: 0, par: 70 },
  { x: 55, y: 8, w: 60, h: 11, rot: 12, col: '50,130,160', a: 0.075, dur: 120, delay: -40, par: -55 },
  { x: 30, y: 58, w: 85, h: 16, rot: -8, col: '105,70,190', a: 0.08, dur: 110, delay: -20, par: 90 },
  { x: 62, y: 70, w: 55, h: 12, rot: 24, col: '190,110,60', a: 0.055, dur: 85, delay: -60, par: -70 },
  { x: -10, y: 82, w: 65, h: 13, rot: 6, col: '60,90,200', a: 0.08, dur: 130, delay: -75, par: 50 },
  { x: 72, y: 38, w: 45, h: 18, rot: -30, col: '160,50,80', a: 0.05, dur: 100, delay: -15, par: -40 },
];

function SkyWisps() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.style.setProperty('--sky-s', String(Math.sin(window.scrollY / 1400))));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="sky-wisps pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: -1 }}
    >
      {WISPS.map((w, i) => (
        <div
          key={i}
          className="sky-wisp-slide"
          style={{ ['--par' as string]: `${w.par}px` }}
        >
          <div
            className="sky-wisp"
            style={{
              left: `${w.x}vw`,
              top: `${w.y}vh`,
              width: `${w.w}vw`,
              height: `${w.h}vh`,
              ['--rot' as string]: `${w.rot}deg`,
              background: `radial-gradient(closest-side, rgba(${w.col},${w.a}) 0%, rgba(${w.col},${(w.a * 0.45).toFixed(3)}) 45%, rgba(${w.col},0) 100%)`,
              animationDuration: `${w.dur}s`,
              animationDelay: `${w.delay}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function SkyBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { sky } = usePalette();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let last = { w: 0, h: 0 };
    let t = 0;
    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Mobile URL bars change the height on scroll; only a real resize repaints.
      if (Math.abs(w - last.w) < 2 && Math.abs(h - last.h) < 120) return;
      last = { w, h };
      paint(canvas, sky);
    };
    draw();
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(draw, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(t);
    };
  }, [sky]);

  return (
    <>
      <canvas
        ref={ref}
        aria-hidden
        className="pointer-events-none fixed inset-0 h-screen w-screen"
        style={{ background: 'var(--surface)', zIndex: -1 }}
      />
      <SkyWisps />
    </>
  );
}