// src/components/space/Rocket.tsx
'use client';

import { forwardRef } from 'react';
import './space.css';

/**
 * The Timeline's rocket: a space shuttle stack, flat-illustrated, flying
 * right — white orbiter with delta wings and a teal cockpit window, the
 * orange external tank behind it with its nose showing past the orbiter's,
 * two white solid boosters either side, and a striped flame out of the
 * engines. The engine bells sit at x=10 of the viewBox (which starts at -60),
 * so the Timeline can put that point exactly on the head of the line it draws.
 *
 * Motion comes from outside through CSS variables on the root, all owned by
 * the Timeline's frame loop:
 *   --boost   flame length (≈0.55 idle … ~1.85 at full burn)
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
        {/* Flame: booster plumes and the main striped plume, each flickering on its own clock. */}
        <g className="rk-flame">
          <path className="rk-f1" d="M14 26 C 2 20, -18 23, -34 26 C -18 29, 2 32, 14 26 Z" />
          <path className="rk-f1" d="M14 54 C 2 48, -18 51, -34 54 C -18 57, 2 60, 14 54 Z" />
          <path className="rk-f1" d="M12 40 C -4 27, -32 31, -60 40 C -32 49, -4 53, 12 40 Z" />
          <path className="rk-f2" d="M12 40 C 0 32, -20 35, -40 40 C -20 45, 0 48, 12 40 Z" />
          <path className="rk-f3" d="M12 40 C 4 36, -6 37, -18 40 C -6 43, 4 44, 12 40 Z" />
        </g>

        <g className="rk-body">
          {/* Solid rocket boosters */}
          <g className="rk-srb">
            <rect x="22" y="20" width="108" height="12" rx="2" />
            <path d="M130 20 Q150 21 156 26 Q150 31 130 32 Z" />
            <rect x="22" y="48" width="108" height="12" rx="2" />
            <path d="M130 48 Q150 49 156 54 Q150 59 130 60 Z" />
          </g>
          <path className="rk-srb-band" d="M50 20 v12 M98 20 v12 M50 48 v12 M98 48 v12" />
          <rect className="rk-skirt" x="16" y="21" width="7" height="10" rx="1.5" />
          <rect className="rk-skirt" x="16" y="49" width="7" height="10" rx="1.5" />

          {/* External tank */}
          <path
            className="rk-tank"
            d="M24 28 H150 Q172 30 184 40 Q172 50 150 52 H24 Q20 52 20 48 V32 Q20 28 24 28 Z"
          />
          <path className="rk-tank-line" d="M60 28 V52 M118 28 V52" />

          {/* Orbiter */}
          <path className="rk-wing" d="M44 34 L22 10 Q20 6 26 7 L92 34 Z" />
          <path className="rk-wing" d="M44 46 L22 70 Q20 74 26 73 L92 46 Z" />
          <path className="rk-wing-edge" d="M92 34 L26 7 M92 46 L26 73" />
          <path
            className="rk-orbiter"
            d="M26 33 H128 Q150 33.5 160 40 Q150 46.5 128 47 H26 Q22 47 22 43 V37 Q22 33 26 33 Z"
          />
          <path className="rk-orbiter-nose" d="M148 34.6 Q156 36.5 160 40 Q156 43.5 148 45.4 Q152 40 148 34.6 Z" />
          <path className="rk-fin" d="M24 38 H52 L44 40 L52 42 H24 Z" />
          <circle className="rk-window" cx="138" cy="40" r="3.6" />

          {/* Main engines */}
          <rect className="rk-engine" x="12" y="34" width="10" height="5" rx="1.5" />
          <rect className="rk-engine" x="12" y="41" width="10" height="5" rx="1.5" />
        </g>
      </svg>
    </div>
  );
});
