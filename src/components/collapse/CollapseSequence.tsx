// src/components/collapse/CollapseSequence.tsx
import { useEffect, useRef, useState } from 'react';
import {
  fitPoster,
  prefersReducedMotion,
  startFall,
  startRecede,
  startReturn,
  FALL_MS,
  IMPACT_MS,
  RUMBLE_MS,
  type Fit,
  type Handle,
} from '@/components/collapse/paperRecede';
import { measurePoster, paintPoster } from '@/components/collapse/posterTexture';
import { measureBlueprint, type Blueprint } from '@/components/collapse/blueprint';
import { createCollapseAudio, type CollapseAudio } from '@/components/collapse/collapseAudio';
import type { ContactPrompt } from '@/components/collapse/contactBuildings';
import { preloadMarqueeLogos } from '@/components/core/Marquee';
import type { CollapseWorld } from '@/components/collapse/collapseWorld';
import {
  getCollapsePhase,
  registerCollapseStarter,
  setCollapsePhase,
  setCollapseWorldReady,
  useCollapsePhase,
} from '@/lib/collapseState';

/**
 * The conductor. Owns what happens next, and in what order.
 *
 * ── Why this moved out of the button ──
 *
 * Slice 1 ran the sequence as an async function inside CollapseButton, which
 * was the right shape while every beat was a CSS animation: each `await` was
 * literally the next thing on screen. Slice 2 adds things that are not beats —
 * a chunk that may or may not have downloaded, a WebGL context that has to be
 * created only after another one is gone, a texture being painted in the
 * background — and a way out that has to undo whichever of those actually
 * happened. That is no longer a button's job.
 *
 * ── Why this is not the lazy chunk ──
 *
 * The plan had CollapseSequence as the dynamically imported 3D module. It
 * can't be: the recede has to start on the click frame, before any chunk could
 * possibly have arrived, and something has to be in the page already to start
 * it. So the split is by dependency rather than by name. This file is small,
 * imports no three.js, and ships with Home. `collapseWorld.ts` is everything
 * three.js, and is fetched on click.
 *
 * ── The run object ──
 *
 * Every piece of state belonging to one press of the button lives on one
 * object, and every await is followed by a check of `run.alive`. Escape flips
 * that flag, and the in-flight sequence stops at its next checkpoint instead of
 * advancing into a beat while the exit is playing. A fresh object per run also
 * means a slow chunk from a cancelled run can never deliver its world into the
 * next one.
 */

type Run = {
  alive: boolean;
  audio: CollapseAudio | null;
  exiting: boolean;
  fit: Fit | null;
  handle: Handle | null;
  world: CollapseWorld | null;
  /** True once the quad has replaced the DOM sheet. The exit has to undo it. */
  handedOff: boolean;
};

