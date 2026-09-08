'use client';

import { useEffect, useRef, useState } from 'react';
import { useVisible } from '@/components/core/WhenVisible';

/**
 * Split-flap tiles. Plays once, never loops.
 *
 * The flip is a pure CSS animation with a per-tile delay, so there is no
 * setState per flip step and no remounting DOM nodes on a changing key —
 * twelve tiles animating through React state is a lot of renders in half a
 * second, and it is fatal as a background loop.
 */
export function SplitFlap({ value, delay = 0 }: { value: string; delay?: number }) {
  const visible = useVisible();
  const [play, setPlay] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (!visible || fired.current) return;
    fired.current = true;
    setPlay(true);
  }, [visible]);

  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <span className="inline-flex [perspective:600px]" aria-label={value}>
      {value.split('').map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block origin-top will-change-transform"
          style={
            play && !reduced
              ? {
                  animation: `flap-in 420ms cubic-bezier(0.16,1,0.3,1) both`,
                  animationDelay: `${delay + i * 55}ms`,
                }
              : undefined
          }
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  );
}
