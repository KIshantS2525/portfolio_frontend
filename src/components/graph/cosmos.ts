// frontend/src/components/graph/cosmos.ts
/**
 * The figures of the opening journey, as point clouds.
 *
 *   Galaxy        Hero        — a tilted barred spiral, the Core at its heart
 *   Core Globe    Ask         — the camera falls into the galaxy's heart; the
 *                               graph's nodes form a sphere round the Core
 *   Orion spread  Numbers/Proof — an emission nebula opened out behind the copy
 *   Orion         Connected   — the same nebula gathered in
 *   Eye           One Mind    — the Helix: ring, blue interior, the Core as its star
 *   Butterfly     Other Lens  — two wings pinched at a white-hot waist
 *   Vortex        Signature   — a nebula wound into a whirlpool, draining at Rest
 *                               into the ray-traced black hole (BlackHole.tsx)
 *
 * The galaxy and the three nebulae are sampled from real photographs (see
 * cosmosMaps.ts): each particle lands where the object's light really is,
 * with more particles where it is brighter, and takes the photograph's colour
 * at that spot. That is what makes them read as the Orion Nebula, the Helix,
 * NGC 6302 and a grand-design spiral rather than as shapes inspired by them.
 *
 * Every generator is per-index deterministic and, where two figures are
 * neighbours, derived from the same per-point parameters — the Orion spread
 * and gathered are one set of points rendered two ways, as are the Vortex and
 * its drained state. That shared identity keeps those transitions a flow.
 *
 * Positions are authored in a camera-aligned frame (u right, v up, w toward
 * the lens) and converted to world space with `view`, so a figure that must
 * face the camera — a ring, a chart — does, regardless of the camera's slight
 * three-quarter offset.
 *
 * Each figure carries a colour (rgb 0–1) and a weight (alpha multiplier) per
 * point, so the palette travels with the shape and is interpolated with it.
 */
import { OUTER, type Vec3 } from '@/components/graph/shapes';
import { THEMES } from '@/lib/theme';
import {
  BUTTERFLY_MAP,
  GALAXY_MAP,
  HELIX_MAP,
  ORION_MAP,
  type CosmosMap,
} from '@/components/graph/cosmosMaps';

export type Figure = {
  /** xyz per point, world space. */
  pos: Float32Array;
  /** rgb per point, 0–1. */
  col: Float32Array;
  /** alpha weight per point, 0–1. */
  w: Float32Array;
};

/* ── frame ──────────────────────────────────────────────────────────────── */

const norm = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
/** Toward the camera. Must match CAM in GraphJourney. */
export const AXIS_W = norm(0.18, 0.1, 1);
/** Screen right: up × w. */
export const AXIS_U = norm(AXIS_W[2], 0, -AXIS_W[0]);
/** Screen up: w × u. */
export const AXIS_V: Vec3 = [
  AXIS_W[1] * AXIS_U[2] - AXIS_W[2] * AXIS_U[1],
  AXIS_W[2] * AXIS_U[0] - AXIS_W[0] * AXIS_U[2],
  AXIS_W[0] * AXIS_U[1] - AXIS_W[1] * AXIS_U[0],
];

function put(out: Float32Array, i: number, a: number, b: number, c: number) {
  out[i * 3] = AXIS_U[0] * a + AXIS_V[0] * b + AXIS_W[0] * c;
  out[i * 3 + 1] = AXIS_U[1] * a + AXIS_V[1] * b + AXIS_W[1] * c;
  out[i * 3 + 2] = AXIS_U[2] * a + AXIS_V[2] * b + AXIS_W[2] * c;
}

