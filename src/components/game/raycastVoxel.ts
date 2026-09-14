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
export function raycastVoxel(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
  isSolid: (x: number, y: number, z: number) => boolean,
): VoxelHit | null {
  const step = 0.04;
  const p = origin.clone();
  const d = dir.clone().normalize().multiplyScalar(step);
  let prev = new THREE.Vector3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  for (let t = 0; t < maxDist; t += step) {
    p.add(d);
    const cell = new THREE.Vector3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (cell.equals(prev)) continue;
    if (isSolid(cell.x, cell.y, cell.z)) {
      const delta = prev.clone().sub(cell);
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
      return { cell, place: cell.clone().add(normal), normal };
    }
    prev = cell;
  }
  return null;
}
