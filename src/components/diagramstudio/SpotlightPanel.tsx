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
    // Still listens on the whole document — the ring's 300px glow lights up
    // before the cursor reaches the panel — but measures and writes at most
    // once per frame, with the latest pointer position.
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--sx', `${x - r.left}px`);
      el.style.setProperty('--sy', `${y - r.top}px`);
    };
    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
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