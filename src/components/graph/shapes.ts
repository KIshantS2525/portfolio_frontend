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

/**
 * The opened-out cloud, as a slab rather than a ball.
 *
 * This used to be `r = R · cbrt(u)` on a sphere — a uniform ball of debris,
 * which is the textbook answer and the wrong one here. A ball projects to a
 * disc, and a uniform ball projects to a disc whose density peaks hard in the
 * middle (the chord through the centre is the longest one), so the "scatter"
 * read as a bright clot in the centre of the screen with empty corners around
 * it. Widening it did not help, because widening a ball also deepens it, and
 * the depth is bounded by the camera sitting 1,700 units away.
 *
 * So it is a box, sized in the same units the frame is: wide enough to run
 * off both edges of a 16:9 viewport at the sequence's camera distance, tall
 * enough to run off the top and bottom, and deliberately shallow in z so no
 * particle ever comes close enough to the lens to bloom into a saucer. A
 * uniform box viewed square-on has uniform *screen* density, which is exactly
 * the thing that was being asked for and that no ball can give.
 *
 * `spread` scales the whole slab; the 2.54 / 1.55 / 0.42 ratios below are the
 * frame's own proportions with margin on every side. At the sequence's camera
 * the visible world is almost exactly 1.61 units per pixel, so at spread 3
 * this covers a shade under 4,000 × 2,400 units against a 1920 × 950 window's
 * 3,090 × 1,530 — comfortably past all four edges, at every aspect ratio worth
 * worrying about, with room left over for the pan.
 *
 * Uniform in all three axes, and there was a version of this that was not: it
 * carried a gentle bell in y, on the theory that a perfectly flat field is
 * even and even is not the same as composed. It is not a small effect. The
 * visible band reaches about two standard deviations out, where the density
 * has fallen to a tenth of what it is in the middle, so what it actually drew
 * was a bright horizontal stripe fading into empty top and bottom margins —
 * a different artefact from the one this replaced and no better. Composition
 * belongs to the sculpture. The field's job is to be everywhere.
 */
export function scatterShape(count: number, spread: number, seed: number): Vec3[] {
  const rand = rng(seed);
  const w = OUTER * spread * 2.54;
  const h = OUTER * spread * 1.55;
  const d = OUTER * spread * 0.42;
  return Array.from({ length: count }, () =>
    [(rand() * 2 - 1) * w, (rand() * 2 - 1) * h, (rand() * 2 - 1) * d] as Vec3);
}

