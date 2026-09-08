'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The only component that shows a hiring manager something they cannot get from
 * résumé text. Slides on hover with a pointer, drags on touch — hover does
 * nothing on a phone, so the handle stays grabbable and visible there.
 */
export function Compare({
  before,
  after,
  beforeLabel,
  afterLabel,
  caption,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [touch, setTouch] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    setTouch(window.matchMedia('(hover: none)').matches || window.innerWidth < 768);
  }, []);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <figure className="w-full">
      <div
        ref={ref}
        className="glass-card relative aspect-[3/2] w-full touch-pan-y select-none overflow-hidden rounded-[24px]"
        onPointerMove={(e) => {
          if (touch ? dragging.current : true) move(e.clientX);
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt={beforeLabel} className="h-full w-full object-cover" draggable={false} />
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-bone/70"
          style={{ left: `${pos}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-iris">
            <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
              <path d="M5 1 1 5l4 4M9 1l4 4-4 4" stroke="#fff" strokeWidth="1.4" fill="none" />
            </svg>
          </span>
        </div>

        <span className="pointer-events-none absolute bottom-[12px] left-[12px] rounded-full bg-black/65 px-[12px] py-[5px] text-[12px] text-white">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute bottom-[12px] right-[12px] rounded-full bg-black/65 px-[12px] py-[5px] text-[12px] text-white">
          {afterLabel}
        </span>
      </div>
      <figcaption className="t-caption mt-[12px] text-ash">
        {caption} {touch ? 'Drag to compare.' : 'Move your pointer across to compare.'}
      </figcaption>
    </figure>
  );
}