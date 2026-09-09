// src/components/graph/shapes.ts

/**
 * Every point cloud the journey morphs through, as pure functions of a count.
 *
 * These used to live inside GraphJourney and take the node array, which meant
 * only one cloud could ever exist — the graph's own nodes. The knight needs
 * two: around a hundred real, labelled, clickable graph nodes, and several
 * thousand inert dust particles that only exist once the graph has stopped
 * being a graph. Taking a count instead of a node list lets the same generator
 * fill both, at wildly different densities, from the same maths.
 *
 * Index order is the contract. Every generator assigns positions by array
 * index, so index i in one shape morphs to index i in the next. knightShape
 * goes further and treats index bands as jobs — even skin, then features,
 * then silhouette, then halo — which is what keeps the character of the piece
 * constant whether it is being drawn with 100 points or 7,000.
 */

import { knightMesh } from '@/components/graph/knightMesh';

export type Vec3 = [number, number, number];

/** One shell radius for the whole sequence — every shape is built to roughly this scale. */
export const OUTER = 260;

/* ── helpers ────────────────────────────────────────────────────────────── */

/** mulberry32 — seeded, so every shape is identical on every visit. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── the simple shapes ──────────────────────────────────────────────────── */

const GA = Math.PI * (3 - Math.sqrt(5));

/** Golden-angle points on a sphere — even coverage, no clustering at the poles. */
export function sphereShape(count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * i + 0.6;
    return [Math.cos(th) * r * OUTER, y * OUTER, Math.sin(th) * r * OUTER] as Vec3;
  });
}

/** A uniform ball of debris. `spread` is the radius as a multiple of OUTER. */
export function scatterShape(count: number, spread: number, seed: number): Vec3[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => {
    const r = OUTER * spread * Math.cbrt(rand());
    const theta = 2 * Math.PI * rand();
    const phi = Math.acos(2 * rand() - 1);
    return [
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    ] as Vec3;
  });
}

/**
 * Two lobes on a shared Fibonacci sphere, split by index parity and separated
 * along x, with a low-frequency sine fold so the surface reads as organic
 * rather than two perfect eggs.
 */
export function brainShape(count: number): Vec3[] {
  const sep = OUTER * 0.36;
  const rx = OUTER * 0.6;
  const ry = OUTER * 0.5;
  const rz = OUTER * 0.56;
  const perLobe = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const j = Math.floor(i / 2);
    const y = perLobe === 1 ? 0 : 1 - (j / (perLobe - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * i;
    const fold = 1 + 0.1 * Math.sin(y * 6 + th * 2);
    return [
      Math.cos(th) * r * rx * fold + side * sep,
      y * ry,
      Math.sin(th) * r * rz * fold,
    ] as Vec3;
  });
}

/* ── the knight ─────────────────────────────────────────────────────────── */

/** Total height of the piece in world units. */
export const KNIGHT_HEIGHT = OUTER * 2.7;

/**
 * The camera's direction, expressed in the piece's own coordinates.
 *
 * The knight arrives turned about 0.3 rad past square and keeps turning to
 * about 0.9 across the hold, so 0.6 is the middle of the window in which it is
 * actually looked at. Un-rotating the fixed camera direction by that much
 * gives the axis the silhouette runs perpendicular to — which is all the rim
 * pass needs to know. It is a fixed approximation on purpose: rim points sit
 * on the real surface, so at the ends of the turn they simply stop being the
 * outline and become a slightly denser stripe on the flank, which nobody can
 * see. Recomputing it per frame would mean rebuilding the cloud per frame.
 */
const VIEW_IN_PIECE = (() => {
  const c = Math.cos(0.6);
  const s = Math.sin(0.6);
  // The fixed camera sits at (0.18, 0.1, 1) × distance; see the camera effect.
  const [cx, cy, cz] = [0.176, 0.098, 0.979];
  return [cx * c - cz * s, cy, cx * s + cz * c] as const;
})();

/**
 * A knight, as a volumetric point cloud, sampled off the real model.
 *
 * Four passes, and the split between them is the difference between a solid
 * object and a dotted outline:
 *
 *   skin    — area-weighted across every triangle. Density follows surface
 *             area, which means it is a surface and the inside comes out
 *             hollow without anyone having to arrange that.
 *   detail  — one sample per triangle *regardless of its size*. This is the
 *             cheapest trick in the file and the most effective: a quadric
 *             decimator spends its triangle budget where the surface is
 *             interesting, so small triangles are exactly the ear tips, the
 *             eye socket, the nostril, the scallops of the mane and the turned
 *             rings of the pedestal. Sampling per triangle rather than per
 *             unit area therefore concentrates points on the carving, with no
 *             feature list to maintain and nothing to keep in sync with the
 *             model.
 *   rim     — rejection-sampled toward triangles whose normal is square to the
 *             view: the band of surface that wraps around the outline. A
 *             quarter of the cloud goes here, and it is what stops the piece
 *             reading as a fog in the shape of a horse. A point cloud with no
 *             lines in it has only one way to state an edge, which is to put
 *             more points on it. (This is not the same mistake as the version
 *             that spent a third of its points tracing a 2D profile polyline:
 *             these are real surface samples on real triangles, so the edge
 *             has thickness and turns with the piece instead of being a wire
 *             stuck to the front of it.)
 *   halo    — pushed off the surface along its normal, most of it 5–15mm out
 *             with a quarter standing well clear, so the piece fades into the
 *             dust field instead of stopping dead at its own skin.
 */