export function CollapseSequence() {
  const phase = useCollapsePhase();
  const hostRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<Run | null>(null);
  /*
   * Mirrors pointer lock, for the prompt. State rather than a ref because it is
   * the one thing here that changes what is rendered.
   */
  const [locked, setLocked] = useState(false);
  /* What the player is standing next to, if anything — see contactBuildings.ts. */
  const [prompt, setPrompt] = useState<ContactPrompt>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function start() {
    if (runRef.current || getCollapsePhase() !== 'idle') return;
    const run: Run = {
      alive: true,
      exiting: false,
      fit: null,
      handle: null,
      world: null,
      handedOff: false,
      /*
       * Built here, inside the click handler, because a browser will not let an
       * AudioContext start anywhere else. Null if the API is missing, and every
       * call below is optional — the sequence is silent rather than broken.
       */
      audio: createCollapseAudio(),
    };
    runRef.current = run;
    const reduced = prefersReducedMotion();

    /*
     * Collected BEFORE the phase change unmounts GraphJourney, because after it
     * the canvases are out of the document and there is nothing to query. See
     * releaseLiveContexts for what happens to them.
     */
    const liveCanvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('#collapse-live canvas'));

    /*
     * The chunk request starts on the click frame. The recede is three seconds
     * of something to watch that needs no three.js at all, which turns the
     * download from a stall between two beats into free time. The empty catch
     * only stops an unhandled-rejection warning if the run is cancelled before
     * anyone awaits it; bootWorld still sees the failure.
     */
    const chunk = import('@/components/collapse/collapseWorld');
    chunk.catch(() => {});

    /*
     * The marquee icons have to be in memory BEFORE the poster mounts. The
     * poster's marquees are frozen, so they never run their own load; they
     * start from whatever the module cache holds at mount, and a replica with
     * the logos replaced by wordmarks is not a replica. Hovering the button
     * warms this, so in practice it is already done; the cap stops a slow
     * network from turning a click into a pause.
     */
    await Promise.race([preloadMarqueeLogos().catch(() => {}), wait(400)]);
    if (!run.alive) return;

    /* Mounts the poster, unmounts GraphJourney, removes site chrome. */
    setCollapsePhase('recede');

    /*
     * Two frames: one for React to commit the poster, one for layout to settle
     * so `scrollHeight` is the poster's real height. Measuring a frame early
     * frames the sheet slightly wrong for the whole sequence.
     */
    await nextFrame();
    await nextFrame();
    if (!run.alive) return;

    /*
     * And the images. The DiagramStudio screenshot has no intrinsic size in its
     * markup, so until it decodes it is zero pixels tall — and every section
     * below it sits several hundred px higher than it will a moment later. A fit
     * measured then frames the wrong poster, and the texture paints the wrong
     * one. It was loaded by the live page already, so this is a cache hit.
     */
    await Promise.race([decodePosterImages(), wait(600)]);
    await nextFrame();
    if (!run.alive) return;

    releaseLiveContexts(liveCanvases);

    const fit = fitPoster();
    if (!fit) {
      /*
       * Loud on purpose. A missing element means the wrappers in Home.tsx were
       * renamed or removed, and the right outcome is a normal site with a dead
       * button rather than a half-started sequence over a page that never moved.
       */
      console.error('[collapse] viewport / stage / sheet / poster not found — cannot start.');
      runRef.current = null;
      setCollapsePhase('idle');
      return;
    }
    run.fit = fit;

    /*
     * Read the poster's layout NOW, while the stage is at `near` — scale 1, only
     * translated, which cancels out of rects measured relative to the poster.
     * Once the recede starts every rect would come back shrunken and tilted. The glitch flash is
     * covering this frame, so the few milliseconds it costs are unseen.
     */
    const posterLayout = measurePoster(fit.poster);
    /*
     * The city plan, from the same frame and the same origin as the texture —
     * which is what puts every building exactly on its own printed card.
     */
    const blueprint = measureBlueprint(fit.poster);

    fit.stage.style.transform = fit.near;

    const posterCanvas = paintPoster(posterLayout);
    posterCanvas.catch(() => {});
    const worldReady = bootWorld(run, chunk, fit, blueprint, posterCanvas, reduced);

    /* ── Beat one: the retreat ── */
    /* Under the recede: quiet, and growing. Nothing has happened yet. */
    run.audio?.rumble(0.25);
    run.handle = startRecede(fit);
    await run.handle.finished;
    if (!run.alive) return;

    /* ── Beat two: silence, then the first rocks ── */
    setCollapsePhase('rumble');
    run.audio?.rumble(1);
    await wait(RUMBLE_MS);
    if (!run.alive) return;

    /* ── Beat three: the hinge fall and the slam ── */
    setCollapsePhase('quake');
    run.handle = startFall(fit);
    await run.handle.finished;
    if (!run.alive) return;
    /* On the frame it lands, with the dust. */
    run.audio?.slam();

    /*
     * ── The handoff ──
     *
     * The sheet has just come to rest and the dust is at its thickest. The quad
     * is placed to land on exactly the DOM sheet's pixels (see handoff.ts), so
     * in principle the swap needs no cover at all — the dust is there as the
     * fallback the plan asked for, hiding any sub-pixel disagreement between
     * the browser's text rasteriser and the texture's.
     *
     * Bounded wait, not an open-ended one. The chunk has had four and a half
     * seconds and is almost certainly here; if it isn't, the sequence does not
     * stall on the ground waiting for it — the DOM sheet simply stays, which is
     * exactly the slice-1 ending.
     */
    const world = await Promise.race([worldReady, wait(1200).then(() => null)]);
    if (!run.alive) return;

    if (world?.handoff()) {
      fit.stage.style.visibility = 'hidden';
      run.handedOff = true;
    }

    /*
     * Held past the fall so the dust and the shake can finish. The phase stays
     * at `quake` because the impact is still resolving on screen — advancing
     * now would cut the shake off at the exact moment it is doing its job.
     */
    await wait(IMPACT_MS - FALL_MS + 400);
    if (!run.alive || !run.handedOff || !world) return;

    /* ── Beat four: down to eye height ── */
    setCollapsePhase('settle');
    await world.settle();
    if (!run.alive) return;

    /*
     * ── Beat five: the second rumble, and the city rises ──
     *
     * In page order: the first project card — furthest away, up toward the hero
     * end — breaks the surface first, and the wave rolls toward the player until
     * the nearest building stands up in front of them. The tremor is CSS on the
     * world layer, keyed off this phase, exactly as the first quake is.
     */
    setCollapsePhase('rise');
    /* Roughly as long as the staggered rise takes; it fades itself out. */
    run.audio?.grind(6);
    await world.rise();
    if (!run.alive) return;

    /*
     * ── Beat six: the reveal ──
     *
     * The camera climbs until the whole monument is in frame, holds on the name
     * the city is built around, and comes back down to eye height at the near
     * end. Skipped entirely under reduced motion, which is what that setting
     * asks for: it is a long, steep camera move over a city.
     */
    setCollapsePhase('reveal');
    await world.reveal();
    if (!run.alive) return;

    /*
     * ── Beat seven: the player takes over ──
     *
     * Eye height, level, standing off the Contact end of the fallen page and
     * looking up its length at the hero — which is where the monument will
     * stand, so it is seen at a distance first, across the whole city. (Decided
     * with the owner after slice 2.)
     *
     * Pointer lock arrives at REVEAL → EXPLORE, exactly where the plan puts it:
     * never during a cutscene the player cannot act in.
     */
    setCollapsePhase('explore');
    /* Open ground, and nothing else out there. */
    run.audio?.wind(true);
    world.explore(setLocked);
    world.onPrompt(setPrompt);
  }

  /**
   * Creates the world, strictly after the old context is gone.
   *
   * Resolves to null rather than rejecting on any failure — no WebGL, chunk
   * failed, run cancelled — because every one of those has the same correct
   * outcome: keep playing the CSS sequence as if slice 2 did not exist.
   */
  async function bootWorld(
    run: Run,
    chunk: Promise<typeof import('@/components/collapse/collapseWorld')>,
    fit: Fit,
    blueprint: Blueprint,
    posterCanvas: Promise<HTMLCanvasElement>,
    reduced: boolean,
  ): Promise<CollapseWorld | null> {
    try {
      const { createCollapseWorld } = await chunk;
      /* Checked immediately before creation, in the same task. Nothing can slip in between. */
      if (!run.alive || !hostRef.current) return null;

      const world = createCollapseWorld(hostRef.current, fit.geometry, { reducedMotion: reduced, blueprint });
      run.world = world;

      await world.firstFrame;
      if (!run.alive) return null;
      /*
       * Only now does the canvas fade in. A canvas faded in before its first
       * frame is a black rectangle fading in over the placeholder stars.
       */
      await nextFrame();
      if (!run.alive) return null;
      setCollapseWorldReady(true);

      world.setPoster(await posterCanvas);
      if (!run.alive) return null;
      return world;
    } catch (err) {
      console.warn('[collapse] 3D world unavailable — continuing with the CSS sequence.', err);
      return null;
    }
  }

  /**
   * Escape.
   *
   * Reverses whatever actually happened, in the opposite order it happened in:
   * camera back up to the swap pose, quad back to DOM sheet, sheet stands up and
   * flies home while the world fades, world destroyed, THEN idle. That last
   * ordering is Risk 1 in reverse — idle remounts GraphJourney and its context,
   * so this one has to be gone first.
   */
  async function exit() {
    const run = runRef.current;
    if (!run || run.exiting) return;
    run.exiting = true;
    run.alive = false;
    run.handle?.cancel();
    run.handle = null;

    const fit = run.fit;
    if (!fit) {
      run.world?.dispose();
      runRef.current = null;
      setCollapsePhase('idle');
      return;
    }

    setCollapsePhase('exit');
    setLocked(false);
    setPrompt(null);
    setToast(null);
    run.audio?.dispose();
    run.audio = null;

    if (run.world && run.handedOff) {
      /*
       * Fly back BEFORE swapping back. The DOM sheet can only be shown again at
       * the one camera pose where the quad and the sheet coincide; swapping at
       * eye height would pop a tiny tilted poster into the middle of the sky.
       */
      await run.world.returnToHandoff();
      run.world.hideSheet();
      fit.stage.style.visibility = '';
    }

    /* The canvas fades out while the sheet stands up; the placeholder stars fade back in under it. */
    setCollapseWorldReady(false);

    /*
     * Fly back before releasing, not after. The return animation only has a
     * sheet to animate while the stage is still pinned and transformed.
     */
    const back = startReturn(fit);
    await back.finished;

    run.world?.dispose();
    run.world = null;
    runRef.current = null;

    /*
     * Phase first, release second. Clearing the phase removes
     * `.collapse-active`, which unpins the stage and restores document height —
     * and `release` ends by scrolling back to the saved offset on the next
     * frame, which only works once that height exists again.
     */
    setCollapsePhase('idle');
    fit.release();
  }

  /*
   * Registered once. `start` and `exit` close over refs only, never over render
   * state, so the first render's copies stay correct for the component's life.
   */
  useEffect(() => registerCollapseStarter(() => void start()), []);

  /*
   * E activates whatever the player is standing next to. One key, one verb: the
   * world has walking and this, and nothing else to learn.
   */
  useEffect(() => {
    if (phase !== 'explore') return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'e' && e.key !== 'E') return;
      const line = runRef.current?.world?.activateNearby();
      if (!line) return;
      setToast(line);
      window.setTimeout(() => setToast((t) => (t === line ? null : t)), 2600);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  useEffect(() => {
    if (phase === 'idle') return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      /*
       * Escape is two things in explore: release the mouse, then leave. The world
       * decides which this press was, because only it knows whether the mouse
       * was locked a moment ago. Before explore there is no lock and this is
       * always true.
       */
      const world = runRef.current?.world;
      if (world && !world.escapeShouldExit()) return;
      void exit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  /* A run must not outlive the component that started it. */
  useEffect(
    () => () => {
      const run = runRef.current;
      if (!run) return;
      run.alive = false;
      run.handle?.cancel();
      run.audio?.dispose();
      run.world?.dispose();
      runRef.current = null;
      /* Same order as the exit, for the same reason: phase, then release. */
      if (getCollapsePhase() !== 'idle') setCollapsePhase('idle');
      run.fit?.release();
    },
    [],
  );

  /*
   * Always rendered, empty until a world attaches its canvas. It sits OUTSIDE
   * #collapse-viewport on purpose — see `#collapse-world` in collapse.css for
   * why a canvas inside the viewport's 3D rendering context would be
   * depth-sorted in front of the fallen sheet.
   */
  return (
    <>
      <div id="collapse-world" ref={hostRef} aria-hidden="true" />
      {phase === 'explore' && locked && prompt && (
        <div className="collapse-hud collapse-hud--prompt" aria-live="polite">
          <kbd>E</kbd> {prompt.action === 'open' ? 'open' : 'copy'} {prompt.label}
        </div>
      )}
      {toast && (
        <div className="collapse-hud collapse-hud--toast" aria-live="polite">
          {toast}
        </div>
      )}
      {phase === 'explore' && !locked && (
        /*
         * The whole screen is the button, not just the card. The instruction is
         * "click to walk", and a visitor who clicks the sky beside a small card
         * and gets nothing has been lied to.
         *
         * Shown whenever the mouse is free in explore: on arrival, and again
         * after every Escape — which is when "Esc again to leave" is the most
         * useful thing on screen.
         */
        <button
          type="button"
          className="collapse-walk-prompt"
          onClick={() => runRef.current?.world?.lock()}
          aria-label="Click to walk. W A S D to move, Shift to sprint, E to use what you are standing near, Escape to leave."
        >
          <span className="collapse-walk-prompt__card">
            <span className="collapse-walk-prompt__title">Click to walk</span>
            <span className="collapse-walk-prompt__keys">
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> move · <kbd>Shift</kbd> sprint · <kbd>E</kbd> use · <kbd>Esc</kbd> leave
            </span>
          </span>
        </button>
      )}
    </>
  );
}

/**
 * Releases GraphJourney's WebGL context now rather than whenever GC gets to it.
 *
 * Unmounting GraphJourney runs 3d-force-graph's destructor, which calls
 * `renderer.dispose()` — and dispose frees buffers and textures but NOT the
 * context. The canvas, detached, keeps its context alive until it is
 * collected, which can be many seconds. That is precisely the "two live
 * contexts" window Risk 1 is about, landing exactly when the world creates its
 * own.
 *
 * `getContext` with the type a canvas was created with returns the existing
 * context rather than a new one, and null for any other type, so asking for
 * webgl2 then webgl is safe on canvases that turn out to be 2D.
 */
function releaseLiveContexts(canvases: HTMLCanvasElement[]) {
  for (const c of canvases) {
    if (c.isConnected) continue; // still mounted: not ours to kill
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Resolves when every image in the poster has decoded, or failed to. */
function decodePosterImages(): Promise<void> {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#collapse-poster img'));
  return Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(() => undefined);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}