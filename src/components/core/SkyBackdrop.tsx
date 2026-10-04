// src/components/core/SkyBackdrop.tsx
'use client';

import { useEffect, useRef } from 'react';

/**
 * The sky behind the whole site: a deep navy night, slightly lighter toward
 * the middle, and thousands of small blue-white stars with a few bright blue
 * ones and the odd red giant. The Milky Way band is not here — it belongs to
 * the Hero only (see MilkyWay.tsx).
 *
 * Painted once into a fixed canvas at load (and again on a real resize).
 * Nothing here animates; the drifting stars and the figures move in front of
 * it, which is what makes it read as distance.
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

function paint(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(window.innerWidth * dpr);
  const H = Math.round(window.innerHeight * dpr);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep navy, a touch lighter in the middle of the frame.
  const base = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
  base.addColorStop(0, '#070b24');
  base.addColorStop(0.55, '#050819');
  base.addColorStop(1, '#020310');
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
      tint < 0.6 ? '210,225,255' : tint < 0.86 ? '255,255,255' : tint < 0.95 ? '160,190,255' : '255,214,180';
    ctx.fillStyle = `rgba(${col},${(0.3 + rand() * 0.6).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  const bright = Math.round((W * H) / 110000);
  for (let k = 0; k < bright; k++) {
    const px = rand() * W;
    const py = rand() * H;
    const c = rand() < 0.08 ? '255,170,140' : rand() < 0.75 ? '120,170,255' : '235,242,255';
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

export function SkyBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

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
      paint(canvas);
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
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-screen w-screen"
      style={{ background: 'var(--surface)', zIndex: -1 }}
    />
  );
}
