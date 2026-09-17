// src/components/collapse/paperRecede.ts

/**
 * The sheet: fitting it, pulling it away, and dropping it.
 *
 * Three beats live here, and they share geometry rather than each inventing
 * their own — which is why they are one module and not three.
 *
 *   fitPoster()    measures the poster and works out the two transforms the
 *                  recede moves between.
 *   startRecede()  the pull away from the camera.
 *   startFall()    the hinge collapse onto the ground.
 *
 * ── Why the transforms are computed in JS ──
 *
 * The poster is a fixed-width design that has to end up framed inside a
 * viewport of unknown size, and "fit this box inside that box with margin" is
 * arithmetic. Done in CSS it would be a stack of clamps and viewport units that
 * are hard to read and harder to keep in agreement with the fall, which needs
 * the same numbers. Done here it is four lines and both beats share them.
 */

import type { SheetGeometry } from '@/components/collapse/handoff';

/** How long the sheet takes to reach its resting distance. */
export const RECEDE_MS = 3000;

/** The held beat after it arrives: silence, then debris. */
export const RUMBLE_MS = 1500;

/** The fall itself, from first tip to impact. */
export const FALL_MS = 1150;

/** Shake, dust and settle after the slam. */
export const IMPACT_MS = 1400;

/**
 * How far it tips.
 *
 * Not 90°. A sheet at exactly 90° is edge-on to the camera and disappears into
 * a line for the last instant of the fall, then reappears as the camera moves
 * in slice 4 — which looks like a rendering glitch rather than a landing. 84°
 * keeps a sliver of the face visible the whole way down and reads as lying flat
 * from any camera height the rest of the sequence uses.
 */
export const FALL_DEG = 84;

/**
 * The perspective the whole sheet is seen through, and its vanishing point.
 *
 * These used to live only in collapse.css, and handover bug #3 is what that
 * cost: final scale depends on a number in one file and a number in another,
 * and changing one silently broke the other. Slice 2 adds a third consumer —
 * the WebGL handoff camera is derived from exactly these two values, to the
 * pixel — so they now live here and `fitPoster` writes them onto the viewport
 * inline. The stylesheet keeps the same values only as a fallback for the frame
 * before JS runs.
 */
export const PERSPECTIVE_PX = 1500;
export const PERSPECTIVE_ORIGIN_Y = 0.42;

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

export type Fit = {
  viewport: HTMLElement;
  stage: HTMLElement;
  sheet: HTMLElement;
  poster: HTMLElement;
  /** Transform where the poster's first screen fills the viewport. */
  near: string;
  /** Transform where the whole poster is framed in the viewport. */
  far: string;
  scrollY: number;
  /**
   * The same fit as plain numbers, for the WebGL handoff.
   *
   * The world never reads transforms back out of the DOM. Computed style would
   * hand it a matrix that includes whatever frame of the camera shake happened
   * to be current; these are the values the animations were BUILT from, which
   * are the values the sheet comes to rest at.
   */
  geometry: SheetGeometry;
  release: () => void;
};

/**
 * Measures the poster and produces the two transforms the recede runs between.
 *
 * ── Why the poster is the width of the window now ──
 *
 * Through slice 2 the poster was a fixed 1280px design, scaled by vw/1280 so
 * its first screen filled the window. That was right for a summary layout and
 * wrong for a replica. The homepage sizes its type in `vw` and switches layout
 * at `md:` and `lg:` — so the same components laid out at 1280px on a 1920px
 * screen are a different page: different line breaks, a different number of
 * card columns, headings that are the wrong size and then scaled again.
 *
 * Laid out at the real viewport width, every one of those rules resolves
 * exactly as it does on the live page, so at `near` (scale 1) the poster IS
 * the page. The hero is `min-h-screen`, exactly as the live hero is, so the
 * first screen needs no sizing trick either — the one the old version needed
 * is gone.
 *
 * The cost is that a window resize mid-sequence reflows the sheet. So does the
 * real page. It is a rare enough event that matching the page the rest of the
 * time is the better trade.
 */
