'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

/**
 * The entrance. Fires once on first viewport entry and never again — no
 * re-trigger on scroll back, no per-section fade-and-slide on everything.
 * 16px of travel, 460ms, expo-out. Reduced motion collapses it to instant.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
  immediate = false,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  /** Skip the observer — for above-the-fold content in the load sequence. */
  immediate?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (immediate) {
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
