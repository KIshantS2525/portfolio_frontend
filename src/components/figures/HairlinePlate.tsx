// src/components/figures/HairlinePlate.tsx
import { useEffect, useRef } from 'react';
import type { HairlineName } from '@/lib/figures';
import { FigurePlate, noHover } from './FigurePlate';

/**
 * A Hairline figure in the plate.
 *
 * The library is imported dynamically, so none of it ships until a reader
 * opens a project. All 33 figures share one rAF loop that sleeps when nothing
 * moves or the figure is off screen, so a sheet left open costs nothing.
 *
 * On touch screens there is no hover to answer, so the figure plays its own
 * tour (`play`) until a finger lands on it.
 */
export function HairlinePlate({
  name,
  fig,
  title,
  label,
}: {
  name: HairlineName;
  fig: string;
  title: string;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const touch = noHover();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let figure: { destroy(): void } | null = null;
    let cancelled = false;
    import('@lucasmarkes/hairline').then((H) => {
      if (cancelled || !host.current) return;
      figure = H[name](el, {
        intensity: 0.6,
        theme: 'dark',
        label,
        play: touch,
        onRead: (text) => {
          if (readout.current) readout.current.textContent = text;
        },
      });
    });
    return () => {
      cancelled = true;
      figure?.destroy();
    };
  }, [name, label, touch]);

  return (
    <FigurePlate fig={fig} title={title} hint={touch ? 'Tap the figure' : 'Move across the figure'} readoutRef={readout}>
      <div className="fig-stage">
        <div ref={host} className="fig-hairline" />
      </div>
    </FigurePlate>
  );
}
