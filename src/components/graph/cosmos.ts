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
  /** Per-point noise for the unwinding, so the Stardust is not just a bigger galaxy. */
  n1: Float32Array;
  n2: Float32Array;
  n3: Float32Array;
};

const PITCH = 1 / Math.tan((13.5 * Math.PI) / 180);

/**
 * Six arms, not two. Each starts at its own angle round the bulge and winds
 * out on the same logarithmic pitch; they are given slightly different
 * lengths so the galaxy reads as grown rather than stamped.
 */
const ARMS = 6;
const ARM_LEN = [1.0, 0.82, 0.94, 0.78, 0.98, 0.86];

function armAngle(arm: number, r: number) {
  return (arm * Math.PI * 2) / ARMS + Math.log(Math.max(r, 0.1) / 0.1) * PITCH * 0.42;
}

function galaxyParams(count: number, seed: number): GalaxyParams {
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const p: GalaxyParams = {
    r: new Float32Array(count),
    th: new Float32Array(count),
    h: new Float32Array(count),
    kind: new Uint8Array(count),
    n1: new Float32Array(count),
    n2: new Float32Array(count),
    n3: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const roll = rand();
    let r: number;
    let th: number;
    let h: number;
    let kind: GalaxyKind;
    if (roll < 0.13) {
      // Bulge: a dense, slightly flattened core.
      r = Math.min(0.3, Math.abs(g()) * 0.12);
      th = rand() * Math.PI * 2;
      h = g() * 0.06 * (1 - r / 0.36);
      kind = 0;
    } else if (roll < 0.84) {
      // Arms: six logarithmic arms of differing length, widening outward,
      // with a little feathering trailing off each one.
      const arm = Math.floor(rand() * ARMS);
      r = 0.1 + (ARM_LEN[arm] - 0.1) * Math.pow(rand(), 0.85);
      const spread = 0.03 * (0.55 + r);
      const feather = rand() < 0.12 ? -(0.08 + rand() * 0.18) : 0;
      th = armAngle(arm, r) + (g() * spread) / r + feather;
      h = g() * 0.015;
      kind = rand() < 0.035 && r > 0.25 ? 3 : 1;
    } else {
      // Haze: the faint disk between the arms.
      r = Math.min(1.1, 0.06 - Math.log(1 - rand() * 0.97) * 0.3);
      th = rand() * Math.PI * 2;
      h = g() * 0.03;
      kind = 2;
    }
    p.r[i] = r;
    p.th[i] = th;
    p.h[i] = h;
    p.kind[i] = kind;
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
    if (k === 0) {
      col = mix(pal.core, pal.bulge, smooth(0.02, 0.22, rr));
      // Close up, a full-strength bulge blows out to white and swallows the
      // Core; dimmed, it becomes a glow the sun or moon sits inside.
      w = (0.85 - 0.3 * smooth(0, 0.2, rr)) * (1 - coreDim * 0.9);
    } else if (k === 1) {
      // Warm and dusty through the inner disk, turning blue out along the arms.
      col = mix(pal.innerArm, i % 3 === 0 ? pal.armB : pal.arm, smooth(0.28, 0.58, rr));
      w = 0.85 - rr * 0.25;
    } else if (k === 3) {
      col = pal.knot;
      w = 0.9;
    } else {
      col = mix(pal.bulge, pal.haze, smooth(0.12, 0.5, rr));
      // Spiral dust lanes darken the warm inner disk between the arms.
      const lane = 0.5 + 0.5 * Math.cos((p.th[i] - Math.log(Math.max(rr, 0.1) / 0.1) * PITCH * 0.42) * 6);
      w = 0.34 * (1 - rr * 0.45) * (rr < 0.45 ? 0.35 + 0.65 * lane : 1);
    }
    paint(f, i, col, w);
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
  // `order` lists node indices most-important first; place them inside-out.
  order.forEach((nodeIdx, rank) => {
    // Spread across every arm in turn, inside-out by importance, kept inside
    // the radius the Ask screen's close-up can see.
    const arm = rank % ARMS;
    const r = 0.09 + Math.min(ARM_LEN[arm] - 0.1, 0.64) * Math.pow((rank + 0.5) / n, 0.85);
    p.r[nodeIdx] = r;
    p.th[nodeIdx] = armAngle(arm, r) + (g() * 0.028 * (0.6 + r)) / r;
    p.h[nodeIdx] = g() * 0.015;
    p.kind[nodeIdx] = 1;
  });
  const galaxy = alloc(n);
  const dive = alloc(n);
  const dust = alloc(n);
  renderGalaxy(galaxy, p, light, 0, 0);
  renderGalaxy(dive, p, light, 0.55, 0);
  renderGalaxy(dust, p, light, 0.55, 1);
  return { galaxy, dive, dust };
}

/* ── noise ──────────────────────────────────────────────────────────────── */

function lattice(a: number, b: number) {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = lattice(xi, yi);
  const b = lattice(xi + 1, yi);
  const c = lattice(xi, yi + 1);
  const d = lattice(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * noise2(x * f, y * f);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}
/** Ridged noise: bright thin filaments where the field crosses its midline. */
const ridge = (x: number, y: number) => 1 - Math.abs(fbm(x, y, 4) * 2 - 1);

/* ── Orion: Numbers / Proof (spread) and Connected (gathered) ──────────── */

const ORION_S = OUTER * 1.2;

const ORION_COLORS = {
  dark: {
    heart: hex('#f4f8ff'),
    blue: hex('#8ec2ff'),
    pink: hex('#ff5c8a'),
    red: hex('#e0325c'),
    rust: hex('#a8502e'),
    haze: hex('#6f86c4'),
  },
  light: {
    heart: hex('#3a5d9a'),
    blue: hex('#3f6fb5'),
    pink: hex('#c23a63'),
    red: hex('#a3243f'),
    rust: hex('#8a4422'),
    haze: hex('#7f8bb0'),
  },
};

/**
 * An emission nebula after the Orion Nebula: a glowing blue-white heart, a
 * great pink-red cavity wall wrapping round it, rust dust lanes cutting
 * through, and a cool grey-blue haze at the edges.
 *
 * Built by rejection sampling a noise-shaped density, so the gas has
 * filaments and holes rather than being a sprayed blob. Each point's sampled
 * position is kept as a parameter, so `spread` can open the same cloud out
 * across the whole screen (Numbers / Proof) and the Connected screen simply
 * gathers it back in.
 */
function orionParams(count: number, seed: number) {
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const kind = new Uint8Array(count); // 0 heart, 1 body, 2 dust edge, 3 wings, 4 M43
  const n1 = new Float32Array(count);
  const n2 = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let px = 0;
    let py = 0;
    let k = 3;
    const roll = rand();
    if (roll < 0.035) {
      // The Trapezium: a small, tight heart.
      px = g() * 0.045;
      py = g() * 0.045;
      k = 0;
    } else if (roll < 0.06) {
      // M43: the small round companion below.
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.13;
      px = -0.18 + Math.cos(a) * r;
      py = -0.62 + Math.sin(a) * r;
      k = 4;
    } else {
      for (let tries = 0; tries < 60; tries++) {
        px = (rand() * 2 - 1) * 1.25;
        py = (rand() * 2 - 1) * 1.05;
        // The glowing body: lopsided up and to the right of the heart.
        const body = Math.exp(-(((px - 0.18) / 0.62) ** 2) - (((py - 0.16) / 0.55) ** 2));
        // The dark bay cutting in from the lower left, with a ragged edge.
        const bayEdge = -0.08 + 0.12 * (fbm(px * 3 + 2, py * 3 - 5) - 0.5) + 0.35 * (px + 0.1);
        const bay = smooth(-0.04, 0.06, bayEdge - py) * smooth(0.0, -0.25, px + 0.05);
        // Long faint wings sweeping out to the left and top.
        const r = Math.hypot(px, py);
        const wing = Math.exp(-(((r - 0.85) / 0.28) ** 2)) * smooth(-0.2, 0.6, -px + py * 0.4) * 0.5;
        const fil = Math.pow(ridge(px * 3.6 + 7.7, py * 3.6 + 2.2), 3);
        const tex = 0.35 + 0.95 * fbm(px * 2.4 + 3.1, py * 2.4 - 1.7);
        const dBody = body * (0.25 + 1.1 * fil) * tex * (1 - 0.92 * bay);
        const dWing = wing * (0.3 + 0.9 * fil) * tex;
        if (rand() < dBody + dWing) {
          k = dBody >= dWing ? (fil > 0.55 ? 1 : body > 0.55 ? 1 : 2) : 3;
          break;
        }
      }
    }
    x[i] = px;
    y[i] = py;
    z[i] = g() * (k === 3 ? 0.3 : 0.16);
    kind[i] = k;
    n1[i] = g();
    n2[i] = g();
  }
  return { x, y, z, kind, n1, n2 };
}

function renderOrion(
  f: Figure,
  p: ReturnType<typeof orionParams>,
  light: boolean,
  spread: number,
) {
  const pal = light ? ORION_COLORS.light : ORION_COLORS.dark;
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
    const r = Math.hypot(p.x[i], p.y[i]);
    const k = p.kind[i];
    let col: RGB;
    let w: number;
    if (k === 0) {
      col = pal.heart;
      w = 0.8;
    } else if (k === 4) {
      col = mix(pal.pink, pal.heart, 0.25);
      w = 0.7;
    } else if (k === 1) {
      // Blue-white close to the heart, pink through the body, deep red upper right.
      col =
        r < 0.22
          ? mix(pal.heart, pal.blue, r / 0.22)
          : mix(pal.pink, pal.red, smooth(0.2, 0.75, r + p.x[i] * 0.3));
      w = r < 0.22 ? 0.7 : 1;
    } else if (k === 2) {
      col = mix(pal.red, pal.rust, 0.6);
      w = 0.75;
    } else {
      col = mix(pal.blue, pal.haze, smooth(0.5, 1.1, r));
      w = 0.55;
    }
    paint(f, i, col, w * (1 - 0.35 * spread));
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

const EYE_COLORS = {
  dark: {
    star: hex('#ffffff'),
    deep: hex('#123a8a'),
    blue: hex('#3f86ff'),
    teal: hex('#7cc4ff'),
    gold: hex('#ffc25a'),
    orange: hex('#ff7f2a'),
    red: hex('#d4421c'),
    haze: hex('#8a2416'),
  },
  light: {
    star: hex('#2c4f8a'),
    deep: hex('#1d3f7a'),
    blue: hex('#2f6ab0'),
    teal: hex('#3d8fb5'),
    gold: hex('#b8761f'),
    orange: hex('#c4561c'),
    red: hex('#9b2d17'),
    haze: hex('#7a2a18'),
  },
};

/**
 * The Helix, after the VISTA image: a thick grainy ring burning gold on its
 * inner edge through orange to red, fine radial fibrils combed inward (blue)
 * and outward (red) from it, a deep blue interior that darkens toward the
 * centre, a faint second loop and a wide rust haze beyond. Slightly oval and
 * tilted, the way it always looks. The Core sits in the middle as the star.
 */
export function eyeFigure(count: number, light: boolean, seed = 0xe7e1): Figure {
  const f = alloc(count);
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const pal = light ? EYE_COLORS.light : EYE_COLORS.dark;
  const SPOKES = 260;
  const tilt = -0.38;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < count; i++) {
    const roll = rand();
    let r: number;
    let th = rand() * Math.PI * 2;
    let col: RGB;
    let w: number;
    if (roll < 0.38) {
      // The ring: clumpy in angle, grainy in radius.
      for (let k = 0; k < 6; k++) {
        th = rand() * Math.PI * 2;
        if (rand() < 0.3 + 0.8 * fbm(Math.cos(th) * 3.4 + 5, Math.sin(th) * 3.4 + 2)) break;
      }
      r = 0.8 + g() * 0.075 + (fbm(Math.cos(th) * 5, Math.sin(th) * 5) - 0.5) * 0.12;
      const t = smooth(0.66, 0.98, r);
      col = t < 0.5 ? mix(pal.gold, pal.orange, t * 2) : mix(pal.orange, pal.red, (t - 0.5) * 2);
      w = 1;
    } else if (roll < 0.58) {
      // Fibrils: radial streaks either side of the ring.
      th = (Math.floor(rand() * SPOKES) / SPOKES) * Math.PI * 2 + g() * 0.004;
      if (rand() < 0.55) {
        r = 0.5 + rand() * 0.24;
        col = mix(pal.teal, pal.gold, smooth(0.55, 0.74, r));
        w = 0.8;
      } else {
        r = 0.9 + Math.pow(rand(), 1.4) * 0.3;
        col = mix(pal.orange, pal.haze, smooth(0.9, 1.2, r));
        w = 0.7;
      }
    } else if (roll < 0.8) {
      // Interior: deep blue, darker toward the centre, with faint radial grain.
      r = 0.18 + 0.5 * Math.sqrt(rand());
      th = (Math.floor(rand() * SPOKES) / SPOKES) * Math.PI * 2 + g() * 0.02;
      col = mix(pal.deep, pal.blue, smooth(0.15, 0.55, r));
      col = mix(col, pal.teal, smooth(0.5, 0.68, r) * 0.6);
      w = 0.35 + 0.5 * smooth(0.18, 0.6, r);
    } else if (roll < 0.86) {
      // A faint second loop, offset, the Helix's outer coil.
      r = 1.18 + g() * 0.04;
      th = rand() * Math.PI * 1.4 + 2.2;
      col = mix(pal.orange, pal.red, 0.6);
      w = 0.32;
    } else {
      // Wide rust haze.
      r = 1.0 + Math.abs(g()) * 0.55;
      col = pal.haze;
      w = 0.32 * (1.8 - r);
    }
    const a0 = Math.cos(th) * r * EYE_R * 1.1;
    const b0 = Math.sin(th) * r * EYE_R * 0.9;
    put(f.pos, i, a0 * ct - b0 * st, a0 * st + b0 * ct, g() * EYE_R * 0.08);
    paint(f, i, col, Math.max(0.06, w));
  }
  return f;
}

/* ── Butterfly: Other Lens ──────────────────────────────────────────────── */

const WING_L = OUTER * 1.55;
const WING_H = OUTER * 1.05;

const BUTTERFLY_COLORS = {
  dark: {
    heart: hex('#ffffff'),
    ice: hex('#bfe0ff'),
    blue: hex('#6fa8ff'),
    gold: hex('#ffbf5c'),
    orange: hex('#ff7a2c'),
    red: hex('#e2441e'),
    ember: hex('#9c2a14'),
  },
  light: {
    heart: hex('#5b2d5e'),
    ice: hex('#3f6fa8'),
    blue: hex('#2f6ab0'),
    gold: hex('#b8761f'),
    orange: hex('#c4561c'),
    red: hex('#a8341a'),
    ember: hex('#7a2412'),
  },
};

/**
 * NGC 6302, after the Hubble image: two great billowing wings pinched at a
 * white-hot waist, ice-blue glow close to the centre, gold filaments combed
 * out along each wing, the wing walls burning orange to red with darker
 * dusty patches, ragged flames past the tips, and a faint pale jet crossing
 * the waist. One wing longer than the other. Set on the diagonal by TILT.
 */
export function butterflyFigure(count: number, light: boolean, seed = 0xb7f1): Figure {
  const f = alloc(count);
  const rand = rng(seed);
  const g = gaussFrom(rand);
  const pal = light ? BUTTERFLY_COLORS.light : BUTTERFLY_COLORS.dark;
  const FIL = 36;
  const fil = Array.from({ length: FIL }, () => rand() * 2 - 1);
  /** Half-height at fraction t along a wing: pinched at the waist, billowing wide at the end. */
  const prof = (t: number, side: number) => {
    const base = Math.pow(Math.sin(Math.PI * Math.min(0.97, 0.03 + t * 0.95)), 0.5) * (0.32 + 0.9 * t);
    return base * (0.85 + 0.3 * fbm(t * 3.2 + (side > 0 ? 7 : 1), side * 2.1));
  };
  for (let i = 0; i < count; i++) {
    const roll = rand();
    const side = rand() < 0.53 ? 1 : -1;
    const len = WING_L * (side > 0 ? 1 : 0.86);
    let a: number;
    let b: number;
    let t: number;
    let col: RGB;
    let w: number;
    if (roll < 0.05) {
      // The waist: white-hot knot with an ice-blue glow.
      const rr = Math.abs(g()) * OUTER * 0.08;
      const ang = rand() * Math.PI * 2;
      a = Math.cos(ang) * rr;
      b = Math.sin(ang) * rr * 1.4;
      t = 0;
      col = mix(pal.heart, pal.ice, Math.min(1, rr / (OUTER * 0.08)));
      w = 0.9;
    } else if (roll < 0.09) {
      // The pale jet crossing the waist.
      a = g() * OUTER * 0.03;
      b = (rand() * 2 - 1) * WING_H * 1.15;
      t = 0;
      col = mix(pal.ice, pal.heart, 0.4);
      w = 0.32 * (1 - Math.abs(b) / (WING_H * 1.15));
    } else if (roll < 0.52) {
      // Filaments combed out along the wing.
      const k = fil[Math.floor(rand() * FIL)];
      t = Math.pow(rand(), 0.8);
      const hgt = prof(t, side) * WING_H;
      a = side * t * len;
      b = (k + Math.sin(t * 6 + k * 5) * 0.08) * hgt + g() * OUTER * 0.015;
      const edge = Math.abs(k);
      col = t < 0.18 ? mix(pal.ice, pal.gold, t / 0.18) : mix(pal.gold, pal.orange, smooth(0.2, 0.75, t));
      col = mix(col, pal.red, smooth(0.6, 1, edge) * 0.7);
      w = 0.95 - 0.25 * t;
    } else if (roll < 0.74) {
      // Wing walls, lumpy, burning orange to red.
      t = Math.pow(rand(), 0.75);
      const hgt = prof(t, side) * WING_H;
      a = side * t * len + g() * OUTER * 0.02;
      b = (rand() < 0.5 ? -1 : 1) * hgt * (0.9 + g() * 0.06);
      col = mix(pal.orange, pal.red, smooth(0.2, 0.8, t));
      w = 0.95;
    } else if (roll < 0.92) {
      // Fill, with darker dusty patches.
      t = rand();
      const hgt = prof(t, side) * WING_H;
      a = side * t * len;
      b = (rand() * 2 - 1) * hgt * 0.88;
      const dust = fbm(a / 70 + 3, b / 70 - 2) > 0.6;
      col = dust ? pal.ember : mix(pal.gold, pal.orange, t);
      if (t < 0.15) col = mix(pal.blue, col, t / 0.15);
      w = dust ? 0.4 : 0.55;
    } else {
      // Ragged flames past the tips.
      t = 1 + Math.abs(g()) * 0.2;
      a = side * t * len;
      b = g() * WING_H * 0.75;
      col = mix(pal.red, pal.ember, rand());
      w = 0.5;
    }
    put(f.pos, i, a, b, g() * OUTER * 0.12 * (0.4 + Math.min(1, t)));
    paint(f, i, col, w);
  }
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