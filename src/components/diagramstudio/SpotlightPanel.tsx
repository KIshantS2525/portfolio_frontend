// frontend/src/components/diagramstudio/SpotlightPanel.tsx
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * DiagramStudio's SpotlightPanel: a ring around the card that lights up under
 * the cursor. The ring is a radial gradient masked down to the border
 * (mask-composite xor), following --sx/--sy. `glow` is any CSS colour,
 * including a theme variable such as var(--accent).
 */

export function SpotlightPanel({
  children,
  glow,
  className = '',
  style,
}: {
  children: ReactNode;
  glow: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--sx', `${e.clientX - r.left}px`);
      el.style.setProperty('--sy', `${e.clientY - r.top}px`);
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div
      ref={ref}
      className={`ds-spot ${className}`}
      style={{ '--sx': '-9999px', '--sy': '-9999px', '--ds-glow': glow, ...style } as CSSProperties}
    >
      <div className="ds-spot-ring" aria-hidden />
      <div className="ds-spot-body">{children}</div>
    </div>
  );
}