// src/components/figures/FigurePlate.tsx
import type { ReactNode, Ref } from 'react';
import './iso/iso.css';
import './plate.css';

/**
 * The frame every project figure sits in: a recessed well with four corner
 * labels — figure number, title, interaction hint and a live readout.
 *
 * The readout is written imperatively by whatever figure is inside (Hairline's
 * `onRead`, an Anatomy figure's loop), never through React state, so a figure
 * ticking at 60fps never re-renders the sheet. Both find it through `readoutRef`.
 */
export function FigurePlate({
  fig,
  title,
  hint,
  readout,
  readoutRef,
  children,
}: {
  fig: string;
  title: string;
  hint: string;
  /** Resting text, rendered before any figure code runs. */
  readout?: string;
  readoutRef?: Ref<HTMLSpanElement>;
  children: ReactNode;
}) {
  return (
    <figure className="fig-plate iso">
      <span className="fig-corner" data-corner="fig">{fig}</span>
      <span className="fig-corner" data-corner="title">{title}</span>
      <span className="fig-corner" data-corner="hint" aria-hidden>
        {hint}
      </span>
      <span ref={readoutRef} className="fig-corner" data-corner="readout" data-readout aria-hidden>
        {readout}
      </span>
      {children}
    </figure>
  );
}

/** True on phones and tablets: no hover, so figures play their own tour. */
export const noHover = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
