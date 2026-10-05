// src/components/space/Rocket.tsx
'use client';

import { forwardRef } from 'react';
import './space.css';

/**
 * The Timeline's rocket: a classic cartoon rocket, flying right — fat white
 * body, red nose cone, blue porthole, swept blue fins, a chunky ink outline
 * and a layered flame. The nozzle sits at x=11–12 of the viewBox (which starts
 * at -60), so the Timeline can put that point exactly on the head of the line
 * it draws.
 *
 * Motion comes from outside through CSS variables on the root, all owned by
 * the Timeline's frame loop:
 *   --boost   flame length (≈0.8 idle … ~1.9 at full burn)
 *   --lean    body angle in degrees (sprung, so it nods when you stop)
 *   --sx/--sy squash and stretch
 */
export const Rocket = forwardRef<HTMLDivElement, { className?: string }>(function Rocket(
  { className = '' },
  ref,
) {
  return (
    <div ref={ref} className={`rk ${className}`} aria-hidden>
      <svg viewBox="-60 0 250 80" className="rk-svg" overflow="visible">
        {/* Flame: three layers, each flickering on its own clock. */}
        <g className="rk-flame">
          <path className="rk-f1" d="M12 40 C 0 22, -30 25, -60 40 C -30 55, 0 58, 12 40 Z" />
          <path className="rk-f2" d="M12 40 C 2 29, -16 31, -40 40 C -16 49, 2 51, 12 40 Z" />
          <path className="rk-f3" d="M12 40 C 6 35, -4 36, -18 40 C -4 44, 6 45, 12 40 Z" />
        </g>

        <g className="rk-body">
          {/* Swept fins, behind the body */}
          <path className="rk-fin" d="M62 18 C 50 12, 38 4, 22 1 C 15 0, 11 4, 13 10 C 16 18, 20 24, 26 28 Z" />
          <path className="rk-fin" d="M62 62 C 50 68, 38 76, 22 79 C 15 80, 11 76, 13 70 C 16 62, 20 56, 26 52 Z" />

          {/* Nozzle */}
          <path className="rk-nozzle" d="M24 30 L14 27 Q11 27 11 30 V50 Q11 53 14 53 L24 50 Z" />

          {/* Body: short and chubby */}
          <path
            className="rk-hull"
            d="M28 22 C 56 10, 100 10, 122 16 C 140 21, 153 30, 160 40 C 153 50, 140 59, 122 64 C 100 70, 56 70, 28 58 Q 22 55 22 49 V 31 Q 22 25 28 22 Z"
          />
          {/* Soft shading along the lower half, for a little roundness */}
          <path className="rk-shade" d="M34 55 C 60 63, 100 64, 120 60 C 110 64, 96 67, 78 67 C 58 67, 44 63, 34 55 Z" />
          {/* Red nose cone */}
          <path className="rk-nose" d="M122 16 C 140 21, 153 30, 160 40 C 153 50, 140 59, 122 64 C 130 52, 130 28, 122 16 Z" />
          {/* Red tail band */}
          <path className="rk-band" d="M28 22 Q 22 25 22 31 V 49 Q 22 55 28 58 C 33 46, 33 34, 28 22 Z" />

          {/* Centre fin, seen edge-on */}
          <path className="rk-fin" d="M22 37 H52 Q 58 40 52 43 H22 Z" />

          {/* Porthole */}
          <circle className="rk-port-rim" cx="92" cy="40" r="12" />
          <circle className="rk-port" cx="92" cy="40" r="7.5" />
          <path className="rk-glint" d="M87 37.5 A 5.5 5.5 0 0 1 92 34" />
        </g>
      </svg>
    </div>
  );
});
