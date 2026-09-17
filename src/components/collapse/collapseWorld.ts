// src/components/collapse/collapseWorld.ts
import * as THREE from 'three';
import { createPlayerController, type PlayerController } from '@/components/game/player';
import { createEnvironment, GROUND_FOG_DENSITY, MOON_DIR } from '@/components/collapse/environment';
import { createBuildings } from '@/components/collapse/buildings';
import type { Blueprint } from '@/components/collapse/blueprint';
import {
  applyPose,
  eyePose,
  focalForFov,
  handoffPose,
  lerpPose,
  PLAYER_FOV_DEG,
  metresPerPx,
  readPose,
  type Pose,
  type SheetGeometry,
} from '@/components/collapse/handoff';
import { POSTER_TEXTURE_PAD } from '@/components/collapse/posterTexture';

/**
 * The 3D half of the collapse: everything that needs three.js.
 *
 * This is the module the conductor imports dynamically on the click frame, so
 * it — and three.js with it — downloads during the recede rather than being in
 * the home page's bundle. It knows nothing about phases or React. It is handed a
 * host element and the sheet's geometry, and exposes the handful of verbs the
 * conductor needs: take the sheet, settle, go back, go away.
 *
 * ── Why the scene is rendered with two cameras ──
 *
 * At the swap the camera has to be extremely wide — typically 135–145° vertical
 * — for the true-proportioned poster to land on the DOM sheet's pixels (see
 * handoff.ts for why). A dark, featureless ground does not care. The sky does:
 * `Sky` draws stars as cells in DIRECTION space, and a 140° lens squeezes each
 * cell to a fraction of a pixel in the middle of the screen and smears them at
 * the edges. The starfield would visibly change density at the swap.
 *
 * So the sky gets its own camera, always at the player's 72°. It shares the
 * main camera's principal point, and its pitch is solved each frame so the
 * HORIZON lands on the same screen row:
 *
 *     horizon row = cy − f · tan(pitch)      ⇒     pitch_sky = atan(f · tan(pitch) / f_sky)
 *
 * The ground-meets-sky line is the only place the two could be seen to
 * disagree, and this pins it. As the settle narrows the main lens to 72°, the
 * two cameras converge until they are the same camera.
 *
 * ── Who drives the camera ──
 *
 * Exactly one thing per frame. During the swap and the settle it is the pose
 * tween. In explore it is the player controller from `game/player.ts`, which
 * writes the camera's position and PointerLockControls its rotation — and the
 * frame then reads that back into the same `Pose` the tweens use (`readPose`).
 * Everything downstream — the sky camera, the off-centre projection, the ground
 * following, the fog — only ever looks at the pose, so it cannot tell or care
 * which of the two produced it. That is also what makes Escape trivial: the
 * flight home is a tween that starts from whatever the player left behind.
 */

/** Far plane for the world camera, metres. */
const FAR = 45000;

/** How long the camera takes to come down to eye height. */
const SETTLE_MS = 2800;

/** The reverse, for Escape. Quick for the same reason the DOM return is. */
const RETURN_MS = 900;

/**
 * How long after pointer lock is released an Escape still counts as "that was
 * the Escape that released it".
 *
 * Browsers consume the Escape that exits pointer lock, but not identically:
 * some deliver the keydown to the page as well, in the same tick as the unlock.
 * Without this window, one press would both free the mouse and demolish the
 * world — and the first thing anyone does in a pointer-locked scene is press
 * Escape to get their cursor back.
 */
const UNLOCK_GRACE_MS = 300;

/**
 * Longest frame the controller is allowed to simulate.
 *
 * rAF stops while the tab is hidden, so the first frame back can report a dt of
 * minutes. The controller substeps, but only up to 8 steps — a long enough dt
 * still moves the body far enough in one go to fall through the ground.
 */
const MAX_DT = 1 / 20;

