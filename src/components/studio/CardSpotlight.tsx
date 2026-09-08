'use client';

import { useRef, type ReactNode } from 'react';

/**
 * Pointer-driven glow written straight to CSS variables — no React state, so
 * only the hovered card does any work. At glow zero (any touch device) the card
 * is a flat bordered surface that looks finished rather than broken.
 */
export function CardSpotlight({
  children,
  className = '',
  tint = 'var(--accent)',
}: {
  children: ReactNode;
  className?: string;
  tint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch') return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
        el.style.setProperty('--glow', '1');
      }}
      onPointerLeave={() => ref.current?.style.setProperty('--glow', '0')}
      className={`group relative overflow-hidden ${className}`}
      style={{ ['--glow' as string]: '0' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--glow)',
          background: `radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, ${tint} 14%, transparent), transparent 65%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
