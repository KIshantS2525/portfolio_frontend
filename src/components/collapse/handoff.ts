// src/components/collapse/handoff.ts
import * as THREE from 'three';

/**
 * The arithmetic that lets a DOM sheet and a WebGL quad be the same object.
 *
 * At the moment of impact the fallen poster stops being HTML and becomes a
 * textured quad lying on the WebGL ground. For that swap to be invisible, the
 * quad has to land on EXACTLY the pixels the browser was drawing the DOM sheet
 * on. Everything in this file exists to produce a camera that makes that true.
 *
 * ── The trap this file is built around ──
 *
 * The obvious approach is to recreate the CSS scene literally: a camera 1500
 * units in front of the screen plane (that is what `perspective: 1500px`
 * means), the sheet scaled by `farScale`, rotated 84° about its bottom edge.
 * It matches, and it is wrong for everything that comes after, because of one
 * detail of CSS transforms:
 *
 *   `scale(s)` is `scale3d(s, s, 1)`. It does NOT scale depth.
 *
 * The stage's scale is applied after the sheet's rotateX, so once the sheet
 * tips, its length stops being scaled — it runs ~H·sin(84°) px into the
 * screen while its width stays at 1280·s. At a typical `s` of 0.07 the fallen
 * sheet is, in literal CSS space, a strip about 90px wide and several thousand
 * px long. The browser renders that correctly (it is what the owner has been
 * looking at, and it looks right, because at a grazing angle nobody can tell),
 * but a world built on it would have a poster 14 times longer than it is wide.
 * The city in slice 5 rises out of that poster at the poster's proportions.
 *
 * ── The way out ──
 *
 * A planar rectangle whose edges are parallel to the screen's x axis can be
 * reproduced on screen by more than one 3D rectangle, if the camera's focal
 * length is allowed to change with it. Solving for "the rectangle with the
 * poster's TRUE proportions, and whatever camera draws it on the same pixels"
 * gives a result clean enough to be worth writing down:
 *
 *   · the camera sits `perspective` poster-px back from the hinge line
 *   · its focal length, in screen px, is `perspective × farScale`
 *   · it looks down by exactly (90° − FALL_DEG), with no roll or yaw
 *   · the sheet is W × H poster-px lying flat on the ground
 *
 * i.e. exactly the scene you would get if CSS DID scale depth, which is
 * obvious in hindsight and took the full derivation to trust. The check is at
 * the bottom of the derivation below: project the four corners both ways and
 * they agree to floating-point error.
 *
 * The cost is a very wide focal length at the swap — often 150°+ vertical. The
 * ground is dark and featureless and the stars are drawn with their own camera
 * (see collapseWorld.ts), so nothing on screen shows the distortion, and the
 * settle beat eases it down to the player's 72° while the dust is still up.
 */

/**
 * How wide the fallen poster is in the world, in metres.
 *
 * The poster is laid out at the visitor's viewport width (it is a replica of
 * the page — see `fitPoster`), so a fixed metres-per-pixel would make the city
 * 50% bigger for someone on a 1920px screen than on a 1280px one. The world is
 * sized from this instead, and px convert through `metresPerPx`. A uniform
 * scale of the whole scene changes nothing about the handoff's projection, so
 * the swap is still exact at any width.
 *
 * 64m: a project card becomes a footprint you can walk around in a few seconds.
 * First guess; slice 5 tunes it against actual walking, and it is one edit.
 */
export const WORLD_WIDTH_M = 64;

/** World metres per poster px, for a given sheet. */
export function metresPerPx(g: Pick<SheetGeometry, 'sheetW'>): number {
  return WORLD_WIDTH_M / g.sheetW;
}

/** Matches EYE in game/player.ts, so the slice-4 handover to the controller is not a jump. */
export const EYE_HEIGHT_M = 1.62;

/** Matches the /game camera, for the same reason. */
export const PLAYER_FOV_DEG = 72;

