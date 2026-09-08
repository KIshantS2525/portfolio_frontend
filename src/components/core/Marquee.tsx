import { useEffect, useRef, useState } from 'react';
import { useVisible } from '@/components/core/WhenVisible';

/**
 * Single rAF, transform only, no React state per frame, self-halting when off
 * screen or when reduced motion is set. This is the quality bar for anything
 * animated added later — if a component re-renders React state on scroll,
 * reject it.
 *
 * Items render as official marks from simple-icons, generated at build time
 * into logos.generated.ts so only the icons actually used ship. They are drawn
 * monochrome in the muted colour and brighten on hover: thirty brand colours
 * would fight a two-accent palette, and monochrome keeps the marks legible in
 * both themes. Anything without an official icon falls back to a wordmark
 * rather than an invented path.
 */
export function Marquee({
  items,
  speed = 42,
  reverse = false,
  className = '',
}: {
  items: string[];
  /** px per second */
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const visible = useVisible();

  /* The icon paths are their own chunk — a wordmark shows for the instant
     before they arrive, which is invisible in practice since the rows sit
     well below the fold. */
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    import('@/lib/logos.generated').then((m) => {
      if (!cancelled) setLogos(m.LOGO_PATHS);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !visible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const mobile = window.innerWidth < 768;
    const px = (mobile ? speed * 0.5 : speed) * (reverse ? -1 : 1);

    let offset = reverse ? -track.scrollWidth / 2 : 0;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const half = track.scrollWidth / 2;
      offset -= px * dt;
      if (offset <= -half) offset += half;
      if (offset >= 0) offset -= half;
      track.style.transform = `translate3d(${offset}px,0,0)`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, reverse, visible]);

  const group = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === 'b'}>
      {items.map((item, i) => {
        const path = logos[item];
        return (
          <span
            key={`${key}-${item}-${i}`}
            className="group/logo flex shrink-0 items-center gap-[10px] px-[18px] md:px-[24px]"
            title={item}
          >
            {path ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="h-[26px] w-[26px] shrink-0 fill-ash transition-colors duration-300 group-hover/logo:fill-bone md:h-[30px] md:w-[30px]"
                  role="img"
                  aria-label={item}
                >
                  <path d={path} />
                </svg>
                <span className="sr-only">{item}</span>
              </>
            ) : (
              <span className="whitespace-nowrap text-[clamp(16px,2vw,22px)] font-[200] tracking-[-0.02em] text-ash transition-colors duration-300 group-hover/logo:text-bone">
                {item}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        maskImage: 'linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)',
      }}
    >
      <div ref={trackRef} className="flex w-max will-change-transform">
        {group('a')}
        {group('b')}
      </div>
    </div>
  );
}