/** A unit vector given in view coordinates, in world space. */
export function viewVec(a: number, b: number, c: number): Vec3 {
  return norm(
    AXIS_U[0] * a + AXIS_V[0] * b + AXIS_W[0] * c,
    AXIS_U[1] * a + AXIS_V[1] * b + AXIS_W[1] * c,
    AXIS_U[2] * a + AXIS_V[2] * b + AXIS_W[2] * c,
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gaussFrom = (rand: () => number) => () => {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
function alloc(count: number): Figure {
  return {
    pos: new Float32Array(count * 3),
    col: new Float32Array(count * 3),
    w: new Float32Array(count),
  };
}
function paint(f: Figure, i: number, c: RGB, w: number) {
  f.col[i * 3] = c[0];
  f.col[i * 3 + 1] = c[1];
  f.col[i * 3 + 2] = c[2];
  f.w[i] = w;
}

/* ── sampling the photographs ───────────────────────────────────────────── */

type Sampler = {
  w: number;
  h: number;
  /** density 0–1 per cell */
  d: Float32Array;
  /** galaxy only: class per cell */
  cls: Uint8Array | null;
  /** cumulative sampling weight per cell */
  cdf: Float64Array;
  rgb: Uint8Array | null;
  cw: number;
  ch: number;
  /** half-extent of the map: the longer side spans -1..1 */
  ax: number;
  ay: number;
};

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const samplerCache = new Map<string, Sampler>();

/**
 * Cells are drawn with probability density^gamma: gamma above 1 pulls the
 * particles onto the bright structure (filaments, ring, arms) and leaves the
 * faint glow thin, which is how a photograph's contrast survives being
 * rebuilt from a finite number of points.
 */
function sampler(name: string, map: CosmosMap, gamma: number, packed = false): Sampler {
  const key = `${name}:${gamma}`;
  const hit = samplerCache.get(key);
  if (hit) return hit;
  const raw = decode(map.d);
  const n = map.w * map.h;
  const d = new Float32Array(n);
  const cls = packed ? new Uint8Array(n) : null;
  const cdf = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const v = packed ? (raw[i] >> 2) / 63 : raw[i] / 255;
    if (cls) cls[i] = raw[i] & 3;
    d[i] = v;
    acc += Math.pow(v, gamma);
    cdf[i] = acc;
  }
  const long = Math.max(map.w, map.h);
  const s: Sampler = {
    w: map.w,
    h: map.h,
    d,
    cls,
    cdf,
    rgb: map.c ? decode(map.c) : null,
    cw: map.cw ?? 0,
    ch: map.ch ?? 0,
    ax: map.w / long,
    ay: map.h / long,
  };
  samplerCache.set(key, s);
  return s;
}

type Draw = { x: number; y: number; dens: number; cls: number; col: RGB };

/** One particle: a cell by weight, a uniform spot inside it, the colour there. */
function draw(s: Sampler, rand: () => number): Draw {
  const total = s.cdf[s.cdf.length - 1];
  const t = rand() * total;
  let lo = 0;
  let hi = s.cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.cdf[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const row = Math.floor(lo / s.w);
  const colIdx = lo - row * s.w;
  const fx = (colIdx + rand()) / s.w;
  const fy = (row + rand()) / s.h;
  let col: RGB = [1, 1, 1];
  if (s.rgb) {
    const cx = Math.min(s.cw - 1, Math.floor(fx * s.cw));
    const cy = Math.min(s.ch - 1, Math.floor(fy * s.ch));
    const j = (cy * s.cw + cx) * 3;
    col = [s.rgb[j] / 255, s.rgb[j + 1] / 255, s.rgb[j + 2] / 255];
  }
  return {
    x: (fx * 2 - 1) * s.ax,
    // Image rows run downward; the figure's v axis runs up.
    y: -(fy * 2 - 1) * s.ay,
    dens: s.d[lo],
    cls: s.cls ? s.cls[lo] : 0,
    col,
  };
}

/**
 * Per-particle weight. Brighter regions already get more particles, so each
 * particle there is dimmed (dens^-0.45) to keep the core from summing to a
 * flat white blob; the set is then scaled to a mean weight, which is what
 * holds a figure's total light steady whatever the particle count.
 */
function normaliseWeights(w: Float32Array, dens: Float32Array, mean: number, expo = -0.45) {
  let sum = 0;
  for (let i = 0; i < w.length; i++) {
    w[i] = Math.pow(Math.max(0.04, dens[i]), expo);
    sum += w[i];
  }
  const k = (mean * w.length) / Math.max(1e-6, sum);
  for (let i = 0; i < w.length; i++) w[i] = Math.min(1, w[i] * k);
}

/** The light theme's ink: the photograph's hue, deepened to read on paper. */
const ink = (c: RGB): RGB => [c[0] * 0.55, c[1] * 0.5, c[2] * 0.6];

/* ── Galaxy, Galaxy Dive, Stardust ──────────────────────────────────────── */

/** Galaxy radius. Larger than the old sphere: a galaxy should feel vast. */
export const GALAXY_R = OUTER * 1.85;
/** Inclination from face-on, in radians. ~58°, the classic oblique view. */
const GALAXY_INCL = 1.02;
/** Roll of the major axis on screen. */
const GALAXY_ROLL = -0.32;

/** The galaxy's rotation axis in world space, for swirl interpolation (same transform as renderGalaxy). */
export const GALAXY_NORMAL: Vec3 = viewVec(
  Math.sin(GALAXY_INCL) * Math.sin(GALAXY_ROLL),
  -Math.sin(GALAXY_INCL) * Math.cos(GALAXY_ROLL),
  -Math.cos(GALAXY_INCL),
);

type GalaxyKind = 0 | 1 | 2 | 3; // bulge, arm, haze, star-forming knot
type GalaxyParams = {
  r: Float32Array;
  th: Float32Array;
  h: Float32Array;
  kind: Uint8Array;
  /** Brightness of the photograph where the star was drawn, 0–1. */
  dn: Float32Array;
  /** Per-point noise for the unwinding, so the Stardust is not just a bigger galaxy. */
  n1: Float32Array;
  n2: Float32Array;
  n3: Float32Array;
};

/**
 * The galaxy is M74, a grand-design spiral seen face-on, sampled from its
 * photograph (GALAXY_MAP) and then tilted into the oblique view by
 * renderGalaxy. Its arms wind the same way the old procedural ones did, so
 * the dive and the unwinding into the Stardust still turn the right way.
 */
const GALAXY_GAMMA = 2.6;

function galaxyDraw(rand: () => number) {
  const s = sampler('galaxy', GALAXY_MAP, GALAXY_GAMMA, true);
  const R = GALAXY_MAP.R ?? 0.72;
  const d = draw(s, rand);
  return { r: Math.hypot(d.x, d.y) / R, th: Math.atan2(d.y, d.x), kind: d.cls as GalaxyKind, dn: d.dens };
}

function galaxyHeight(kind: GalaxyKind, r: number, g: () => number) {
  // Bulge: a slightly flattened core; arms thin; haze a little thicker.
  if (kind === 0) return g() * 0.06 * Math.max(0.2, 1 - r / 0.36);
  if (kind === 2) return g() * 0.03;
  return g() * 0.015;
}

function galaxyParams(count: number, seed: number): GalaxyParams {
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const p: GalaxyParams = {
    r: new Float32Array(count),
    th: new Float32Array(count),
    h: new Float32Array(count),
    kind: new Uint8Array(count),
    dn: new Float32Array(count),
    n1: new Float32Array(count),
    n2: new Float32Array(count),
    n3: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const s = galaxyDraw(rand);
    p.r[i] = s.r;
    p.th[i] = s.th;
    p.kind[i] = s.kind;
    p.dn[i] = s.dn;
    p.h[i] = galaxyHeight(s.kind, s.r, g);
    p.n1[i] = g();
    p.n2[i] = rand();
    p.n3[i] = g();
  }
  return p;
}

const GALAXY_COLORS = {
  dark: {
    core: hex(THEMES.dark.galaxy.core),
    bulge: hex(THEMES.dark.galaxy.bulge),
    innerArm: hex(THEMES.dark.galaxy.innerArm),
    arm: hex(THEMES.dark.galaxy.arm),
    armB: hex(THEMES.dark.galaxy.armB),
    haze: hex(THEMES.dark.galaxy.haze),
    knot: hex(THEMES.dark.galaxy.knot),
  },
  light: {
    core: hex(THEMES.light.galaxy.core),
    bulge: hex(THEMES.light.galaxy.bulge),
    innerArm: hex(THEMES.light.galaxy.innerArm),
    arm: hex(THEMES.light.galaxy.arm),
    armB: hex(THEMES.light.galaxy.armB),
    haze: hex(THEMES.light.galaxy.haze),
    knot: hex(THEMES.light.galaxy.knot),
  },
};

type GalaxyPal = (typeof GALAXY_COLORS)['dark'];
let galaxyOverride: GalaxyPal | null = null;

/**
 * Admin colour overrides for the (dark) galaxy. Call before building figures;
 * GraphJourney does, and lists the colours in its memo deps so a change
 * rebuilds them. Pass null to go back to the theme.ts defaults.
 */
export function setGalaxyPalette(colors: Record<keyof GalaxyPal, string> | null) {
  galaxyOverride = colors
    ? (Object.fromEntries(
        Object.entries(colors).map(([k, v]) => [k, hex(v)]),
      ) as unknown as GalaxyPal)
    : null;
}

/**
 * Render a set of galaxy parameters.
 *
 * @param spin   extra rotation about the galaxy's own axis
 * @param expand 0 = the galaxy, 1 = the Stardust: radii grow, the arms
 *               unwind at a per-star rate, the disk thickens and opens
 *               toward face-on so the cloud fills the screen behind text.
 */
function renderGalaxy(
  f: Figure,
  p: GalaxyParams,
  light: boolean,
  spin: number,
  expand: number,
  colors = true,
  hollow = 0,
  coreDim = 0,
) {
  const pal = light ? GALAXY_COLORS.light : (galaxyOverride ?? GALAXY_COLORS.dark);
  const R = GALAXY_R;
  const incl = GALAXY_INCL - expand * 0.62;
  const ci = Math.cos(incl);
  const si = Math.sin(incl);
  const cr = Math.cos(GALAXY_ROLL * (1 - expand * 0.6));
  const sr = Math.sin(GALAXY_ROLL * (1 - expand * 0.6));
  const n = p.r.length;
  for (let i = 0; i < n; i++) {
    let r = p.r[i];
    let th = p.th[i] + spin;
    let h = p.h[i];
    if (hollow > 0) {
      // Falling into the heart: every star rushes outward past the camera,
      // and the centre opens up for the Globe and the Core.
      r = r * (1 + 1.6 * hollow) + 0.55 * hollow + Math.abs(p.n1[i]) * 0.1 * hollow;
      h = h * (1 + 4 * hollow) + p.n3[i] * 0.12 * hollow;
    }
    if (expand > 0) {
      r = r * (1 + 1.75 * expand) + Math.abs(p.n1[i]) * 0.22 * expand;
      th += expand * (0.7 + p.n2[i] * 1.1) * (1.15 - p.r[i] * 0.5);
      h += p.n3[i] * 0.42 * expand;
    }
    // Disk coordinates → inclined about screen-x → rolled on screen.
    const x = Math.cos(th) * r * R;
    const z = Math.sin(th) * r * R;
    const y = h * R;
    const b = z * ci - y * si; // screen-up component
    const c = z * si + y * ci; // toward-camera component
    const a = x * cr - b * sr;
    const bb = x * sr + b * cr;
    put(f.pos, i, a, bb, -c);

    if (!colors) continue;
    const k = p.kind[i] as GalaxyKind;
    const rr = p.r[i];
    let col: RGB;
    let w: number;
    // Brighter parts of the photograph already hold more stars, so each one
    // there is dimmed a little; otherwise the bulge sums to a white disc.
    const tone = Math.min(1.6, 0.32 * Math.pow(Math.max(0.05, p.dn[i]), -0.45));
    if (k === 0) {
      col = mix(pal.core, pal.bulge, smooth(0.02, 0.22, rr));
      // Close up, a full-strength bulge blows out to white and swallows the
      // Core; dimmed, it becomes a glow the sun or moon sits inside.
      w = (0.7 - 0.25 * smooth(0, 0.2, rr)) * (1 - coreDim * 0.9);
    } else if (k === 1) {
      // Warm and dusty through the inner disk, turning blue out along the arms.
      col = mix(pal.innerArm, i % 3 === 0 ? pal.armB : pal.arm, smooth(0.24, 0.55, rr));
      w = 0.85 - rr * 0.2;
    } else if (k === 3) {
      col = pal.knot;
      w = 1;
    } else {
      // The faint disk between the arms; the dust lanes are simply where the
      // photograph has no light, so no stars are drawn there.
      col = mix(pal.bulge, pal.haze, smooth(0.1, 0.45, rr));
      w = 0.6 * (1 - rr * 0.3);
    }
    paint(f, i, col, Math.min(1, w * tone));
  }
}

export function galaxyFigures(count: number, light: boolean, seed = 0x9a1a) {
  const p = galaxyParams(count, seed);
  const galaxy = alloc(count);
  const dive = alloc(count);
  const dust = alloc(count);
  renderGalaxy(galaxy, p, light, 0, 0);
  renderGalaxy(dive, p, light, 0.55, 0, true, 0, 1);
  renderGalaxy(dust, p, light, 0.55, 1);
  return { galaxy, dive, dust };
}

/**
 * The graph's own nodes on the galaxy, by importance: the Core at the centre,
 * roles near the bulge, projects along the arms, domains and tools further
 * out. Same renderer as the dust, so they sit *in* the arms, not on top.
 */
export function galaxyNodeFigures(order: number[], light: boolean) {
  const n = order.length;
  const p = galaxyParams(n, 0x3e11);
  const rand = rng(0x51de);
  const g = gaussFrom(rand);
  // Candidate spots on the photograph's arms, inside the radius the Ask
  // screen's close-up can see, ordered inside-out; nodes take them by
  // importance, so the Core's neighbours sit nearest the bulge.
  const spots: { r: number; th: number }[] = [];
  for (let tries = 0; spots.length < n && tries < n * 400; tries++) {
    const s = galaxyDraw(rand);
    if (s.kind === 1 && s.r > 0.09 && s.r < 0.73) spots.push({ r: s.r, th: s.th });
  }
  spots.sort((a, b) => a.r - b.r);
  order.forEach((nodeIdx, rank) => {
    const spot = spots[Math.min(spots.length - 1, Math.floor((rank / Math.max(1, n)) * spots.length))];
    if (!spot) return;
    p.r[nodeIdx] = spot.r;
    p.th[nodeIdx] = spot.th;
    p.h[nodeIdx] = g() * 0.015;
    p.kind[nodeIdx] = 1;
    p.dn[nodeIdx] = 0.5;
  });
  const galaxy = alloc(n);
  const dive = alloc(n);
  const dust = alloc(n);
  renderGalaxy(galaxy, p, light, 0, 0);
  renderGalaxy(dive, p, light, 0.55, 0);
  renderGalaxy(dust, p, light, 0.55, 1);
  return { galaxy, dive, dust };
}

/* ── Orion: Numbers / Proof (spread) and Connected (gathered) ──────────── */

const ORION_S = OUTER * 2.35;

/**
 * M42, the Orion Nebula, sampled from a photograph: the blown-out heart round
 * the Trapezium, the great pink loop of the cavity wall, the dark bay cutting
 * in beside the heart, M43's little comma above it and the grey-blue wings
 * fading out. The heart sits at the origin, where the Core node is.
 *
 * Each point's sampled position is kept as a parameter, so `spread` can open
 * the same cloud out across the whole screen (Numbers / Proof) and the
 * Connected screen simply gathers it back in.
 */
function orionParams(count: number, seed: number) {
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const s = sampler('orion', ORION_MAP, 3.2);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const dens = new Float32Array(count);
  const w = new Float32Array(count);
  const n1 = new Float32Array(count);
  const n2 = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const d = draw(s, rand);
    x[i] = d.x;
    y[i] = d.y;
    // Thicker where faint: the bright heart is a compact knot, the wings a veil.
    z[i] = g() * (0.05 + 0.1 * (1 - d.dens));
    col.set(d.col, i * 3);
    dens[i] = d.dens;
    n1[i] = g();
    n2[i] = g();
  }
  normaliseWeights(w, dens, 0.46, -0.2);
  return { x, y, z, col, w, n1, n2 };
}

function renderOrion(
  f: Figure,
  p: ReturnType<typeof orionParams>,
  light: boolean,
  spread: number,
) {
  const S = ORION_S;
  for (let i = 0; i < p.x.length; i++) {
    let a = p.x[i];
    let b = p.y[i];
    let c = p.z[i];
    if (spread > 0) {
      a = a * (1 + 2.1 * spread) + p.n1[i] * 0.35 * spread;
      b = b * (1 + 1.1 * spread) + p.n2[i] * 0.3 * spread;
      c = c * (1 + 3 * spread);
    }
    put(f.pos, i, a * S, b * S, c * S);
    const rgb: RGB = [p.col[i * 3], p.col[i * 3 + 1], p.col[i * 3 + 2]];
    paint(f, i, light ? ink(rgb) : rgb, p.w[i] * (1 - 0.35 * spread));
  }
}

export function orionFigures(count: number, light: boolean, seed = 0x0410) {
  const p = orionParams(count, seed);
  const spread = alloc(count);
  const gathered = alloc(count);
  renderOrion(spread, p, light, 1);
  renderOrion(gathered, p, light, 0);
  return { spread, gathered };
}

/* ── Eye: One Mind ──────────────────────────────────────────────────────── */

const EYE_R = OUTER * 1.08;

/**
 * The Helix (NGC 7293), sampled from ESO's VISTA image: the thick ring burning
 * gold to orange, the cometary knots combed radially through it, the blue
 * interior darkening toward the centre and the wide rust haze beyond. The
 * central star is at the origin, which is where the Core node sits.
 */
export function eyeFigure(count: number, light: boolean, seed = 0xe7e1): Figure {
  const f = alloc(count);
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const s = sampler('helix', HELIX_MAP, 2.0);
  const S = EYE_R * 1.7;
  const dens = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const d = draw(s, rand);
    const r = Math.hypot(d.x, d.y);
    put(f.pos, i, d.x * S, d.y * S, g() * EYE_R * (0.05 + 0.08 * r));
    paint(f, i, light ? ink(d.col) : d.col, 0);
    dens[i] = d.dens;
  }
  normaliseWeights(f.w, dens, 0.34);
  return f;
}

/* ── Butterfly: Other Lens ──────────────────────────────────────────────── */

/**
 * NGC 6302, the Butterfly, sampled from the Hubble image: two great wings
 * pinched at a white-hot waist, ragged red flame along their edges, dark
 * dust lanes cutting through and the bright knotted lobes either side of the
 * centre. The waist is at the origin.
 */
export function butterflyFigure(count: number, light: boolean, seed = 0xb7f1): Figure {
  const f = alloc(count);
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const s = sampler('butterfly', BUTTERFLY_MAP, 2.2);
  const S = OUTER * 3.2;
  const dens = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const d = draw(s, rand);
    // The wings billow toward and away from us more the further out they go.
    put(f.pos, i, d.x * S, d.y * S, g() * OUTER * (0.04 + 0.14 * Math.abs(d.x)));
    paint(f, i, light ? ink(d.col) : d.col, 0);
    dens[i] = d.dens;
  }
  normaliseWeights(f.w, dens, 0.42, -0.65);
  return f;
}

