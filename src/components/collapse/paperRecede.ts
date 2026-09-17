// src/components/collapse/paperRecede.ts

/**
 * Phase one: the page becomes a physical sheet and pulls away from the camera.
 *
 * ── Why this transforms the real DOM instead of a screenshot ──
 *
 * The obvious implementation is to rasterise the page to a canvas on click and
 * animate that. It is also the wrong way round: a capture has to *finish*
 * before anything can move, which puts a stall of unknown length between the
 * click and the first frame — on the one interaction of the entire site where
 * the response must feel instant, because the premise is that the button broke
 * something. Transforming live DOM starts on the same frame as the click and
 * keeps text as text, sharp all the way back.
 *
 * ── The four things that made earlier versions fail ──
 *
 *   1. THE PIVOT WAS OFF-SCREEN. GraphJourney is a pinned sequence roughly
 *      1100vh tall, so <main> is about eleven viewports of document. A
 *      `transform-origin: 50% 50%` on that pivots around a point five and a
 *      half screens below whatever the visitor is looking at, which throws the
 *      visible region out of frame. Fixed by freezing (below).
 *
 *   2. THE TRANSFORM KILLED `position: sticky`. GraphJourney's entire visual is
 *      a `sticky top-0 h-screen` layer, and a transform on an ancestor makes
 *      that ancestor the containing block — so the sticky layer stopped
 *      resolving against the viewport and detached. Same containing-block rule
 *      already documented on SiteChrome for PullCord. Also fixed by freezing:
 *      a viewport-sized fixed stage is the same box sticky was using anyway.
 *
 *   3. IT ENDED FAR TOO LARGE. Perspective and distance together set the final
 *      on-screen size — `perspective / (perspective + |Z|)` — and 2200px of
 *      perspective against 1650px of Z is 57% of the screen. That is not a
 *      page floating in space, it is a large dark rectangle covering the
 *      window, which is exactly how it read. See RECEDE_Z.
 *
 *   4. IT WAS BLACK ON BLACK with a 9%-opacity border that could not be seen.
 *      Solved in collapse.css with a genuinely lit edge; noted here because
 *      the two files have to stay in agreement about what makes the sheet
 *      visible.
 *
 * ── What freezing does ──
 *
 * Before anything animates the stage is pinned to the viewport at exactly
 * viewport size, with its content shifted up by the current scroll offset so
 * not one pixel moves at the instant of the switch. From there the element
 * being transformed is one screen tall instead of eleven.
 */

/** How long the sheet takes to reach its resting distance. */
export const RECEDE_MS = 3200;

/**
 * How far back it goes, in px of Z, against the 1600px perspective set in
 * collapse.css.
 *
 * ── Read this before changing it ──
 *
 * Final on-screen scale is `perspective / (perspective + |Z|)`. These two
 * numbers are one setting split across two files, and changing either alone
 * silently rescales the whole shot:
 *
 *     1600 / (1600 + 5800)  ≈  0.216   ← current
 *     1600 / (1600 + 1650)  ≈  0.49
 *     2200 / (2200 + 1650)  ≈  0.57    ← the version that filled the screen
 *
 * ~22% is the target: small enough to be an object with space around it, large
 * enough that the site is still legible as itself rather than a stamp — and it
 * leaves room below frame for the ground the sheet has to fall onto in slice 3.
 */
const RECEDE_Z = -5800;

/** Tilt at rest, so it reads as a sheet lying in space rather than a zoom-out. */
const RECEDE_TILT_DEG = 11;

/**
 * Slow to leave, quick through the middle, settling rather than stopping.
 *
 * A plain ease-out reads as a camera pull. This reads as something heavy being
 * dragged away from you, which is the story: nobody is moving the camera, the
 * world is moving.
 */
const RECEDE_EASE = 'cubic-bezier(0.55, 0.02, 0.24, 1)';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Whether this device can actually play the world once it has collapsed.
 *
 * Pointer lock plus WASD is the whole control scheme, so a touch device is not
 * a degraded experience here, it is a dead end. Checked at mount so the button
 * can say so up front rather than accepting a tap and then refusing.
 */
export function canRunCollapse(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hasPointerLock = 'requestPointerLock' in HTMLElement.prototype;
  return !coarse && hasPointerLock;
}

export type FrozenStage = {
  stage: HTMLElement;
  /** Scroll offset at the moment of freezing, so the exit can restore it exactly. */
  scrollY: number;
  /** Undoes the freeze and puts the document back the way it was. */
  release: () => void;
};

/**
 * Pins the page to the viewport without moving a single pixel.
 *
 * The order here matters and is not interchangeable:
 *
 *   · `scrollY` is read FIRST, because everything else depends on it and
 *     locking the document destroys it.
 *   · The shift is applied to the inner element BEFORE the stage goes fixed.
 *     The other way round leaves one frame where the content is pinned to the
 *     top of the viewport but the visitor was scrolled elsewhere — the page
 *     visibly jumps to the top and then starts receding, which is precisely
 *     the artefact this function exists to prevent.
 */
export function freezeStage(): FrozenStage | null {
  const stage = document.getElementById('collapse-stage');
  const shift = document.getElementById('collapse-shift');
  if (!stage || !shift) return null;

  const scrollY = window.scrollY;

  /*
   * An inline style rather than a CSS variable because it is a measurement
   * taken at one instant, not a design token — and because the release path
   * has to be able to clear it with certainty.
   */
  shift.style.transform = `translate3d(0, ${-scrollY}px, 0)`;

  return {
    stage,
    scrollY,
    release: () => {
      shift.style.transform = '';
      stage.style.transform = '';
      stage.style.opacity = '';
      /*
       * Scroll restoration has to wait a frame. The document has no height to
       * scroll into until `.collapse-active` comes off and `overflow: hidden`
       * with it, and that class is removed by the store on the same tick this
       * runs — so scrolling now would land on a page still one viewport tall
       * and silently clamp to zero.
       */
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    },
  };
}

