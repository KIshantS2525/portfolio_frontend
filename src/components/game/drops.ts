// src/components/game/drops.ts
import * as THREE from 'three';
import { Block, blockBoxGeometry } from '@/components/game/blocks';

/**
 * Item drops.
 *
 * Breaking a block used to teleport it straight into the inventory, which is
 * why mining felt like nothing happened — no object left the world, so there
 * was nothing to connect the swing to the count changing. A drop is a small
 * spinning cube with its own gravity that you walk over to collect, which is
 * both the expected behaviour and the feedback the old version was missing.
 *
 * Collection is a two-stage thing: inside `MAGNET` the drop accelerates
 * toward the player, and inside `PICKUP` it's absorbed. The magnet stage
 * matters more than it looks — without it you have to stand exactly on a
 * 0.25m cube to pick it up, and items end up stranded against walls.
 */

const SIZE = 0.26;
const GRAVITY = 18;
const MAGNET = 2.2;
const MAGNET_PULL = 9;
const PICKUP = 0.55;
const LIFETIME = 120; // seconds before an uncollected drop gives up
const SPAWN_DELAY = 0.35; // can't be hoovered up before it's left the block

export type Drop = {
  block: Block;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  grounded: boolean;
};

export function spawnDrop(
  block: Block,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): Drop {
  const mesh = new THREE.Mesh(blockBoxGeometry(block, SIZE), material);
  mesh.position.set(x, y, z);
  return {
    block,
    mesh,
    pos: new THREE.Vector3(x, y, z),
    // A small random pop, so several drops from one spot don't stack into one
    // visually indistinguishable cube.
    vel: new THREE.Vector3((Math.random() - 0.5) * 1.4, 2.2, (Math.random() - 0.5) * 1.4),
    age: 0,
    grounded: false,
  };
}

/** Returns true when the drop should be removed (collected or expired). */
export function updateDrop(
  drop: Drop,
  dt: number,
  playerFeet: THREE.Vector3,
  isSolid: (x: number, y: number, z: number) => boolean,
  onCollect: (block: Block) => boolean,
): boolean {
  drop.age += dt;
  if (drop.age > LIFETIME) return true;

  const toPlayer = playerFeet.clone().setY(playerFeet.y + 0.6).sub(drop.pos);
  const dist = toPlayer.length();

  if (drop.age > SPAWN_DELAY && dist < PICKUP) {
    // Only vanish if the inventory actually accepted it — a full inventory
    // should leave the item on the ground, not silently delete it.
    if (onCollect(drop.block)) return true;
  }

  if (drop.age > SPAWN_DELAY && dist < MAGNET) {
    drop.vel.addScaledVector(toPlayer.normalize(), MAGNET_PULL * dt * (1 - dist / MAGNET));
    drop.grounded = false;
  } else {
    drop.vel.y -= GRAVITY * dt;
  }

  // Per-axis, like the player: resolve each direction against the voxel it
  // would enter, so a drop can slide along the ground instead of sticking.
  const step = (axis: 'x' | 'y' | 'z') => {
    const before = drop.pos[axis];
    drop.pos[axis] += drop.vel[axis] * dt;
    const cell = [
      Math.floor(drop.pos.x),
      Math.floor(drop.pos.y - SIZE / 2),
      Math.floor(drop.pos.z),
    ] as const;
    if (isSolid(cell[0], cell[1], cell[2])) {
      drop.pos[axis] = before;
      if (axis === 'y' && drop.vel.y < 0) {
        drop.pos.y = Math.floor(drop.pos.y - SIZE / 2) + 1 + SIZE / 2 + 0.01;
        drop.grounded = true;
      }
      drop.vel[axis] = 0;
    }
  };
  step('x');
  step('y');
  step('z');

  if (drop.grounded) {
    drop.vel.x *= 0.72;
    drop.vel.z *= 0.72;
  }

  // Spin always; bob only once it's settled, so it reads as an item lying
  // there rather than something still falling.
  drop.mesh.rotation.y += dt * 1.9;
  const bob = drop.grounded ? Math.sin(drop.age * 3) * 0.06 : 0;
  drop.mesh.position.set(drop.pos.x, drop.pos.y + bob, drop.pos.z);
  return false;
}