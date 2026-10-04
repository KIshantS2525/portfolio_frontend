// src/components/space/Satellite.tsx
'use client';

import { useEffect, useRef } from 'react';
import './space.css';

/** Fired by CopyEmail (detail 'send') and contact-link hovers (detail 'ping'). */
export const SIGNAL_EVENT = 'contact:signal';

/** The whole craft sits at a slight angle; the dish aim compensates for it. */
const TILT_DEG = -9;

/**
 * The Contact satellite.
 *
 * Built like a real one rather than a toy: a gold-foil bus with a thruster
 * pair underneath, two long solar arrays of three hinged panels each on a
 * truss, an omni whip antenna, a blinking beacon, and a parabolic dish on a
 * boom. The dish turns to point straight at the cursor, all the way round.
 *
 * It is the thing that reaches you, so copying the email sends three rings
 * rippling outward from it; hovering a contact link sends one.
 */
export function Satellite({ className = '' }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dishRef = useRef<SVGGElement>(null);
  const jointRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const dish = dishRef.current;
    const joint = jointRef.current;
    if (!root || !dish || !joint) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let target = -40;
    let angle = -40;
    let raf = 0;
    let px = -1;
    let py = -1;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      px = e.clientX;
      py = e.clientY;
    };
    const step = () => {
      if (px >= 0) {
        const r = joint.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        target = (Math.atan2(py - cy, px - cx) * 180) / Math.PI - TILT_DEG;
      }
      // Shortest way round, eased, so it swings rather than snaps.
      let d = target - angle;
      d = ((d + 540) % 360) - 180;
      angle += d * 0.09;
      dish.style.setProperty('--aim', `${angle.toFixed(2)}deg`);
      raf = requestAnimationFrame(step);
    };
    if (!reduced) {
      window.addEventListener('pointermove', onMove, { passive: true });
      raf = requestAnimationFrame(step);
    } else {
      dish.style.setProperty('--aim', `${angle}deg`);
    }

    let t = 0;
    const send = (e: Event) => {
      const strong = (e as CustomEvent<string>).detail !== 'ping';
      root.classList.remove('is-sending', 'is-pinging');
      void root.offsetWidth;
      root.classList.add(strong ? 'is-sending' : 'is-pinging');
      window.clearTimeout(t);
      t = window.setTimeout(() => root.classList.remove('is-sending', 'is-pinging'), 2200);
    };
    window.addEventListener(SIGNAL_EVENT, send);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener(SIGNAL_EVENT, send);
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);

  /** One solar panel: a frame of 4×3 cells. */
  const panel = (x: number) => (
    <g key={x} className="sat-panel">
      <rect x={x} y="78" width="50" height="64" rx="2" className="sat-cells" />
      <path
        className="sat-cell-lines"
        d={`M${x + 12.5} 78 V142 M${x + 25} 78 V142 M${x + 37.5} 78 V142 M${x} 99.3 H${x + 50} M${x} 120.6 H${x + 50}`}
      />
      <rect x={x} y="78" width="50" height="64" rx="2" className="sat-frame" />
    </g>
  );

  return (
    <div ref={rootRef} className={`sat ${className}`} aria-hidden>
      <div className="sat-float" style={{ rotate: `${TILT_DEG}deg` }}>
        {/* Signal ripples, centred on the bus. */}
        <span className="sat-ripple" />
        <span className="sat-ripple" />
        <span className="sat-ripple" />

        <svg viewBox="0 0 420 220" className="sat-svg" overflow="visible">
          <defs>
            <linearGradient id="sat-foil" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f8dc84" />
              <stop offset="0.35" stopColor="#d8a133" />
              <stop offset="0.55" stopColor="#f3cb62" />
              <stop offset="0.8" stopColor="#b98426" />
              <stop offset="1" stopColor="#e8bb4d" />
            </linearGradient>
            <linearGradient id="sat-cell" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b4fb8" />
              <stop offset="0.5" stopColor="#1b3485" />
              <stop offset="1" stopColor="#2c55c4" />
            </linearGradient>
            <linearGradient id="sat-dish" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#c9ced8" />
              <stop offset="1" stopColor="#f4f6fa" />
            </linearGradient>
          </defs>

          {/* Truss and hinges carrying the arrays. */}
          <path className="sat-truss" d="M18 110 H182 M238 110 H402" />
          <path className="sat-truss thin" d="M70 104 L75 116 M125 104 L130 116 M290 104 L295 116 M345 104 L350 116" />
          {[15, 70, 125].map(panel)}
          {[245, 300, 355].map(panel)}
          {[70, 125, 182, 238, 295, 350].map((x) => (
            <circle key={x} className="sat-hinge" cx={x + 2.5} cy="110" r="3" />
          ))}

          {/* Bus: gold foil, crinkled, with an instrument deck. */}
          <rect className="sat-bus" x="182" y="70" width="56" height="80" rx="4" />
          <path
            className="sat-crinkle"
            d="M188 82 L198 88 L192 98 L204 104 M226 78 L218 90 L230 96 M190 124 L202 118 L196 136 M222 128 L232 120 L226 142"
          />
          <rect className="sat-deck" x="190" y="96" width="40" height="22" rx="2" />
          <circle className="sat-lens" cx="210" cy="107" r="6.5" />
          <circle className="sat-lens-glint" cx="208" cy="105" r="1.8" />

          {/* Thrusters. */}
          <path className="sat-thruster" d="M192 150 h10 l2 9 h-14 Z M218 150 h10 l2 9 h-14 Z" />

          {/* Omni whip antenna and beacon. */}
          <path className="sat-whip" d="M230 70 L238 34" />
          <circle className="sat-beacon" cx="238.5" cy="31.5" r="3.6" />

          {/* Dish on its boom. The whole group turns to the cursor about the joint. */}
          <path className="sat-truss" d="M200 70 L200 52" />
          <circle ref={jointRef} className="sat-joint" cx="200" cy="48" r="4" />
          <g ref={dishRef} className="sat-dish">
            <path className="sat-truss thin" d="M200 48 H212" />
            {/* the bowl, opening toward +x */}
            <path className="sat-bowl" d="M214 22 Q236 48 214 74 Q222 48 214 22 Z" />
            {/* feed struts and horn */}
            <path className="sat-truss thin" d="M216 26 L240 48 L216 70" />
            <circle className="sat-feed" cx="241" cy="48" r="3" />
          </g>
        </svg>
      </div>
    </div>
  );
}