export type RecedeHandle = {
  /** Resolves when the sheet has reached its resting distance. */
  finished: Promise<void>;
  /** Stops immediately. Does not restore the document — that is `release`'s job. */
  cancel: () => void;
};

/**
 * Starts the recede on a frozen stage.
 *
 * The caller owns the phase: this animates an element and says when it is
 * done, and nothing else. That is what keeps it reusable in reverse for the
 * exit and testable without a state machine around it.
 */
export function startRecede(frozen: FrozenStage): RecedeHandle {
  const reduced = prefersReducedMotion();

  /*
   * Reduced motion does not skip the recede. Skipping it would drop the
   * visitor into an unexplained 3D world with no causal link to the button
   * they just pressed — the sequence would stop making sense, which is a
   * bigger loss than the motion. It collapses to a short, flat scale instead:
   * same beat, no tilt, no lurch, no rush of depth.
   */
  const duration = reduced ? 520 : RECEDE_MS;

  const keyframes: Keyframe[] = reduced
    ? [
        { transform: 'translate3d(0, 0, 0)', opacity: 1 },
        { transform: 'scale(0.24)', opacity: 1 },
      ]
    : [
        {
          transform: 'translate3d(0, 0, 0) rotateX(0deg) rotateZ(0deg)',
          offset: 0,
          easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
        },
        /*
         * A held beat at 8%: the sheet lurches slightly TOWARD the viewer
         * before it goes, and rolls a fraction of a degree off true.
         *
         * Something heavy being pulled backwards compresses first, and a flat
         * object being dragged never leaves perfectly square. Without this the
         * motion starts from nothing and immediately looks like a CSS
         * transition — the one thing it must not look like. The rotateZ is
         * deliberately tiny; at a full degree it stops reading as physical
         * slack and starts reading as a wonky page.
         */
        {
          transform: 'translate3d(0, 0, 90px) rotateX(-1.4deg) rotateZ(-0.4deg)',
          offset: 0.08,
          easing: RECEDE_EASE,
        },
        /*
         * Most of the distance is covered by 62%, and the remaining time
         * travels only the last seventh of the way. That long, slow arrival is
         * what makes it feel like mass settling rather than an animation
         * reaching its end value — and it hands the next phase a sheet that is
         * already nearly still, so the silence before the quake lands on
         * something at rest rather than something braking.
         */
        {
          transform: `translate3d(0, -2%, ${RECEDE_Z * 0.86}px) rotateX(${RECEDE_TILT_DEG * 0.78}deg) rotateZ(-0.22deg)`,
          offset: 0.62,
          easing: 'cubic-bezier(0.33, 0, 0.33, 1)',
        },
        {
          transform: `translate3d(0, -4%, ${RECEDE_Z}px) rotateX(${RECEDE_TILT_DEG}deg) rotateZ(0deg)`,
          offset: 1,
        },
      ];

  const animation = frozen.stage.animate(keyframes, {
    duration,
    /*
     * The sheet must STAY where the animation left it. Without `forwards` it
     * snaps back to untransformed on the final frame — on a 3.2s retreat that
     * means the whole page slamming back into the visitor's face at the exact
     * moment the environment is supposed to be fading in behind it.
     */
    fill: 'forwards',
  });

  let cancelled = false;

  const finished = animation.finished
    .then(() => undefined)
    .catch(() => {
      /*
       * `.finished` rejects with AbortError on cancel. That is a normal
       * outcome here, not a failure — the caller is the one that cancelled.
       * Swallowing it keeps an expected path out of the console.
       */
      if (!cancelled) throw new Error('recede animation failed');
      return undefined;
    });

  return {
    finished,
    cancel: () => {
      cancelled = true;
      animation.cancel();
    },
  };
}

/**
 * The reverse, for the exit path.
 *
 * Deliberately quicker than the way in — 1.4s against 3.2s. Coming back is not
 * a reveal and does not need to be savoured; making someone sit through the
 * full cinematic every time they press Escape turns a good effect into an
 * obstacle. It also skips the lurch, because there is nothing to anticipate on
 * the way home.
 */
export function startReturn(frozen: FrozenStage): RecedeHandle {
  const reduced = prefersReducedMotion();

  const animation = frozen.stage.animate(
    reduced
      ? [{ transform: 'scale(0.24)' }, { transform: 'translate3d(0, 0, 0)' }]
      : [
          {
            transform: `translate3d(0, -4%, ${RECEDE_Z}px) rotateX(${RECEDE_TILT_DEG}deg)`,
          },
          { transform: 'translate3d(0, 0, 0) rotateX(0deg)' },
        ],
    {
      duration: reduced ? 320 : 1400,
      easing: 'cubic-bezier(0.22, 0.68, 0.18, 1)',
      fill: 'forwards',
    },
  );

  let cancelled = false;

  return {
    finished: animation.finished
      .then(() => {
        /*
         * Unlike the outbound trip the end state here IS the untransformed
         * page, so the fill is dropped once it lands. Leaving a filled
         * animation on the stage would keep a compositing layer and a 3D
         * context alive on a document that has gone back to being ordinary.
         */
        animation.cancel();
        return undefined;
      })
      .catch(() => {
        if (!cancelled) throw new Error('return animation failed');
        return undefined;
      }),
    cancel: () => {
      cancelled = true;
      animation.cancel();
    },
  };
}