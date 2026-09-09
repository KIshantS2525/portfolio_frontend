// src/components/core/AmbientField.tsx
import { useEffect, useMemo, useRef } from 'react';
import { usePalette, useTheme } from '@/lib/useTheme';

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
 * The look changed twice. The first pass's box-shadow spread made every
 * particle a soft indistinct glow-blob; cutting it back to a small dose close
 * in fixed the fog but left a second problem, which is that the dot underneath
 * was a `radial-gradient(circle at 35% 30%, …)` — opaque out to 55% with the
 * highlight parked off-centre. That is not a distant dot. That is the standard
 * recipe for drawing a *sphere*, and it read as exactly that: a page of
 * floating soap bubbles.
 *
 * They are stars now, and drawn the same way the WebGL ones are (see
 * makeStarTexture in GraphJourney): a small hard core, a halo falling away
 * fast around it, and a faint four-point cross. Three stacked gradients rather
 * than a canvas, because these are 56 DOM spans and the browser composites
 * them for free — but the profile is the same profile, so the field behind the
 * page and the field inside the canvas are the same material.
 */

const COUNT = 56;

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
  const [theme] = useTheme();
  const light = theme === 'light';

  /*
   * These read from `graph.ambient`, not from the node colours.
   *
   * They used to pull role / domain / tech / person straight out of the graph
   * palette, which is why light mode looked like the page needed dusting:
   * those are node colours, chosen to be legible against the canvas at 3px
   * inside a dense constellation, and half of them sit at the dark end of the
   * ink scale. Scattered loose across a sheet of paper at 8px they stop
   * reading as distant nodes and start reading as specks of grit.
   *
   * `graph.ambient` is the array that exists for exactly this — decorative,
   * per-theme, and marked in theme.ts as never-UI. On light it holds blues and
   * the two lightest neutrals; on dark, the full chromatic set.
   */
  const hues = palette.graph.ambient;

  const rootRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const pointer = useRef({ x: -9999, y: -9999 });

  const particles = useMemo<Particle[]>(() => {
    const rand = rng(0x4a17c);
    return Array.from({ length: COUNT }, (_, i) => {
      // Every third particle is the quiet one — a fixed pattern, not random
      // per load, so the balance doesn't shift on refresh.
      const quiet = i % 3 === 0;
      const depth = rand();
      // Roughly twice what it was. The old gradient was opaque out to 55% of
      // the span, so a 6px particle drew a 6px dot; a star spends most of its
      // radius on halo and cross, so the same visible point needs about twice
      // the box around it.
      const size = quiet ? 7 + rand() * 8 : 8 + rand() * 15;
      const opacity = quiet ? 0.3 + rand() * 0.16 : 0.42 + rand() * 0.28;
      return {
        left: rand() * 100,
        top: rand() * 100,
        // Ink on paper carries much further than light in a void: the same
        // opacity that reads as a faint glimmer on black reads as a hard
        // fleck on cream, so light mode takes roughly two-thirds of it and
        // trims the largest particles back.
        size: light ? size * 0.85 : size,
        color: hues[i % hues.length],
        opacity: light ? opacity * 0.6 : opacity,
        phase: rand() * Math.PI * 2,
        bobSpeed: 0.15 + rand() * 0.25,
        bobAmount: 8 + rand() * 14,
        depth,
      };
    });
    // hues comes from the palette above; recomputed whenever it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, light]);

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
          className="absolute will-change-transform"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            /*
             * Star profile, outermost layer first: the horizontal arm of the
             * cross, the vertical arm, then the core and its halo on top.
             *
             * The arms are ellipses flattened to a few percent on one axis,
             * which is the cheapest way to get a taper in CSS — a linear
             * gradient would give a bar with a hard end. They are deliberately
             * faint: at these sizes the cross is a suggestion rather than a
             * shape, and it is doing the same job the spikes do in the canvas
             * texture, which is to say "point source" to a viewer who has
             * never consciously noticed a diffraction spike in their life.
             */
            background: [
              `radial-gradient(ellipse 50% 3% at 50% 50%, ${p.color} 0%, transparent 72%)`,
              `radial-gradient(ellipse 3% 50% at 50% 50%, ${p.color} 0%, transparent 72%)`,
              `radial-gradient(circle at 50% 50%, ${p.color} 0%, ${p.color} 12%, transparent 48%)`,
            ].join(', '),
            /*
             * No box-shadow, deliberately.
             *
             * There used to be one, for glow, and it only ever worked because
             * the element was also `rounded-full`. A box-shadow traces the
             * border box and knows nothing about the alpha painted inside it,
             * so the moment the star profile made the border-radius pointless
             * and it came off, every particle grew a visible square halo. That
             * is the correct behaviour for a box-shadow and entirely wrong
             * here.
             *
             * The glow belongs in the gradient anyway, where it falls off from
             * the core rather than outlining a rectangle — which is what a
             * glow actually is.
             */
          }}
        />
      ))}
    </div>
  );
}