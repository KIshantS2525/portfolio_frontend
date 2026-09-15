// src/components/game/raycastVoxel.ts
import * as THREE from 'three';

export type VoxelHit = {
  /** The solid cell the ray hit. */
  cell: THREE.Vector3;
  /** The empty cell a placed block goes in — `cell` offset along the face that was crossed. */
  place: THREE.Vector3;
  /** Which face was entered, as a unit normal. */
  normal: THREE.Vector3;
};

/**
 * Marches a ray forward in small steps and asks `isSolid` at each integer
 * cell, rather than a proper voxel DDA. At this world's scale (a handful of
 * metres of reach, a five-metre step budget) the extra few hundred
 * microseconds a real DDA would save aren't worth the bug surface — this is
 * called once per frame at most, only while a mouse button is actually held.
 *
 * ── Why `place` is derived from a face normal, not the previous cell ──
 *
 * The obvious version returns the last cell the march visited before hitting
 * something, and that is wrong whenever the ray crosses more than one axis
 * boundary inside a single 0.04 step — at a corner, the previous cell is
 * diagonal from the hit, so the block lands offset by one on two axes and
 * appears to float beside the face you clicked. Taking the dominant component
 * of the step that actually entered the cell collapses that to exactly one
 * axis, so a placed block is always flush against the face under the
 * crosshair.
 */
/*
 * Two reused scratch vectors for the march, declared at module scope rather
 * than allocated inside (or even once per call of) the loop. With mining
 * held down this runs every frame, up to maxDist / step (~120) iterations
 * each — that was 120+ fresh Vector3s a frame, all garbage a moment later.
 * Only the *return value* on an actual hit is ever a freshly allocated
 * vector, since that one has to outlive the call (it's compared frame over
 * frame against `mineTarget`).
 */
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _cellA = new THREE.Vector3();
const _cellB = new THREE.Vector3();
const _delta = new THREE.Vector3();

export function raycastVoxel(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
  isSolid: (x: number, y: number, z: number) => boolean,
): VoxelHit | null {
  const step = 0.04;
  const p = _p.copy(origin);
  const d = _d.copy(dir).normalize().multiplyScalar(step);
  let prev = _cellA.set(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  let cur = _cellB;
  for (let t = 0; t < maxDist; t += step) {
    p.add(d);
    cur.set(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (cur.equals(prev)) continue;
    if (isSolid(cur.x, cur.y, cur.z)) {
      const delta = _delta.subVectors(prev, cur);
      // Keep only the dominant axis, so the normal is one of the six faces.
      const ax = Math.abs(delta.x);
      const ay = Math.abs(delta.y);
      const az = Math.abs(delta.z);
      const normal =
        ax >= ay && ax >= az
          ? new THREE.Vector3(Math.sign(delta.x), 0, 0)
          : ay >= az
            ? new THREE.Vector3(0, Math.sign(delta.y), 0)
            : new THREE.Vector3(0, 0, Math.sign(delta.z));
      const cell = cur.clone();
      return { cell, place: cell.clone().add(normal), normal };
    }
    // Swap roles rather than reassigning — no allocation either way.
    const tmp = prev; prev = cur; cur = tmp;
  }
  return null;
}
