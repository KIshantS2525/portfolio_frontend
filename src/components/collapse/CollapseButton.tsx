// src/components/collapse/CollapseButton.tsx
import { useEffect, useState } from 'react';
import '@/components/collapse/collapse.css';
import { canRunCollapse } from '@/components/collapse/paperRecede';
import { preloadMarqueeLogos } from '@/components/core/Marquee';
import { startCollapse, useCollapsePhase } from '@/lib/collapseState';

/**
 * The button that breaks the site.
 *
 * Just the button now. Through slice 1 this file also conducted the whole
 * sequence, which was the right call while every beat was a CSS animation and
 * the wrong one the moment WebGL setup and teardown joined in — that lives in
 * CollapseSequence.tsx. What is left here is the part that is genuinely about a
 * button: whether it can be pressed, what it says, and what it tells a screen
 * reader.
 *
 * The stylesheet import stays in this file because this is the one collapse
 * component that is always mounted on every page that can collapse. Anything
 * that renders later can rely on the styles already being there.
 */
export function CollapseButton() {
  const phase = useCollapsePhase();
  const [available, setAvailable] = useState(true);

  /*
   * Checked in an effect rather than useState's initialiser because matchMedia
   * reads the real device, and running it during render breaks the moment this
   * is rendered anywhere without a window. Defaulting to available and
   * correcting on mount also means the desktop case never flashes a disabled
   * state.
   */
  useEffect(() => setAvailable(canRunCollapse()), []);

  function fire() {
    if (!available || phase !== 'idle') return;
    /*
     * The return value is ignored on purpose. False means no conductor is
     * mounted, which only happens on a route where App.tsx does not render this
     * button in the first place — a second guard here would just be a place for
     * the two rules to drift apart.
     */
    startCollapse();
  }

  /*
   * Warmed on hover, the way every heavy door on this site is. The 3D chunk is
   * otherwise fetched on the click frame and races the recede; the marquee
   * icons have to be in memory before the poster mounts at all (see
   * CollapseSequence). Both are free by the time a finger reaches the button.
   */
  function warm() {
    if (!available) return;
    void import('@/components/collapse/collapseWorld').catch(() => {});
    void preloadMarqueeLogos().catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={fire}
      onPointerEnter={warm}
      onFocus={warm}
      disabled={!available}
      className={`collapse-button${available ? '' : ' collapse-button--unavailable'}`}
      /*
       * The accessible name carries the real meaning, because "⚠ COLLAPSE
       * WORLD" out of context does not say what pressing it does. The visible
       * text stays ominous; the label stays honest. Those are not in conflict —
       * one is flavour, the other is the contract.
       */
      aria-label={
        available
          ? 'Collapse the site into a walkable 3D world'
          : 'Collapse the site into a 3D world — requires a desktop computer with a mouse'
      }
      title={available ? undefined : 'Desktop only — needs a mouse and keyboard'}
    >
      <span className="collapse-button__icon" aria-hidden="true">
        ⚠
      </span>
      <span>{available ? 'Collapse World' : 'Desktop only'}</span>
    </button>
  );
}