export function knightShape(count: number, seed = 0x4e19): Vec3[] {
  const { positions, indices, cumulativeSkin, cumulativeDetail, normals } = knightMesh();
  const triangles = cumulativeSkin.length;
  const rand = rng(seed);

  const nSkin = Math.max(1, Math.round(count * 0.4));
  const nDetail = Math.max(1, Math.round(count * 0.16));
  const nRim = Math.max(1, Math.round(count * 0.26));
  const bSkin = nSkin;
  const bDetail = bSkin + nDetail;
  const bRim = Math.min(count, bDetail + nRim);

  /** Which triangle owns cumulative weight `w` in `table`. */
  const triangleAt = (table: Float32Array, w: number) => {
    let lo = 0;
    let hi = triangles - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (table[mid] < w) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** A uniform point inside triangle `t`, pushed `off` units along its normal. */
  const onTriangle = (t: number, off: number): Vec3 => {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    // Fold the unit square into the triangle — the standard trick, and the
    // reason this is uniform rather than bunched toward one corner.
    let u = rand();
    let v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const nx = normals[t * 3];
    const ny = normals[t * 3 + 1];
    const nz = normals[t * 3 + 2];
    return [
      (positions[ia] * w + positions[ib] * u + positions[ic] * v + nx * off) * KNIGHT_HEIGHT,
      (positions[ia + 1] * w + positions[ib + 1] * u + positions[ic + 1] * v + ny * off) *
        KNIGHT_HEIGHT,
      (positions[ia + 2] * w + positions[ib + 2] * u + positions[ic + 2] * v + nz * off) *
        KNIGHT_HEIGHT,
    ];
  };

  /**
   * Whether triangle `t` is on the outline: its normal square to the view, and
   * not merely a horizontal face, whose normal is square to *every* level view
   * and which would otherwise walk off with the whole rim band.
   */
  const onOutline = (t: number) =>
    Math.abs(
      normals[t * 3] * VIEW_IN_PIECE[0] +
        normals[t * 3 + 1] * VIEW_IN_PIECE[1] +
        normals[t * 3 + 2] * VIEW_IN_PIECE[2],
    ) < 0.16 && Math.abs(normals[t * 3 + 1]) < 0.45;

  return Array.from({ length: count }, (_, i): Vec3 => {
    if (i < bSkin) {
      // Stratified rather than plain random: an even walk up the weight table
      // with a step of noise on it covers the whole surface, where independent
      // draws leave clumps and bald patches at this density.
      return onTriangle(triangleAt(cumulativeSkin, (i + rand()) / nSkin), 0);
    }
    if (i < bDetail) {
      return onTriangle(triangleAt(cumulativeDetail, (i - bSkin + rand()) / nDetail), 0);
    }
    if (i < bRim) {
      let t = triangleAt(cumulativeSkin, rand());
      for (let tries = 0; tries < 16 && !onOutline(t); tries++) {
        t = triangleAt(cumulativeSkin, rand());
      }
      return onTriangle(t, 0);
    }
    // Halo, in fractions of the piece's height: 5–15mm of a 160mm knight for
    // most of it, and a quarter of them standing 18–30mm clear.
    //
    // Damped on downward-facing surfaces. The underside of the base is a
    // single big disc, so area weighting sends a good share of the halo to it,
    // and every one of those points is pushed straight down — the piece grew a
    // plume of dust underneath it, hanging in space below its own foot. It is
    // the one direction where a soft edge reads as a mistake rather than as
    // atmosphere, because a chess piece is a thing that sits on something.
    const far = (i - bRim) % 4 === 0;
    const t = triangleAt(cumulativeSkin, rand());
    const down = Math.max(0, -normals[t * 3 + 1]);
    const off = (far ? 0.112 + rand() * 0.075 : 0.031 + rand() * 0.063) * (1 - 0.8 * down);
    return onTriangle(t, off);
  });
}

/**
 * Roughly how far each shape extends along the view axis, in world units, and
 * how dark its far side is allowed to go.
 *
 * Both feed the depth cue that gives the cloud volume — near particles bright
 * and a touch larger, far ones dimmed and smaller. The knight gets a much
 * shorter range and a much darker back because it is the one shape whose
 * three-dimensionality is the point; the sphere and the scatter want to stay
 * even, or they read as a shadowed ball rather than a field.
 */
export const SHAPE_DEPTH: Record<string, { half: number; back: number }> = {
  sphere: { half: OUTER, back: 0.62 },
  scatter: { half: OUTER * 2.4, back: 0.7 },
  brain: { half: OUTER * 0.62, back: 0.55 },
  knight: { half: 220, back: 0.3 },
};