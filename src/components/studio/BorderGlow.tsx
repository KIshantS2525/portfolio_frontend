'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { usePalette } from '@/lib/useTheme';
import { useVisible } from '@/components/core/WhenVisible';
import './BorderGlow.css';

/**
 * A card that lights its own edge under the cursor.
 *
 * The previous version rotated a conic gradient around the border on a
 * permanent rAF loop. It was doing three things wrong at once: it animated
 * forever whether or not anyone was on the page, it put continuous motion
 * directly around a text input (which reads as "busy", competes with the
 * caret, and is the most over-used gesture in the genre), and its colour swept
 * past regardless of where the pointer was, so it never actually responded to
 * anything. This is the same idea made reactive — nothing moves until you
 * approach, then the arc of border nearest the cursor lights up and a soft
 * spotlight follows underneath.
 *
 * The two signals it computes, both written straight to CSS custom properties
 * so React never re-renders on pointer movement:
 *
 *   edge proximity — normalised so it reaches 1 exactly at the border on every
 *     side. Naively using distance-to-centre would light a wide card's short
 *     edges long before its long ones; scaling each axis by how far the centre
 *     is from that axis's own edge removes the aspect-ratio bias, which is
 *     what makes the glow feel welded to the border instead of trailing the
 *     pointer around.
 *   cursor angle — the bearing from centre to pointer, driving the conic masks
 *     that decide which arc is lit.
 *
 * There is one scripted moment: a single sweep when the card first scrolls
 * into view, so a visitor who never mouses over it still sees what it does.
 * It runs once, it is skipped under prefers-reduced-motion, and it does not
 * loop.
 */

const EASE_OUT = (x: number) => 1 - Math.pow(1 - x, 3);
const EASE_IN = (x: number) => x * x * x;

/** rAF tween writing a single number, used only by the intro sweep. */
function tween({
  from = 0,
  to = 100,
  duration = 1000,
  delay = 0,
  ease = EASE_OUT,
  onUpdate,
  onDone,
}: {
  from?: number;
  to?: number;
  duration?: number;
  delay?: number;
  ease?: (x: number) => number;
  onUpdate: (v: number) => void;
  onDone?: () => void;
}) {
  let raf = 0;
  const timer = setTimeout(() => {
    const t0 = performance.now();
    const step = () => {
      const t = Math.min((performance.now() - t0) / duration, 1);
      onUpdate(from + (to - from) * ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
      else onDone?.();
    };
    raf = requestAnimationFrame(step);
  }, delay);
  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}

export function BorderGlow({
  children,
  tint = 'base',
  sweepOnReveal = true,
}: {
  children: ReactNode;
  /** Which `.glass-*` tint the frosted interior uses. */
  tint?: 'base' | 'project' | 'tech' | 'role' | 'achievement';
  /** Play the one-time introductory sweep when the card scrolls into view. */
  sweepOnReveal?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const palette = usePalette();
  const visible = useVisible();

  /*
   * The glow colour is the theme's accent, pre-mixed at seven opacities. They
   * are computed here rather than with color-mix() in the stylesheet because
   * each one is used inside a box-shadow list, and a shadow list with an
   * invalid colour anywhere in it drops the entire list — the same class of
   * failure that made the card transparent when --glass-fill was resolved in
   * the wrong scope.
   */
  const glowVars = Object.fromEntries(
    [100, 50, 40, 30, 20, 18, 10].map((pct) => [
      `--glow-${pct}`,
      `color-mix(in srgb, ${palette.accent} ${pct}%, transparent)`,
    ]),
  ) as Record<string, string>;

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const cx = r.width / 2;
    const cy = r.height / 2;
    const dx = x - cx;
    const dy = y - cy;

    // Per-axis normalisation, so proximity hits 1 at every border equally.
    const kx = dx === 0 ? Infinity : cx / Math.abs(dx);
    const ky = dy === 0 ? Infinity : cy / Math.abs(dy);
    const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);

    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    el.style.setProperty('--edge-proximity', (edge * 100).toFixed(2));
    el.style.setProperty('--cursor-angle', `${angle.toFixed(2)}deg`);
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
  }, []);

  /* One sweep on reveal, then never again. */
  useEffect(() => {
    const el = ref.current;
    if (!el || !visible || !sweepOnReveal) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const START = 110;
    const END = 465;
    const setAngle = (v: number) =>
      el.style.setProperty('--cursor-angle', `${((END - START) * v) / 100 + START}deg`);

    el.classList.add('is-sweeping');
    setAngle(0);

    const stops = [
      tween({ duration: 500, onUpdate: (v) => el.style.setProperty('--edge-proximity', String(v)) }),
      tween({ ease: EASE_IN, duration: 1500, to: 50, onUpdate: setAngle }),
      tween({ ease: EASE_OUT, delay: 1500, duration: 2250, from: 50, to: 100, onUpdate: setAngle }),
      tween({
        ease: EASE_IN,
        delay: 2500,
        duration: 1500,
        from: 100,
        to: 0,
        onUpdate: (v) => el.style.setProperty('--edge-proximity', String(v)),
        onDone: () => el.classList.remove('is-sweeping'),
      }),
    ];
    return () => {
      stops.forEach((stop) => stop());
      el.classList.remove('is-sweeping');
    };
  }, [visible, sweepOnReveal]);

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className="border-glow rounded-[26px]"
      style={glowVars}
    >
      {/*
        The edge layer sits outside the card so its outer halo is not clipped
        by the card's own overflow:hidden, and neither layer is inside the
        content wrapper, so nothing here ever intercepts a click meant for the
        input or the suggestion chips.
      */}
      <span aria-hidden className="border-glow__layer border-glow__edge" />
      <div className={`glass-card ${tint === 'base' ? '' : `glass-${tint}`} relative rounded-[26px]`}>
        <span aria-hidden className="border-glow__layer border-glow__spot" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}