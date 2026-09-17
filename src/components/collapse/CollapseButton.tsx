// src/components/collapse/CollapseButton.tsx
import { useEffect, useRef, useState } from 'react';
import '@/components/collapse/collapse.css';
import {
  canRunCollapse,
  freezeStage,
  startRecede,
  startReturn,
  type FrozenStage,
  type RecedeHandle,
} from '@/components/collapse/paperRecede';
import { setCollapsePhase, useCollapsePhase } from '@/lib/collapseState';

/**
 * The button that breaks the site.
 *
 * ── Where it lives ──
 *
 * Mounted at App level, not inside StudioNav. The nav has a `backdrop-filter`,
 * and a filter on any ancestor makes `position: fixed` descendants resolve
 * against that ancestor instead of the viewport — the same trap documented on
 * SiteChrome for PullCord.
 *
 * ── Why it is a button and not a link ──
 *
 * The collapse never changes the URL. It is a state change on Home, not a
 * route, so there is nothing to put in an href and nothing for the router to
 * match.
 */
export function CollapseButton() {
  const phase = useCollapsePhase();
  const [available, setAvailable] = useState(true);
  const handleRef = useRef<RecedeHandle | null>(null);
  const frozenRef = useRef<FrozenStage | null>(null);

  /*
   * Checked in an effect rather than in useState's initialiser because
   * matchMedia reads the real device, and running it during render breaks the
   * moment this is rendered anywhere without a window. Defaulting to available
   * and correcting on mount also means the desktop case never flashes a
   * disabled state.
   */
  useEffect(() => setAvailable(canRunCollapse()), []);

  /* A running animation must not outlive the component that started it. */
  useEffect(
    () => () => {
      handleRef.current?.cancel();
      frozenRef.current?.release();
    },
    [],
  );

  async function fire() {
    if (!available || phase !== 'idle') return;

    /*
     * Freeze BEFORE the phase changes.
     *
     * `setCollapsePhase` is what puts `.collapse-active` on <html>, and that
     * class is what pins the stage and locks scroll. Freezing first means the
     * scroll offset is read and written into the shift while the document is
     * still scrollable and still reporting a real `window.scrollY` — do it the
     * other way round and the offset read is always zero, so a visitor who
     * clicked halfway down the page watches it snap to the top before it
     * starts moving.
     */
    const frozen = freezeStage();
    if (!frozen) {
      /*
       * Loud on purpose. A missing stage means the wrappers in Home.tsx were
       * removed or renamed, and the right outcome is a normal site with a dead
       * button rather than a half-started sequence over a page that never
       * moved.
       */
      console.error('[collapse] #collapse-stage / #collapse-shift not found — cannot start.');
      return;
    }

    frozenRef.current = frozen;
    setCollapsePhase('recede');

    /*
     * The 3D chunk load belongs here, started and not awaited.
     *
     * The recede's ~3 seconds is the only moment in the sequence with
     * something to look at that does not need the chunk yet. Kicking it off
     * before the animation rather than after turns the load into free time
     * instead of a stall between two beats.
     *
     * SLICE 2: uncomment when CollapseSequence exists. The timing is already
     * right and should not need rethinking.
     */
    // const sequence = import('@/components/collapse/CollapseSequence');

    const handle = startRecede(frozen);
    handleRef.current = handle;

    await handle.finished;

    /*
     * SLICE 1 ENDS HERE.
     *
     * The page is now a small tilted sheet with a rim of light on it, sitting
     * against an empty starfield. Slice 2 takes over from this line: mount the
     * WebGL scene behind the sheet, hand the captured texture to a quad, and
     * advance the phase.
     *
     *   const { CollapseSequence } = await sequence;
     *   setCollapsePhase('environment');
     *
     * Until then the phase stays at 'recede' and Escape is the way back.
     */
  }

  /*
   * Escape returns the site to normal.
   *
   * Wired here rather than in a sequence module because during slice 1 this
   * button is the only thing that knows the sequence is running — and because
   * a way out has to exist from the first commit. A state with no exit is how
   * a nice effect becomes a reason to close the tab.
   */
  useEffect(() => {
    if (phase === 'idle') return;

    async function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;

      handleRef.current?.cancel();
      handleRef.current = null;

      const frozen = frozenRef.current;
      if (!frozen) {
        setCollapsePhase('idle');
        return;
      }

      /*
       * Fly back before unfreezing, not after. The return animation only has a
       * sheet to animate while the stage is still pinned and transformed;
       * releasing first would put the full-height document back on screen
       * instantly and leave the animation running on an element that no longer
       * looks like a sheet.
       */
      const back = startReturn(frozen);
      handleRef.current = back;
      await back.finished;

      handleRef.current = null;
      frozenRef.current = null;
      /*
       * Phase first, release second. Clearing the phase removes
       * `.collapse-active`, which un-pins the stage and restores document
       * height — and `release` ends by scrolling back to the saved offset on
       * the next frame, which only works once that height exists again.
       */
      setCollapsePhase('idle');
      frozen.release();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  return (
    <button
      type="button"
      onClick={fire}
      disabled={!available}
      className={`collapse-button${available ? '' : ' collapse-button--unavailable'}`}
      /*
       * The accessible name carries the real meaning, because "⚠ COLLAPSE
       * WORLD" out of context does not say what pressing it does. The visible
       * text stays ominous; the label stays honest. Those are not in conflict
       * — one is flavour, the other is the contract.
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