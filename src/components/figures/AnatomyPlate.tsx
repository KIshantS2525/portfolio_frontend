// src/components/figures/AnatomyPlate.tsx
import { useEffect, useRef } from 'react';
import { FigurePlate, noHover } from './FigurePlate';

type Meta = { title: string; hint: string; stage: Record<string, string> };

/**
 * An Anatomy figure in the plate.
 *
 * The drawing is precomputed at build time (figures/<name>/build.mjs writes
 * art.generated.ts), so the browser receives finished path strings and does
 * no geometry. React renders it once; after that the figure's own `mount`
 * moves parts by writing attributes on the nodes — no re-render per frame.
 */
export function AnatomyPlate({
  fig,
  svg,
  meta,
  readout,
  mount,
}: {
  fig: string;
  svg: string;
  meta: Meta;
  readout: string;
  mount: (stage: HTMLElement, readout: HTMLElement | null) => () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  // The build writes plain HTML attribute names; React wants tabIndex.
  const { tabindex, ...aria } = meta.stage;

  useEffect(() => {
    if (!stage.current) return;
    return mount(stage.current, out.current);
  }, [mount]);

  return (
    <FigurePlate
      fig={fig}
      title={meta.title}
      hint={noHover() ? 'Drag across the figure' : meta.hint}
      readout={readout}
      readoutRef={out}
    >
      <div
        ref={stage}
        className="fig-stage fig-anatomy"
        tabIndex={tabindex === undefined ? undefined : Number(tabindex)}
        {...aria}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </FigurePlate>
  );
}