/** Everything the CSS scene was doing at the moment of impact, as plain numbers. */
export type SheetGeometry = {
  /** Viewport size the fit was computed against. */
  vw: number;
  vh: number;
  /** Sheet size in poster px (untransformed). */
  sheetW: number;
  sheetH: number;
  /** `farScale` — the stage's final scale. */
  scale: number;
  /** `farY` — the stage's final translateY in screen px. */
  top: number;
  /** `perspective` on #collapse-viewport, in px. */
  perspective: number;
  /** `perspective-origin` y, as a fraction of the viewport height. */
  originYFrac: number;
  /** The sheet's final rotateX, in degrees. */
  fallDeg: number;
};

/**
 * A camera, described the way this sequence needs to animate it.
 *
 * Pitch and yaw as two angles, never roll, never a quaternion. From the swap to
 * the end of the settle yaw is zero — every pose looks straight down the
 * poster's long axis. Yaw exists for slice 4: once the player has turned
 * around and presses Escape, the flight back to the swap pose has to unwind
 * that turn, and two angles interpolate along the obvious path where slerping
 * two arbitrary quaternions can take a strange one. No roll, ever, because the
 * sky camera's horizon-matching (collapseWorld.ts) is only valid without it.
 *
 * Focal length is in screen px and the principal point is a fraction of the
 * viewport — the two things a CSS perspective actually has, and the two things
 * THREE.PerspectiveCamera's `fov` + centred frustum cannot express.
 */
export type Pose = {
  x: number;
  y: number;
  z: number;
  /** Radians. Negative looks down. */
  pitch: number;
  /** Radians about world y. Zero looks down −z, toward the hero end of the poster. */
  yaw: number;
  /** Vertical focal length, screen px. */
  focal: number;
  /** Principal point, as fractions of the viewport. */
  cx: number;
  cy: number;
  near: number;
  /** Scene fog density for this pose. Zero at the swap — CSS has no fog. */
  fog: number;
};

/**
 * The camera that draws a true-proportioned poster on the exact pixels the
 * fallen DOM sheet occupies.
 *
 * World frame: y up, ground at y = 0, the sheet's hinge (its bottom edge on the
 * poster) along the x axis at z = 0, the sheet extending away from the camera
 * toward −z. So the poster's TOP — the hero — is the far end.
 *
 * ── Derivation, in poster px ──
 *
 * CSS screen space: x right, y down, z toward the viewer, eye at
 * (ox, oy, perspective). The hinge line never leaves z = 0, so it projects to
 * itself: its screen y is `top + scale·H`.
 *
 * In camera coordinates (y up, looking down −z), put the hinge centre at
 * (xN, −yN, −f) with
 *
 *     xN = (vw/2 − ox) / scale
 *     yN = (top + scale·H − oy) / scale
 *
 * Dividing by `scale` is what converts screen px at depth f into poster px at
 * depth f under a focal length of f·scale — the substitution that makes the
 * sheet its real size. A world point p maps to camera space as R·p + N, with
 * R's columns being where the world axes land:
 *
 *     world x → (1, 0, 0)
 *     world y → (0, sin θ, cos θ)
 *     world z → (0, −cos θ, sin θ)
 *
 * which is a pure pitch of −(90° − θ). The camera's world position is −Rᵀ·N,
 * worked out component-wise below rather than through a matrix inverse, so
 * there is nothing to go numerically soft on.
 */
export function handoffPose(g: SheetGeometry): Pose {
  const s = g.scale;
  const f = g.perspective;
  const theta = THREE.MathUtils.degToRad(g.fallDeg);
  const ox = g.vw / 2;
  const oy = g.vh * g.originYFrac;

  const xN = (g.vw / 2 - ox) / s;
  const yN = (g.top + s * g.sheetH - oy) / s;

  const sin = Math.sin(theta);
  const cos = Math.cos(theta);

  /* −Rᵀ·N, where N = (xN, −yN, −f). */
  const px = -xN;
  const py = sin * yN + cos * f;
  const pz = -cos * yN + sin * f;

  const k = metresPerPx(g);
  return {
    x: px * k,
    y: py * k,
    z: pz * k,
    pitch: -(Math.PI / 2 - theta),
    yaw: 0,
    focal: f * s,
    cx: 0.5,
    cy: g.originYFrac,
    /*
     * Generous near plane at the swap. The camera is hundreds of metres up and
     * nothing is close, so a big near value costs nothing and buys depth
     * precision where the quad meets the ground.
     */
    near: 0.5,
    fog: 0,
  };
}