export function fitPoster(): Fit | null {
  const viewport = document.getElementById('collapse-viewport');
  const stage = document.getElementById('collapse-stage');
  const sheet = document.getElementById('collapse-sheet');
  const poster = document.getElementById('collapse-poster');
  if (!viewport || !stage || !sheet || !poster) return null;

  viewport.style.perspective = `${PERSPECTIVE_PX}px`;
  viewport.style.perspectiveOrigin = `50% ${PERSPECTIVE_ORIGIN_Y * 100}%`;

  const scrollY = window.scrollY;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const posterW = poster.offsetWidth;
  const posterH = poster.scrollHeight;

  /*
   * 0.58 of the width and 0.66 of the height, whichever binds first.
   *
   * The margin is not politeness — the sheet has to fall forward into frame
   * without its bottom edge leaving the screen, and the ground it lands on has
   * to be visible below it in slice 3. A poster fitted edge-to-edge would have
   * nowhere to land.
   */
  const farScale = Math.min((vw * 0.58) / posterW, (vh * 0.66) / posterH);
  const farY = (vh - posterH * farScale) / 2;

  /*
   * The hinge is the bottom of the SHEET, which is what `transform-origin:
   * 50% 100%` resolves against — not the poster's scrollHeight used for the fit
   * above. They are the same number today; measuring the right element means
   * they cannot silently drift apart if the sheet ever gains anything beside
   * the poster.
   */
  const sheetH = sheet.offsetHeight;

  return {
    viewport,
    stage,
    sheet,
    poster,
    /*
     * `translate` before `scale` in the string, which means it is applied
     * AFTER — transforms read right to left. With the stage's origin at its top
     * centre, scaling leaves the top edge at y=0 and the translate then places
     * it. Reverse the order and the offset gets multiplied by the scale, which
     * puts the poster somewhere off-screen at small scales.
     */
    near: `translate(-50%, 0px) scale(1)`,
    far: `translate(-50%, ${farY}px) scale(${farScale})`,
    scrollY,
    geometry: {
      vw,
      vh,
      sheetW: posterW,
      sheetH,
      scale: farScale,
      top: farY,
      perspective: PERSPECTIVE_PX,
      originYFrac: PERSPECTIVE_ORIGIN_Y,
      fallDeg: FALL_DEG,
    },
    release: () => {
      /*
       * Every animation here runs with `fill: 'forwards'`, and a filled WAAPI
       * animation keeps overriding the element's transform after it finishes —
       * clearing the inline style does not touch it. Left in place, the return
       * animation's last frame (`near`: translate(-50%) and a scale) would stay
       * applied to the stage once it is back in normal flow, shoving the live
       * page half a screen to the left. Cancelling drops them outright.
       */
      for (const a of [...stage.getAnimations(), ...sheet.getAnimations()]) a.cancel();
      stage.style.transform = '';
      stage.style.visibility = '';
      sheet.style.transform = '';
      viewport.style.perspective = '';
      viewport.style.perspectiveOrigin = '';
      /*
       * Scroll restoration waits a frame. The document has no height to scroll
       * into until `.collapse-active` comes off and `overflow: hidden` with it,
       * and that class is removed by the store on the same tick this runs — so
       * scrolling now would land on a page still one viewport tall and silently
       * clamp to zero.
       */
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    },
  };
}

export type Handle = {
  finished: Promise<void>;
  cancel: () => void;
};

/** Wraps a WAAPI animation so cancellation is a normal outcome and not a rejection. */
function handleOf(animation: Animation, label: string): Handle {
  let cancelled = false;
  return {
    finished: animation.finished
      .then(() => undefined)
      .catch(() => {
        /*
         * `.finished` rejects with AbortError on cancel. That is expected here —
         * the caller is the one that cancelled — so swallowing it keeps a normal
         * path out of the console. Anything else is a real failure.
         */
        if (!cancelled) throw new Error(`${label} animation failed`);
        return undefined;
      }),
    cancel: () => {
      cancelled = true;
      animation.cancel();
    },
  };
}

/**
 * The pull away from the camera: `near` to `far`.
 *
 * Slow to leave, quick through the middle, settling rather than stopping. A
 * plain ease-out reads as a camera pull; this reads as something heavy being
 * dragged away from you, which is the story — nobody is moving the camera, the
 * world is moving.
 */
export function startRecede(fit: Fit): Handle {
  const reduced = prefersReducedMotion();

  /*
   * Reduced motion does not skip the recede. Skipping it would drop the visitor
   * into an unexplained 3D world with no causal link to the button they pressed
   * — the sequence would stop making sense, which is a bigger loss than the
   * motion. It plays flat and short instead: no lurch, no roll, no rush of
   * depth.
   */
  const keyframes: Keyframe[] = reduced
    ? [{ transform: fit.near }, { transform: fit.far }]
    : [
        { transform: `${fit.near} rotateZ(0deg)`, offset: 0, easing: 'cubic-bezier(0.3,0,0.2,1)' },
        /*
         * A held beat at 8%: the sheet lurches slightly TOWARD the viewer before
         * it goes, and rolls a fraction of a degree off true.
         *
         * Something heavy being pulled backwards compresses first, and a flat
         * object being dragged never leaves perfectly square. Without this the
         * motion starts from nothing and immediately looks like a CSS
         * transition — the one thing it must not look like. The roll is
         * deliberately tiny; at a full degree it stops reading as physical slack
         * and starts reading as a wonky page.
         */
        {
          transform: `translate(-50%, -1.5%) scale(${scaleOf(fit.near) * 1.035}) rotateZ(-0.4deg)`,
          offset: 0.08,
          easing: 'cubic-bezier(0.55,0.02,0.24,1)',
        },
        /*
         * Most of the distance by 62%, the rest crawling. That long arrival is
         * what makes it read as mass settling rather than an animation reaching
         * its end value — and it hands the rumble a sheet that is already nearly
         * still, so the silence lands on something at rest rather than something
         * braking.
         */
        {
          transform: `${lerpTransform(fit.near, fit.far, 0.88)} rotateZ(-0.2deg)`,
          offset: 0.62,
          easing: 'cubic-bezier(0.33,0,0.33,1)',
        },
        { transform: `${fit.far} rotateZ(0deg)`, offset: 1 },
      ];

  return handleOf(
    fit.stage.animate(keyframes, {
      duration: reduced ? 520 : RECEDE_MS,
      /*
       * The sheet must STAY where the animation left it. Without `forwards` it
       * snaps back to untransformed on the final frame — on a three-second
       * retreat that means the whole page slamming back into the visitor's face
       * at the exact moment the space is supposed to be opening behind it.
       */
      fill: 'forwards',
    }),
    'recede',
  );
}

