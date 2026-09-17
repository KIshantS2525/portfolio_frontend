// src/lib/collapseState.ts
import { useSyncExternalStore } from 'react';

/**
 * The one piece of state the collapse sequence shares with the rest of the site.
 *
 * ── Why this exists at all ──
 *
 * `SiteChrome` in App.tsx decides what hangs over the page by looking at
 * `pathname`. That works because every other "second experience" here
 * (/archive, /game, /admin) is a route. The collapse is not: it happens *on*
 * Home, at the same URL, so there is no pathname change for SiteChrome to
 * react to.
 *
 * `useSyncExternalStore` rather than Context because the consumers sit in
 * completely different branches of the tree — SiteChrome is above <Routes>,
 * the poster is several levels inside Home — and threading a provider around
 * both to share one enum is more plumbing than the problem deserves.
 */

export type CollapsePhase =
  /** The site, as it has always been. */
  | 'idle'
  /** The poster is a sheet pulling away from the camera. */
  | 'recede'
  /** Held still. Debris starts falling. The beat before the drop. */
  | 'rumble'
  /** The hinge fall, the impact, the dust. */
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

export function getCollapsePhase(): CollapsePhase {
  return phase;
}

export function setCollapsePhase(next: CollapsePhase) {
  if (next === phase) return;
  phase = next;

  /*
   * Two hooks for CSS, written here rather than in a component effect so it is
   * impossible for the markup and the phase to disagree — there is exactly one
   * place either changes.
   *
   *   · `.collapse-active` is the coarse "is anything happening" switch. It is
   *     what pins the stage and locks page scroll.
   *   · `data-collapse-phase` is the fine one. The debris, the shake and the
   *     dust are pure CSS animations, and this attribute is what starts each of
   *     them at the right beat without a single line of JS touching them.
   */
  document.documentElement.classList.toggle('collapse-active', next !== 'idle');
  document.documentElement.dataset.collapsePhase = next;
  /* Back at idle there is no world, whatever state the last run left this in. */
  if (next === 'idle') delete document.documentElement.dataset.collapseWorld;

  for (const l of listeners) l();
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
 * sheet starts moving. A theme cord or a drifting mote left hanging in front
 * of a page flying away from the camera reads immediately as a bug, because
 * those things are pinned to the viewport and the page no longer is.
 */
export function useCollapseActive(): boolean {
  return useCollapsePhase() !== 'idle';
}

/* ── Starting the sequence ──────────────────────────────────────────────── */

/*
 * The button and the conductor live in different branches of the tree: the
 * button at App level (a fixed element must not sit under StudioNav's
 * backdrop-filter), the conductor inside Home (it owns the world's host element
 * and has to sit beside the stage it animates). Until slice 2 the button WAS the
 * conductor, so this never came up.
 *
 * A single registered starter rather than an event: there is exactly one thing
 * that can start the sequence and exactly one place it can be started from, and
 * a return value is how the button learns whether anything was listening —
 * which, on a route without Home, nothing is.
 */
let starter: (() => void) | null = null;

/** Called by the conductor on mount. Returns the unregister function. */
export function registerCollapseStarter(fn: () => void): () => void {
  starter = fn;
  return () => {
    if (starter === fn) starter = null;
  };
}

/** Starts the sequence if a conductor is mounted. False if nothing was listening. */
export function startCollapse(): boolean {
  if (!starter || phase !== 'idle') return false;
  starter();
  return true;
}

/**
 * Marks the WebGL world as drawing (or not).
 *
 * Written onto <html> beside the phase, for the same one-place reason. CSS keys
 * two things off it: the world canvas fading in, and the CSS placeholder
 * starfield fading out underneath the real one. If the world never arrives —
 * no WebGL, chunk failed to load — this is never set, the placeholder simply
 * stays, and the sequence plays exactly as it did before slice 2.
 */
export function setCollapseWorldReady(ready: boolean) {
  if (ready) document.documentElement.dataset.collapseWorld = 'ready';
  else delete document.documentElement.dataset.collapseWorld;
}