/**
 * The mind, as a Chladni figure: the nodal lines of a standing wave on a
 * sphere.
 *
 * Fifth pass. The four before it are on the record because each one failed
 * for a reason the next one had to know, and between them they define what
 * this medium can and cannot draw.
 *
 * One was two lobes on a shared Fibonacci sphere — a brain assembled from its
 * parts, which is how you get a diagram of the parts. Two eggs in a bag, and
 * anisotropic enough that the sequence's half-turn swung its projected width
 * by a third. Two was a single shell folded into real gyri and sulci; on a
 * shaded surface it would have been a cortex, and as a point cloud it was a
 * fuzzy ball. Three went filamentary — an arbor grown outward in every
 * direction — and was a dandelion clock, because a starburst carries no
 * information: every direction is the same direction. Four was a proper
 * pyramidal neuron, soma and apical and axon and spines, and it was correct
 * and legible and looked like a plant.
 *
 * The two rules that survive all of that:
 *
 *   · **An unshaded point cloud has no surface.** Every particle draws at the
 *     same brightness whichever way the surface under it faces, so folds,
 *     curvature and volume are thrown away in projection. Only the places
 *     where there are points and the places where there are none survive.
 *     Detail carved into a surface is invisible; detail carved out of the
 *     outline is all there is.
 *
 *   · **Regularity is read before subject.** Anything evenly spaced — thirteen
 *     identical limbs, an oblique branch at every node — is seen as a pattern
 *     first and as a thing second, and a pattern looks manufactured.
 *
 * A Chladni figure satisfies both without being asked to. It is a set of
 * closed curves, so it is pure silhouette and nothing is wasted on a surface
 * that cannot be shown. The curves are the zero set of a random superposition
 * of harmonics, so they are perfectly irregular while being generated by a
 * single rule — no two loops the same, nothing evenly spaced, and no
 * arbitrary choices to hand-tune. And it lives exactly on a sphere, which
 * makes it the one candidate that is rotation-stable by construction rather
 * than by careful arrangement: extents come out within half a percent of each
 * other on all three axes, so the half-turn cannot change the size, only the
 * view.
 *
 * It is also the only shape that earns its place in the sequence. The screen
 * before this one is "Everything, connected." over a plain sphere of radius
 * OUTER. This is the *same sphere at the same radius*, with its points
 * gathered onto the nodal lines of a wave running through it — which is
 * literally the experiment Chladni did: scatter sand on a plate, sound it,
 * and the sand migrates off the moving parts and collects where the plate is
 * standing still. So "One mind behind all of it" is the sphere revealing that
 * it was resonating the whole time, and it is the same material rearranged,
 * not a new object cutting in.
 *
 * What carries "Same mind, different lens" is depth rather than outline. A
 * half-turn about the vertical axis always mirrors a silhouette — that is
 * true of any shape and is not worth fighting. What changes here is which
 * strands are in front of which, and with a dozen curves crossing over a
 * transparent shell that is a completely different picture. Hence the low
 * `back` value in SHAPE_DEPTH: the front of the cage runs bright and the far
 * side falls well away, so the weave reads as a weave and the turn shows you
 * the other side of it.
 */

/** The cage sits on the same shell the plain sphere does. That is the point. */
const MIND_RADIUS = OUTER;
/**
 * Harmonic degree — how many times the wave crosses zero going round.
 *
 * Rendered at 6, 8, 10 and 12 before choosing. 6 is too plain: four or five
 * fat loops and the sphere reads as a beach ball. 12 is too fine — the
 * strands thin out past what a mote can hold and the front and back of the
 * cage start to interfere into noise. 10 is where the weave has enough
 * crossings that the half-turn genuinely changes the picture, and each strand
 * is still a strand.
 */
const MIND_DEGREE = 10;
/** How many random zonal harmonics are summed. More is more irregular. */
const MIND_TERMS = 7;
/** Newton steps onto the nodal set. It is quadratic; five is plenty. */
const MIND_STEPS = 5;
/** Half-width of a strand, and the shell's thickness, as fractions of the radius. */
const MIND_STRAND = 0.011;
const MIND_SHELL = 0.009;