export type CollapseWorld = {
  /** Resolves after the first frame is on screen — safe to fade the canvas in. */
  firstFrame: Promise<void>;
  /** Hands over the painted poster. Until this is called `handoff` refuses. */
  setPoster: (canvas: HTMLCanvasElement) => void;
  /** Shows the quad in place of the DOM sheet. False if there is nothing to show. */
  handoff: () => boolean;
  /** Camera down to eye height. Resolves when it lands, or when cancelled. */
  settle: () => Promise<void>;
  /** The project buildings rise out of the sheet, in page order. Resolves when the last lands. */
  rise: () => Promise<void>;
  /** Camera back to the swap pose, so the DOM sheet can take over again exactly. */
  returnToHandoff: () => Promise<void>;
  /** Hides the quad. Called right as the DOM sheet is shown again. */
  hideSheet: () => void;
  /**
   * Hands the camera to the player controller, standing where the settle left
   * it. Pointer lock is NOT requested here — see `lock`.
   */
  explore: (onLockChange: (locked: boolean) => void) => void;
  /**
   * Requests pointer lock. Must be called from inside a user gesture.
   *
   * Which is why explore does not do it: by the time the settle lands, the click
   * on the warning button is nine seconds old, and browsers only honour
   * `requestPointerLock` for a few seconds after real input. The conductor shows
   * a "click to walk" prompt, and that click is the gesture.
   */
  lock: () => void;
  /** False while the mouse is locked, or for a moment after it was just released. */
  escapeShouldExit: () => boolean;
  dispose: () => void;
};

type Tween = {
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
  resolve: () => void;
};

