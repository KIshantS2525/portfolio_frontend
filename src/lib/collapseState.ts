// src/lib/collapseState.ts
import { useSyncExternalStore } from 'react';

/**
 * The one piece of state the collapse sequence shares with the rest of the site.
 *
 * ── Why this exists at all ──
 *
 * `SiteChrome` in App.tsx decides what hangs over the page by looking at
 * `pathname`. That works because every other "second experience" on this site
 * (/archive, /game, /admin) is a route. The collapse is not: it happens *on*
 * Home, at the same URL, so there is no pathname change for SiteChrome to
 * react to.
 *
 * Hence a tiny store rather than a router read. `useSyncExternalStore` instead
 * of Context because the consumers are in completely different branches of the
 * tree — SiteChrome sits above <Routes>, GraphJourney sits several levels
 * inside Home — and threading a provider around both to share one enum is more
 * plumbing than the problem deserves.
 *
 * ── Why the whole phase and not just a boolean ──
 *
 * A boolean would be enough for SiteChrome, which only wants "is anything
 * happening". But the sequence has beats that need different things from the
 * page — RECEDE still needs the real DOM on screen because the DOM *is* what's
 * receding, while everything from ENVIRONMENT onward does not and would rather
 * the browser stopped painting it. One enum serves both, and it is the same
 * value the sequence is already switching on internally.
 */

export type CollapsePhase =
  /** The site, as it has always been. */
  | 'idle'
  /** The page is a sheet pulling away from the camera. Still real DOM. */
  | 'recede'
  /** Night, stars, fog. The sheet is now a textured quad in the 3D scene. */
  | 'environment'
  /** Rumble, debris, hinge fall, slam. */
  | 'quake'
  /** Camera eases down to eye height. No player control yet. */
  | 'settle'
  /** Buildings rise out of the ground in page order. */
  | 'rise'
  /** Camera lifts to read the name from above, holds, descends. */
  | 'reveal'
  /** WASD. The only phase where the player is actually driving. */
  | 'explore'
  /** Reversing back out to `idle`. */
  | 'exit';

let phase: CollapsePhase = 'idle';
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getCollapsePhase(): CollapsePhase {
  return phase;
}

export function setCollapsePhase(next: CollapsePhase) {
  if (next === phase) return;
  phase = next;
  /*
   * The `collapse-active` class on <html> is what lets plain CSS react to the
   * sequence without every stylesheet importing this module — it is how the
   * page scroll gets locked (see collapse.css) and how anything that should
   * simply not exist during the sequence can hide itself.
   *
   * Written here rather than in a component effect so it is impossible for the
   * class and the phase to disagree: there is exactly one place either changes.
   */
  document.documentElement.classList.toggle('collapse-active', next !== 'idle');
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current phase, as React state. */
export function useCollapsePhase(): CollapsePhase {
  return useSyncExternalStore(subscribe, getCollapsePhase, () => 'idle' as const);
}

/**
 * True once the sequence has taken the page over.
 *
 * Note `recede` counts as active: site chrome has to be gone *before* the
 * sheet starts moving, not after. A theme cord or a drifting mote left hanging
 * in front of a page that is flying away from the camera immediately reads as
 * a bug, because those things are pinned to the viewport and the page is not.
 */
export function useCollapseActive(): boolean {
  return useCollapsePhase() !== 'idle';
}

/**
 * True while the real page DOM still needs to be on screen.
 *
 * Only `recede` qualifies. Everything after it is WebGL, and leaving a
 * full-height document painted underneath a fullscreen canvas costs real
 * compositing work for pixels nobody can see.
 */
export function useDomVisible(): boolean {
  const p = useCollapsePhase();
  return p === 'idle' || p === 'recede' || p === 'exit';
}