/* ── Vortex: Signature, and the drain into the black hole ──────────────── */

/** The vortex's tilt and roll are chosen to match the black hole that replaces it. */
const VORTEX_ELEV = 0.5;
export const VORTEX_NORMAL: Vec3 = viewVec(0, Math.cos(VORTEX_ELEV), Math.sin(VORTEX_ELEV));

const VORTEX_COLORS = {
  dark: {
    hot: hex('#fff3de'),
    gold: hex('#ffc46b'),
    mid: hex('#ff9838'),
    cool: hex('#b2471a'),
    wisp: hex('#c97a8a'),
  },
  light: {
    hot: hex('#7a3a10'),
    gold: hex('#a8581a'),
    mid: hex('#b8611c'),
    cool: hex('#8e3a0b'),
    wisp: hex('#8a4a5a'),
  },
};

/**
 * A nebula caught in a whirlpool: gas wound into many trailing spiral
 * filaments around an empty centre, hot and gold within, cooling to rust
 * outward, with wisps lifted above and below the plane.
 *
 * @param collapse 0 = the Signature vortex; 1 = drained to a tight ring at
 *                 the centre, the frame the black hole takes over from.
 */
export function vortexFigure(count: number, light: boolean, collapse = 0, seed = 0x7047): Figure {
  const f = alloc(count);
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const pal = light ? VORTEX_COLORS.light : VORTEX_COLORS.dark;
  const R = OUTER * 1.3;
  const ce = Math.cos(VORTEX_ELEV);
  const se = Math.sin(VORTEX_ELEV);
  const ARMS = 7;
  for (let i = 0; i < count; i++) {
    const roll = rand();
    let r: number;
    let phi: number;
    let h: number;
    let col: RGB;
    let w: number;
    if (roll < 0.86) {
      // Trailing spiral filaments.
      r = 0.2 + 0.8 * Math.pow(rand(), 0.8);
      const arm = Math.floor(rand() * ARMS);
      phi = (arm / ARMS) * Math.PI * 2 - Math.log(r / 0.2) * 2.6 + g() * 0.12 * (0.4 + r);
      h = g() * 0.02 * (0.5 + r);
      col =
        r < 0.32
          ? mix(pal.hot, pal.gold, (r - 0.2) / 0.12)
          : r < 0.6
            ? mix(pal.gold, pal.mid, (r - 0.32) / 0.28)
            : mix(pal.mid, pal.cool, (r - 0.6) / 0.4);
      w = 0.95 - 0.55 * r;
    } else {
      // Wisps lifted out of the plane.
      r = 0.3 + rand() * 0.8;
      phi = rand() * Math.PI * 2;
      h = g() * 0.16;
      col = pal.wisp;
      w = 0.3;
    }
    if (collapse > 0) {
      r = 0.2 + (r - 0.2) * (1 - 0.82 * collapse) * 0.5 + 0.06 * collapse;
      h *= 1 - 0.9 * collapse;
    }
    const x = Math.cos(phi) * r * R;
    const y = Math.sin(phi) * r * R; // in-plane depth
    const z = h * R;
    put(f.pos, i, x, -y * se + z * ce, y * ce + z * se);
    paint(f, i, col, w);
  }
  return f;
}