export function createCollapseWorld(
  host: HTMLElement,
  geometry: SheetGeometry,
  options: { reducedMotion: boolean; blueprint: Blueprint },
): CollapseWorld {
  /*
   * This constructor throws if WebGL is unavailable. That is left to propagate
   * on purpose: the conductor catches it and carries on with the CSS-only
   * sequence, which is a complete (if flatter) experience. A world half-built
   * around a missing context is not.
   */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /*
   * No tone mapping. The poster quad must reproduce the DOM sheet's colours
   * exactly, and a tone curve would shift every value on it at the swap.
   */
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  /* The buildings clip themselves at the ground plane as they rise — see buildings.ts. */
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 1);

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  renderer.setSize(vw, vh);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const skyCamera = new THREE.PerspectiveCamera();
  const env = createEnvironment(scene);

  /* ── The poster quad ── */

  const pad = POSTER_TEXTURE_PAD;
  const k = metresPerPx(geometry);
  const quadW = (geometry.sheetW + pad * 2) * k;
  const quadH = (geometry.sheetH + pad * 2) * k;
  const quadMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    /*
     * Fog on. At the swap scene fog is exactly zero, so this changes nothing
     * about the match; from the settle onward it is what lets the far end of
     * the page run away into the dark instead of stopping at an edge.
     */
    fog: true,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMat);
  quad.rotation.x = -Math.PI / 2;
  quad.scale.set(quadW, quadH, 1);
  /*
   * Centred on the sheet, including the padding: the hinge (the poster's bottom
   * edge) is at z = 0, so the padded quad spans from +pad to −(H + pad).
   */
  quad.position.set(0, 0, -(geometry.sheetH * k) / 2);
  quad.visible = false;
  quad.name = 'collapse-poster';
  scene.add(quad);

  /* ── The city ── */

  /*
   * Lit by the moon and the sky, and by nothing else. These lights only touch
   * the buildings: the poster quad is unlit (MeshBasicMaterial) so it keeps
   * matching the DOM sheet, and the sky and ground are their own shaders.
   *
   * The directional light comes FROM the moon's direction, so the faces turned
   * toward the moon in the sky are the lit ones — the one lighting cue a night
   * scene has, and the one that is instantly wrong if it disagrees.
   */
  const hemi = new THREE.HemisphereLight(0x5a66a8, 0x07080c, 1.4);
  const moonLight = new THREE.DirectionalLight(0xc6d0ff, 1.8);
  moonLight.position.copy(MOON_DIR).multiplyScalar(100);
  scene.add(hemi, moonLight);

  const buildings = createBuildings(scene, options.blueprint, k, geometry.sheetW, geometry.sheetH);

  /* ── Camera state ── */

  const swapPose = handoffPose(geometry);
  const current: Pose = { ...swapPose };
  let tween: Tween | null = null;
  let hasPoster = false;

  /* ── Explore state ── */

  let player: PlayerController | null = null;
  let locked = false;
  let unlockedAt = -Infinity;
  let lockListener: ((locked: boolean) => void) | null = null;
  const onLock = () => {
    locked = true;
    lockListener?.(true);
  };
  const onUnlock = () => {
    locked = false;
    unlockedAt = performance.now();
    lockListener?.(false);
  };

  function stopExplore() {
    if (!player) return;
    player.controls.removeEventListener('lock', onLock);
    player.controls.removeEventListener('unlock', onUnlock);
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    player.controls.dispose();
    player.dispose();
    player = null;
    locked = false;
    lockListener = null;
  }

  function startTween(to: Pose, duration: number): Promise<void> {
    /* A tween replaced mid-flight resolves, so nobody awaiting it is left hanging. */
    tween?.resolve();
    return new Promise((resolve) => {
      if (duration <= 0) {
        Object.assign(current, to);
        tween = null;
        resolve();
        return;
      }
      tween = { from: { ...current }, to, start: performance.now(), duration, resolve };
    });
  }

  /* ── Frame loop ── */

  let raf = 0;
  let disposed = false;
  const clockStart = performance.now();
  let lastNow = clockStart;
  let resolveFirst: () => void = () => {};
  const firstFrame = new Promise<void>((r) => (resolveFirst = r));
  const skyFocal = () => focalForFov(PLAYER_FOV_DEG, vh);

  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(MAX_DT, (now - lastNow) / 1000);
    lastNow = now;

    if (player && !tween) {
      /*
       * Simulated only while locked. Unlocked, the mouse is free and the prompt
       * is up; keys still reach the controller's window listeners, and letting
       * WASD walk the body while the visitor is reading an overlay about how to
       * start walking would be a strange thing to discover.
       */
      if (locked) player.update(dt);
      readPose(camera, current);
      /* Follows the window, so the lens stays 72° through a resize. */
      current.focal = focalForFov(PLAYER_FOV_DEG, vh);
    }

    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.duration);
      lerpPose(tween.from, tween.to, easeInOutCubic(t), current);
      if (t >= 1) {
        const done = tween;
        tween = null;
        done.resolve();
      }
    }

    applyPose(camera, current, vw, vh, FAR);
    const fs = skyFocal();
    /*
     * When the two lenses are already the same — all of explore — the horizon
     * formula is the identity, and skipping it keeps looking straight up or down
     * from running tan() into its asymptote.
     */
    const sameLens = Math.abs(current.focal - fs) < 1e-3;
    applyPose(
      skyCamera,
      { ...current, focal: fs, near: 0.05 },
      vw,
      vh,
      10,
      sameLens ? undefined : Math.atan((current.focal * Math.tan(current.pitch)) / fs),
    );

    buildings.update(now);
    env.update(camera, skyCamera, current.fog, (now - clockStart) / 1000);

    renderer.clear();
    renderer.render(env.skyScene, skyCamera);
    renderer.render(scene, camera);

    resolveFirst();
  }
  /*
   * Compile every shader now, during the recede, while nobody is looking at the
   * world yet — rather than on the first frame each material is drawn.
   */
  applyPose(camera, current, vw, vh, FAR);
  renderer.compile(scene, camera);

  raf = requestAnimationFrame(frame);

  /*
   * Resize keeps focal length in px and re-derives the principal point from the
   * new viewport. That is what the DOM does too: the sheet's transforms are
   * fixed px, while `left: 50%` and `perspective-origin: 50% 42%` follow the
   * window. It is not a perfect match after a resize mid-sequence — neither is
   * the DOM's own framing — but the two stay in agreement with each other.
   */
  function onResize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    renderer.setSize(vw, vh);
  }
  window.addEventListener('resize', onResize);

  return {
    firstFrame,

    setPoster(canvas) {
      if (disposed) return;
      const max = renderer.capabilities.maxTextureSize;
      const source = canvas.width > max || canvas.height > max ? downsample(canvas, max) : canvas;

      const tex = new THREE.CanvasTexture(source);
      tex.colorSpace = THREE.SRGBColorSpace;
      /*
       * Maximum anisotropy is not a nicety here. From eye height the poster is
       * seen at a few degrees off grazing, which is the exact case plain
       * trilinear filtering handles worst: without it everything past the first
       * ten metres of the sheet dissolves into a grey smear.
       */
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;

      quadMat.map?.dispose();
      quadMat.map = tex;
      quadMat.needsUpdate = true;
      hasPoster = true;

      /*
       * Upload now, while the quad is still hidden and the sheet is still
       * receding — not on the first frame it is visible. An 8K texture upload
       * plus mipmap generation is a visible hitch, and the frame it would
       * otherwise land on is the slam.
       */
      renderer.initTexture(tex);
    },

    handoff() {
      if (disposed || !hasPoster) return false;
      /* Snap to the swap pose in case anything nudged it. It should already be there. */
      Object.assign(current, swapPose);
      tween?.resolve();
      tween = null;
      quad.visible = true;
      return true;
    },

    settle() {
      if (disposed) return Promise.resolve();
      /*
       * Reduced motion arrives at eye height without the flight. The camera move
       * is a large, fast change of height and lens at once — precisely the kind
       * of motion that setting exists to avoid.
       */
      return startTween(eyePose(vh, GROUND_FOG_DENSITY), options.reducedMotion ? 0 : SETTLE_MS);
    },

    rise() {
      if (disposed) return Promise.resolve();
      return buildings.rise(options.reducedMotion);
    },

    returnToHandoff() {
      if (disposed) return Promise.resolve();
      /*
       * The city goes back under the sheet while the camera flies up. It has to
       * be gone before the DOM sheet is shown again: the sheet is flat paper,
       * and buildings standing on the quad at the swap would vanish in one frame.
       * The sink is shorter than the flight, so it always finishes first.
       */
      void buildings.sink();
      /*
       * The controller goes first. Left running, it would keep writing the
       * camera underneath the tween — and the current pose is taken from the
       * camera one last time here so the flight starts exactly where the
       * player was standing and facing.
       */
      if (player) {
        stopExplore();
        readPose(camera, current);
      }
      return startTween(swapPose, options.reducedMotion ? 0 : RETURN_MS);
    },

    hideSheet() {
      quad.visible = false;
    },

    explore(onLockChange) {
      if (disposed || player) return;
      tween?.resolve();
      tween = null;
      lockListener = onLockChange;

      /*
       * Camera orientation is already set from the last applied pose, and
       * PointerLockControls reads the camera's existing rotation on its first
       * mouse move — so control starts from exactly the view the settle ended
       * on, not from a default heading.
       */
      applyPose(camera, current, vw, vh, FAR);

      player = createPlayerController(
        camera,
        renderer.domElement,
        /*
         * Solid below the ground plane, and inside the buildings.
         *
         * The controller is voxel-based: it calls this with INTEGER cell
         * coordinates and snaps the body to whole-metre faces. The buildings
         * are generated on the metre grid for exactly that reason (see
         * buildings.ts), so the walls you hit are the walls you see.
         */
        (x, y, z) => y < 0 || buildings.solidAt(x, y, z),
        0,
        new THREE.Vector3(current.x, 0, current.z),
        /* No water in this world. */
        -Infinity,
        { sword: false, torch: false, avatar: false, bounded: false },
      );
      player.controls.addEventListener('lock', onLock);
      player.controls.addEventListener('unlock', onUnlock);
    },

    lock() {
      if (!player || locked) return;
      /*
       * Straight to the element rather than `controls.lock()`, to catch the
       * promise. Chrome refuses a re-lock within about a second of an
       * Escape-release, and rejects rather than throwing — through the controls
       * that rejection surfaces as an uncaught error in the console on a click
       * that did nothing wrong. PointerLockControls still sees the lock: it
       * listens for `pointerlockchange` on the document, not for its own call.
       */
      const result = renderer.domElement.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => {});
    },

    escapeShouldExit() {
      if (locked) return false;
      return performance.now() - unlockedAt > UNLOCK_GRACE_MS;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopExplore();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      tween?.resolve();
      tween = null;
      resolveFirst();

      buildings.dispose();
      scene.remove(hemi, moonLight);
      env.dispose();
      quad.geometry.dispose();
      quadMat.map?.dispose();
      quadMat.dispose();
      renderer.dispose();
      /*
       * `dispose()` frees GL resources but leaves the context itself alive until
       * garbage collection gets round to the canvas, which can be a long time.
       * The whole premise of the handover's Risk 1 is never having two live
       * contexts, and GraphJourney mounts its own again the moment this returns
       * to idle — so the context is released explicitly, now.
       */
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Fits a canvas inside a texture-size limit, keeping its aspect ratio. */
function downsample(src: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const k = Math.min(max / src.width, max / src.height);
  const out = document.createElement('canvas');
  out.width = Math.floor(src.width * k);
  out.height = Math.floor(src.height * k);
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  return out;
}