export function mindShape(count: number, seed = 0x51ab): Vec3[] {
  const rand = rng(seed);

  /*
   * The field, as a sum of zonal harmonics about random axes.
   *
   * A sum of P_l(a·u) terms is itself a degree-l spherical harmonic — which
   * is the whole trick here. It gives a genuine random wave of a chosen
   * degree using nothing but a Legendre recurrence and some random unit
   * vectors: no associated Legendre functions, no factorials, no table of
   * coefficients to carry around, and no risk of accidentally landing on one
   * of the symmetric textbook modes that would look designed.
   */
  const axes = new Float64Array(MIND_TERMS * 3);
  const coef = new Float64Array(MIND_TERMS);
  for (let j = 0; j < MIND_TERMS; j++) {
    // A uniform point on the sphere — z uniform, then the ring around it.
    const z = 2 * rand() - 1;
    const th = 2 * Math.PI * rand();
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    axes[j * 3] = Math.cos(th) * r;
    axes[j * 3 + 1] = z;
    axes[j * 3 + 2] = Math.sin(th) * r;
    coef[j] = rand() * 2 - 1;
  }

  return Array.from({ length: count }, (_, i): Vec3 => {
    /*
     * Start where the plain sphere put this very point.
     *
     * This is the same golden-angle formula sphereShape uses, and using it is
     * what makes the transition mean something. Newton converges to the
     * *nearest* root, so every point slides the shortest distance across the
     * shell from where it already was onto the nodal line closest to it —
     * which is exactly what sand on a Chladni plate does. The morph is
     * therefore not a hundred points flying across the screen to new
     * addresses; it is the sphere's own surface migrating a short way and
     * settling into a pattern that was always implied by it.
     *
     * It also means the density along the curves is the real one: a strand
     * with a lot of shell draining into it ends up brighter than one with
     * little. Nobody chose that. It falls out of the physics.
     */
    const y0 = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th0 = GA * i + 0.6;
    let ux = Math.cos(th0) * ring;
    let uy = y0;
    let uz = Math.sin(th0) * ring;

    for (let step = 0; step < MIND_STEPS; step++) {
      let f = 0;
      let gx = 0;
      let gy = 0;
      let gz = 0;
      for (let j = 0; j < MIND_TERMS; j++) {
        const ax = axes[j * 3];
        const ay = axes[j * 3 + 1];
        const az = axes[j * 3 + 2];
        const t = ux * ax + uy * ay + uz * az;
        /*
         * P_l(t) and P_l'(t) by joint recurrence.
         *
         * The closed form for the derivative, l(t·P_l − P_{l−1})/(t²−1),
         * divides by zero at the poles of every single axis — and with seven
         * random axes there is always a point sitting near one of them.
         * Carrying the derivative through its own recurrence costs three
         * multiplies a step and is finite everywhere.
         */
        let p0 = 1;
        let d0 = 0;
        let p1 = t;
        let d1 = 1;
        for (let k = 2; k <= MIND_DEGREE; k++) {
          const p2 = ((2 * k - 1) * t * p1 - (k - 1) * p0) / k;
          const d2 = ((2 * k - 1) * (p1 + t * d1) - (k - 1) * d0) / k;
          p0 = p1;
          p1 = p2;
          d0 = d1;
          d1 = d2;
        }
        f += coef[j] * p1;
        gx += coef[j] * d1 * ax;
        gy += coef[j] * d1 * ay;
        gz += coef[j] * d1 * az;
      }

      // Only the part of the gradient along the surface can move a point that
      // has to stay on the shell.
      const radial = gx * ux + gy * uy + gz * uz;
      const tx = gx - radial * ux;
      const ty = gy - radial * uy;
      const tz = gz - radial * uz;
      const n2 = tx * tx + ty * ty + tz * tz;
      if (n2 < 1e-12) break;

      // Step, capped. Near a saddle the tangential gradient goes to nothing
      // and an uncapped Newton step throws the point clean off the sphere;
      // capping turns those few cases into a slow walk that still arrives.
      let s = -f / n2;
      const reach = Math.abs(s) * Math.sqrt(n2);
      if (reach > 0.35) s *= 0.35 / reach;

      ux += s * tx;
      uy += s * ty;
      uz += s * tz;
      const len = Math.hypot(ux, uy, uz) || 1;
      ux /= len;
      uy /= len;
      uz /= len;

      if (step === MIND_STEPS - 1) {
        // Strand width, laid across the curve rather than in a random
        // direction: the tangential gradient points straight across the nodal
        // line, so offsetting along it thickens the strand evenly instead of
        // making each sample a little ball.
        const tn = Math.sqrt(n2);
        const w = (rand() - 0.5) * 2 * MIND_STRAND;
        ux += (tx / tn) * w;
        uy += (ty / tn) * w;
        uz += (tz / tn) * w;
        const l2 = Math.hypot(ux, uy, uz) || 1;
        ux /= l2;
        uy /= l2;
        uz /= l2;
      }
    }

    // A little thickness through the shell, so the cage is made of something.
    const rr = MIND_RADIUS * (1 + (rand() - 0.5) * 2 * MIND_SHELL);
    return [ux * rr, uy * rr, uz * rr];
  });
}