/**
 * The hinge fall.
 *
 * ── Why this animates the sheet and not the stage ──
 *
 * The stage owns position and scale, with its transform origin at the top
 * centre, because that is what makes the fit arithmetic above simple. The fall
 * needs to pivot around the BOTTOM edge — that is what a wall does, and it is
 * the difference between a collapse and a spin. Two different origins on one
 * element is impossible, so the sheet is a second element inside the stage that
 * owns nothing but rotation, with its own origin at 50% 100%.
 *
 * ── Why it overshoots ──
 *
 * A sheet that eases smoothly to 84° and stops has no mass. The keyframes take
 * it past the resting angle, let it come back, and settle — the sequence of a
 * heavy flat thing hitting the ground and rocking once. Most of the rotation
 * happens in the last 40% of the time, which is what gravity looks like: slow
 * tip, then everything at once.
 */
export function startFall(fit: Fit): Handle {
  const reduced = prefersReducedMotion();

  if (reduced) {
    return handleOf(
      fit.sheet.animate([{ transform: 'rotateX(0deg)' }, { transform: `rotateX(${FALL_DEG}deg)` }], {
        duration: 420,
        easing: 'ease-in',
        fill: 'forwards',
      }),
      'fall',
    );
  }

  return handleOf(
    fit.sheet.animate(
      [
        /* The tip. Almost nothing happens, and it takes a third of the time. */
        { transform: 'rotateX(0deg)', offset: 0, easing: 'cubic-bezier(0.7,0,0.9,0.25)' },
        { transform: 'rotateX(9deg)', offset: 0.34, easing: 'cubic-bezier(0.55,0,0.95,0.5)' },
        /* Then gravity. Seventy degrees in a quarter of a second. */
        { transform: `rotateX(${FALL_DEG + 4}deg)`, offset: 0.72, easing: 'cubic-bezier(0.2,0.8,0.4,1)' },
        /* Slam past level, rock back, settle. */
        { transform: `rotateX(${FALL_DEG - 3}deg)`, offset: 0.85, easing: 'ease-in-out' },
        { transform: `rotateX(${FALL_DEG}deg)`, offset: 1 },
      ],
      { duration: FALL_MS, fill: 'forwards' },
    ),
    'fall',
  );
}

/**
 * The reverse, for the exit path.
 *
 * Deliberately quicker than the way in — coming back is not a reveal and does
 * not need to be savoured. Making someone sit through the full cinematic every
 * time they press Escape turns a good effect into an obstacle. It also skips
 * the lurch, because there is nothing to anticipate on the way home.
 */
export function startReturn(fit: Fit): Handle {
  const reduced = prefersReducedMotion();

  /* Standing back up first, then flying in. Reversed order of the way out. */
  fit.sheet.animate([{ transform: `rotateX(${FALL_DEG}deg)` }, { transform: 'rotateX(0deg)' }], {
    duration: reduced ? 220 : 520,
    easing: 'cubic-bezier(0.3,0.9,0.3,1)',
    fill: 'forwards',
  });

  const animation = fit.stage.animate([{ transform: fit.far }, { transform: fit.near }], {
    duration: reduced ? 320 : 1200,
    delay: reduced ? 160 : 380,
    easing: 'cubic-bezier(0.22,0.68,0.18,1)',
    fill: 'forwards',
  });

  return handleOf(animation, 'return');
}

/* ── Small helpers for the keyframe arithmetic ──────────────────────────── */

/** Pulls the scale factor back out of a transform string built above. */
function scaleOf(transform: string): number {
  const m = /scale\(([-\d.]+)\)/.exec(transform);
  return m ? Number(m[1]) : 1;
}

/** Pulls the translateY px value back out of a transform string built above. */
function translateYOf(transform: string): number {
  const m = /translate\(-50%,\s*([-\d.]+)px\)/.exec(transform);
  return m ? Number(m[1]) : 0;
}

/**
 * A transform partway between two of the ones built above.
 *
 * Needed because the recede's middle keyframe has to sit at a specific fraction
 * of the journey rather than at a value picked by eye — if that keyframe drifts
 * away from the straight line between `near` and `far`, the sheet visibly
 * wanders off its path and corrects itself, which reads as a stutter.
 */
function lerpTransform(from: string, to: string, t: number): string {
  const s = scaleOf(from) + (scaleOf(to) - scaleOf(from)) * t;
  const y = translateYOf(from) + (translateYOf(to) - translateYOf(from)) * t;
  return `translate(-50%, ${y}px) scale(${s})`;
}