'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useVisible } from '@/components/core/WhenVisible';

/**
 * A single rotating conic ring, drawn in a 1px padding gutter over an opaque
 * black inner surface.
 *
 * Deliberately no mask-composite and no mix-blend-mode. Blend modes force the
 * compositor to re-read what is beneath on every pointer move, and Safari has
 * historically needed -webkit-mask-composite with different keyword values —
 * that is a launch-week bug you don't want. One angle variable, one rAF, no
 * blending, identical everywhere.
 */
export function BorderGlow({
  children,
  tint = 'base',
}: {
  children: ReactNode;
  /** Which `.glass-*` tint the frosted interior uses. */
  tint?: 'base' | 'project' | 'tech' | 'role' | 'achievement';
}) {
  const ringRef = useRef<HTMLDivElement>(null);
  const visible = useVisible();

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring || !visible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ring.style.setProperty('--a', '90deg');
      return;
    }
    let raf = 0;
    let a = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      a = (a + dt * 0.028) % 360;
      ring.style.setProperty('--a', `${a}deg`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return (
    <div className="relative rounded-[26px] p-px">
      <div
        ref={ringRef}
        aria-hidden
        className="absolute inset-0 rounded-[26px]"
        style={{
          ['--a' as string]: '0deg',
          background:
            'conic-gradient(from var(--a), transparent 0deg, var(--accent) 40deg, transparent 110deg, transparent 180deg, var(--emphasis) 220deg, transparent 290deg)',
        }}
      />
      {/*
        The frosted interior lives HERE, on the one card the rotating ring
        actually outlines — not duplicated again inside whatever this wraps.
        A card-inside-a-card (an opaque box here, plus another tinted box
        inside AskAI) is what read as "the glass effect isn't there, you
        just opaqued it": two flat layers stacked, neither looking like glass.
      */}
      <div className={`glass-card ${tint === 'base' ? '' : `glass-${tint}`} relative rounded-[25px]`}>
        {children}
      </div>
    </div>
  );
}