/**
 * Where the settle lands: standing just off the poster's hinge edge, eye height,
 * looking level down its length.
 *
 * 1.5m back from the edge rather than on it, so the first thing in the lower
 * frame is ground and then the sheet's edge — a threshold you are standing at,
 * rather than a surface already under your feet.
 */
export function eyePose(vh: number, fogDensity: number): Pose {
  return {
    x: 0,
    y: EYE_HEIGHT_M,
    z: 1.5,
    pitch: 0,
    yaw: 0,
    focal: focalForFov(PLAYER_FOV_DEG, vh),
    cx: 0.5,
    cy: 0.5,
    near: 0.05,
    fog: fogDensity,
  };
}

/**
 * Reads a camera's position and orientation back into a pose.
 *
 * Used while the player controller is driving: it writes the camera, and this
 * turns what it wrote into the same description the tweens and the sky camera
 * use — so there is only ever one source of truth for the frame, whoever
 * produced it.
 */
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
export function readPose(camera: THREE.Camera, into: Pose): Pose {
  _euler.setFromQuaternion(camera.quaternion, 'YXZ');
  into.x = camera.position.x;
  into.y = camera.position.y;
  into.z = camera.position.z;
  into.pitch = _euler.x;
  into.yaw = _euler.y;
  return into;
}

/** Vertical focal length in px for a vertical field of view, at a viewport height. */
export function focalForFov(fovDeg: number, vh: number): number {
  return vh / 2 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
}

/**
 * Blend two poses.
 *
 * Focal length and near plane interpolate in LOG space. Both span more than an
 * order of magnitude across the settle, and a linear blend spends almost the
 * whole move near the wide end and then snaps to narrow in the last few frames
 * — which reads as a zoom that suddenly lurches. In log space the field of view
 * changes at a perceptually even rate.
 */
export function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  const l = (p: number, q: number) => p + (q - p) * t;
  const g = (p: number, q: number) => Math.exp(Math.log(p) + (Math.log(q) - Math.log(p)) * t);
  out.x = l(a.x, b.x);
  out.y = l(a.y, b.y);
  out.z = l(a.z, b.z);
  out.pitch = l(a.pitch, b.pitch);
  /*
   * Yaw the short way round. A player who has turned 350° to the left is 10°
   * from home, and a naive lerp would spin them nearly a full circle on the
   * way back.
   */
  const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  out.yaw = a.yaw + dy * t;
  out.focal = g(a.focal, b.focal);
  out.cx = l(a.cx, b.cx);
  out.cy = l(a.cy, b.cy);
  out.near = g(a.near, b.near);
  out.fog = l(a.fog, b.fog);
  return out;
}

/**
 * Puts a pose onto a camera, including the off-centre frustum.
 *
 * `updateProjectionMatrix()` is never called on these cameras — it would
 * rebuild a centred frustum from `fov` and throw the principal point away.
 * The projection is written directly instead, and its inverse with it,
 * because raycasting and frustum culling both read the inverse.
 */
export function applyPose(
  camera: THREE.PerspectiveCamera,
  pose: Pose,
  vw: number,
  vh: number,
  far: number,
  pitchOverride?: number,
): void {
  camera.position.set(pose.x, pose.y, pose.z);
  camera.rotation.set(pitchOverride ?? pose.pitch, pose.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);

  const n = pose.near;
  const cxPx = pose.cx * vw;
  const cyPx = pose.cy * vh;
  const k = n / pose.focal;
  camera.near = n;
  camera.far = far;
  camera.projectionMatrix.makePerspective(
    -cxPx * k,
    (vw - cxPx) * k,
    cyPx * k,
    -(vh - cyPx) * k,
    n,
    far,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}