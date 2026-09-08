// src/components/core/AmbientField.tsx
import { useEffect, useMemo, useRef } from 'react';
import { usePalette } from '@/lib/useTheme';

/**
 * The floating field. Second pass.
 *
 * The first version was pure CSS: a `@keyframes` loop per particle, entirely
 * inert otherwise — the dots drifted on their own timer and never responded
 * to anything the visitor did. That's what "not used" meant: nothing about
 * them depended on scroll, the pointer, or the page. They were wallpaper.
 *
 * This version is one requestAnimationFrame loop driving every particle's
 * `transform` through a ref, combining three things per frame:
 *   - idle drift   — the same slow bob as before, so the field is never
 *                     perfectly still;
 *   - scroll parallax — each particle carries a depth factor (bigger, closer
 *                     particles move faster), so the whole field visibly
 *                     shifts as you scroll rather than sitting fixed to the
 *                     viewport like a static overlay;
 *   - pointer drift — particles within a radius of the cursor ease a few
 *                     pixels away from it, so the field notices when you
 *                     move the mouse instead of ignoring it entirely.
 * CSS animations and inline-style transforms can't drive the same property
 * without one clobbering the other, so the old `@keyframes` rule is gone —
 * everything is one write per particle per frame now.
 *
 * The look changed too: less blur. The first pass's box-shadow spread made
 * every particle read as a soft, indistinct glow-blob at any distance, which
 * is what read as "bad" — a small dose of blur close in, no wash of it site-
 * wide. These are meant to look like the actual node dots, seen at a
 * distance, not a fog of colour.
 */

const COUNT = 56;
const GREY = 'rgb(160 160 160)';

/** mulberry32 — seeded, so the field is identical on every load. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Particle = {
  left: number;
  top: number;
  size: number;
  color: string;
  opacity: number;
  phase: number;
  bobSpeed: number;
  bobAmount: number;
  /** 0 (far, barely moves with scroll) – 1 (near, moves the most). Also used for pointer reach. */
  depth: number;
};

export function AmbientField() {
  const palette = usePalette();
  const hues = [palette.graph.role, palette.graph.domain, palette.graph.tech, palette.graph.person];

  const rootRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const pointer = useRef({ x: -9999, y: -9999 });

  const particles = useMemo<Particle[]>(() => {
    const rand = rng(0x4a17c);
    return Array.from({ length: COUNT }, (_, i) => {
      // Every third particle is grey — a fixed pattern, not random per load,
      // so the grey/colour balance doesn't shift on refresh.
      const isGrey = i % 3 === 0;
      const depth = rand();
      return {
        left: rand() * 100,
        top: rand() * 100,
        size: isGrey ? 3 + rand() * 5 : 3 + rand() * 8,
        color: isGrey ? GREY : hues[i % hues.length],
        opacity: isGrey ? 0.3 + rand() * 0.16 : 0.42 + rand() * 0.28,
        phase: rand() * Math.PI * 2,
        bobSpeed: 0.15 + rand() * 0.25,
        bobAmount: 8 + rand() * 14,
        depth,
      };
    });
    // hues comes from the palette below; recomputed whenever it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const { x: px, y: py } = pointer.current;
      const reach = 140;

      for (let i = 0; i < particles.length; i++) {
        const el = refs.current[i];
        const p = particles[i];
        if (!el) continue;

        const bobX = Math.sin(t * p.bobSpeed + p.phase) * p.bobAmount;
        const bobY = Math.cos(t * p.bobSpeed * 0.8 + p.phase) * p.bobAmount * 0.6;

        // Scroll parallax: shift opposite to scroll, scaled by depth, capped
        // so a very long page doesn't carry a particle off past a screen's
        // worth of travel.
        const parallaxY = Math.max(-vh, Math.min(vh, -scrollY * (0.04 + p.depth * 0.16)));

        // Pointer drift: particles inside `reach` px ease away from the
        // cursor. Cheap and per-particle, no spatial index needed at this count.
        let pushX = 0;
        let pushY = 0;
        const cx = (p.left / 100) * vw;
        const cy = (p.top / 100) * vh + parallaxY;
        const dx = cx - px;
        const dy = cy - py;
        const dist = Math.hypot(dx, dy);
        if (dist < reach && dist > 0.01) {
          const force = (1 - dist / reach) * (10 + p.depth * 14);
          pushX = (dx / dist) * force;
          pushY = (dy / dist) * force;
        }

        el.style.transform = `translate3d(${bobX + pushX}px, ${bobY + pushY + parallaxY}px, 0)`;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [particles]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="ambient-field pointer-events-none fixed inset-0 z-[30] overflow-hidden"
    >
      {particles.map((p, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute rounded-full will-change-transform"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            background: `radial-gradient(circle at 35% 30%, ${p.color} 0%, ${p.color} 55%, transparent 82%)`,
            boxShadow: `0 0 ${p.size * 0.6}px ${p.size * 0.1}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}