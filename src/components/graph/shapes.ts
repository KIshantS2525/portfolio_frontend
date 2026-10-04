// src/components/graph/shapes.ts
/**
 * Shared scale and the fixed starfield for the opening journey. The figures
 * themselves (galaxy, nebulae, vortex) live in cosmos.ts.
 */

export type Vec3 = [number, number, number];

/** One shell radius for the whole sequence — every figure is built to roughly this scale. */
export const OUTER = 260;

/** mulberry32 — seeded, so the sky is identical on every visit. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The Sky: a slab of background stars wider and taller than the frame,
 * identical in every keyframe, so the figures move in front of a still sky.
 */
export function starFieldShape(count: number, seed: number): Vec3[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => [
    (rand() * 2 - 1) * OUTER * 7.4,
    (rand() * 2 - 1) * OUTER * 4.2,
    (rand() * 2 - 1) * OUTER * 1.1,
  ] as Vec3);
}
