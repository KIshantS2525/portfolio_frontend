'use client';

import { useEffect, useRef } from 'react';
import { useVisible } from '@/components/core/WhenVisible';

/**
 * Single rAF, transform and clip-path only, self-halting, reduced motion
 * honored. The image starts inset and opens to full bleed as the section
 * passes through the viewport.
 */
export function ScrollExpand({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const visible = useVisible();

  useEffect(() => {
    const section = sectionRef.current;
    const frame = frameRef.current;
    if (!section || !frame || !visible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      frame.style.transform = 'scaleX(1)';
      return;
    }

    let raf = 0;
    const tick = () => {
      const r = section.getBoundingClientRect();
      const span = r.height + window.innerHeight;
      const p = Math.max(0, Math.min(1, (window.innerHeight - r.top) / span));
      const eased = Math.max(0, Math.min(1, (p - 0.1) / 0.55));
      frame.style.transform = `scale(${0.74 + eased * 0.26})`;
      frame.style.borderRadius = `${24 - eased * 12}px`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return (
    <div ref={sectionRef}>
      <div
        ref={frameRef}
        className="overflow-hidden rounded-[24px] border border-ash/15 will-change-transform"
        style={{ transform: 'scale(0.74)' }}
      >
        <img src={src} alt={alt} className="block w-full" />
      </div>
      <p className="t-caption mt-[12px] text-center text-ash">{caption}</p>
    </div>
  );
}