/**
 * A slab of sky, wider and taller than any frame it will be shown in.
 *
 * Uniform inside a box rather than a ball, because a ball projects to a disc
 * and the corners of the screen stay conspicuously empty.
 *
 * Two things about it changed after it was caught red-handed producing the
 * exact artefact it was written to prevent. The box was 10.8 × 6.4 OUTER,
 * which at the sequence's camera distance is *narrower than the viewport* —
 * so its left and right faces were on screen. And it was being fed through
 * the same yaw as the sculpture, so by the time the cloud opened out the
 * whole sky had been turned 72° about the vertical axis and was presenting
 * its shallow z face to the camera: a bright rectangle of stars about half a
 * screen wide, with two hard vertical edges, sitting in the middle of the
 * page. A div, in other words, which is precisely what the full-viewport
 * canvas had been built to get rid of.
 *
 * It is bigger now — comfortably past every edge at any sane aspect ratio —
 * and, more importantly, GraphJourney no longer pans, yaws or rolls it. It is
 * scenery: it sits still while the sculpture forms in front of it, which is
 * what the previous version's comment claimed and the code did not do.
 */
export function starFieldShape(count: number, seed: number): Vec3[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => [
    (rand() * 2 - 1) * OUTER * 7.4,
    (rand() * 2 - 1) * OUTER * 4.2,
    (rand() * 2 - 1) * OUTER * 1.1,
  ] as Vec3);
}

/* ── the knight ─────────────────────────────────────────────────────────── */

/**
 * Total height of the piece in world units.
 *
 * Kept a little under what the frame could hold. The halo reaches 30mm clear
 * of a 160mm knight, so the cloud is a good deal taller than the object in it,
 * and sizing the object to the slot puts the ear tips and the foot of the
 * pedestal through the top and bottom edges.
 */
export const KNIGHT_HEIGHT = OUTER * 2.6;

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
 *   halo    — pushed off the surface along its normal: two thirds of it within
 *             5–17mm of a 160mm piece, and the other third standing 22–50mm
 *             clear, which is far enough to be its own drift rather than an
 *             edge. Between this and the starfield the sculpture has no
 *             boundary anywhere — it thins out of the sky and thins back into
 *             it, and there is no distance at which the dust stops.
 */
export function knightShape(count: number, seed = 0x4e19): Vec3[] {
  const { positions, indices, cumulativeSkin, cumulativeDetail, normals } = knightMesh();
  const triangles = cumulativeSkin.length;
  const rand = rng(seed);

  const nSkin = Math.max(1, Math.round(count * 0.36));
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
    const far = (i - bRim) % 3 === 0;
    const t = triangleAt(cumulativeSkin, rand());
    const down = Math.max(0, -normals[t * 3 + 1]);
    const off = (far ? 0.14 + rand() * 0.17 : 0.031 + rand() * 0.075) * (1 - 0.8 * down);
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
  /*
   * The scatter's range is far wider than its actual depth, and deliberately.
   * The cue is a dot with the view axis, and the view axis has a small but
   * non-zero x component — so on a slab that is 3,900 units wide and 570 deep,
   * a range set to the *depth* would shade the left of the screen against the
   * right and put a gradient across the page. Sized to the full diagonal
   * instead, and floored high, the slab stays an even field.
   */
  scatter: { half: OUTER * 2.6, back: 0.72 },
  /*
   * The arbor reaches about 1.15 OUTER along every axis, and its back is
   * allowed to go darker than the sphere's because it has a genuine front and
   * back — branches crossing in front of other branches is most of what tells
   * you it is a tree in space rather than a snowflake printed on the page.
   */
  /*
   * The cage is exactly a sphere, so the range is the sphere's — but `back`
   * runs far darker than the plain sphere's 0.62. That difference is the
   * whole of "Same mind, different lens": a half-turn mirrors any silhouette,
   * so the only thing that can distinguish the two views is which strands
   * read as near and which as far. At 0.62 the weave flattens into a doodle
   * on a circle. At 0.3 the front of the cage is plainly in front.
   */
  mind: { half: OUTER, back: 0.3 },
  knight: { half: 220, back: 0.3 },
};