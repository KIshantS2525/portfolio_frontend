// figures/recall/build.mjs
//
// Recall's vector search, as a card-catalogue drawer.
//
// The idea: at 2am on a Snapdragon X Elite, no vector database would install,
// so Recall's search became brute force in NumPy — every int8-quantized vector
// stored as a plain BLOB row in SQLite, the whole table compared against the
// query in one vectorised np.sum((mat - q) ** 2, axis=1), top-k by argsort.
// No index, no approximate search: at demo scale, O(n) is free.
//
// The object: a catalogue drawer (the SQLite table) holds ten cards (rows).
// Each card's top edge is a row of five tabs whose heights are its vector's
// int8 levels. The query card stands lit in a holder in front. Every card is
// compared with it at once, and the three nearest — by true squared L2 — rise
// out of the drawer together. Move the pointer and the query changes.
//
//   node figures/recall/build.mjs   → src/components/figures/recall/art.generated.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "components", "figures", "recall");

const WIDTH = 600;
const HEIGHT = 360;

// ---- The model ------------------------------------------------------------
// Ten stored rows, five dimensions each, quantized to levels 1..6.
const ROWS = [
  [5, 2, 4, 1, 3],
  [2, 5, 3, 4, 1],
  [6, 3, 2, 2, 5],
  [1, 4, 6, 3, 2],
  [3, 3, 5, 5, 2],
  [5, 1, 3, 2, 4],
  [2, 6, 2, 5, 3],
  [4, 4, 1, 6, 1],
  [6, 2, 5, 1, 4],
  [1, 5, 4, 3, 6],
];
// Queries the pointer moves between (left → right).
const QUERIES = [
  [5, 2, 3, 1, 4],
  [2, 5, 3, 4, 2],
  [4, 4, 2, 6, 1],
];
const TOP_K = 3;
const DIM = 5;

// ---- World -----------------------------------------------------------------
const PLATE = { x: -160, y: -46, w: 316, d: 92, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const DRAWER = { x: -142, y: -27, w: 222, d: 54, r: 3 };
const FLOOR_Z = 0;
const FLOOR_H = 4;
const WALL = 3.2;
const WALL_H = 26; // walls rise to here above the floor top
const CARD_X0 = -116; // first card
const CARD_STEP = 19;
const CARD_T = 2.2; // thickness along x
const CARD_D = 44; // along y
const CARD_H = 30; // body height above the floor top
const TAB_D = 7.2;
const TAB_GAP = 2;
const TAB_UNIT = 1.9; // world units per quantization level
const LIFT = 21; // how far a top-k card rises
const HOLDER_X = 112; // the query card's x

const Z0 = FLOOR_Z + FLOOR_H; // floor top
const tabY = (i) => -CARD_D / 2 + 0.6 + i * (TAB_D + TAB_GAP);

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [CARD_X0, 0, Z0 + CARD_H + 6 * TAB_UNIT + LIFT], [HOLDER_X, 0, Z0 + CARD_H + 6 * TAB_UNIT + 4]],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: 40, elevation: 40 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 6.4, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -4.5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

// The drawer, split so the cards sit between its back walls and its front walls.
const D_IN = k.insetPlan(DRAWER, WALL);
function drawerBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(DRAWER, 0, 1, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(DRAWER, FLOOR_Z, FLOOR_H, P, 4, 0.6), { tone: "mid" }));
  // Far wall (−y) and far end (−x).
  out.push(S(k.slabOf({ x: DRAWER.x, y: DRAWER.y, w: DRAWER.w, d: WALL, r: 1 }, Z0, WALL_H, P, 2, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf({ x: DRAWER.x, y: DRAWER.y, w: WALL, d: DRAWER.d, r: 1 }, Z0, WALL_H, P, 2, 0.5), { tone: "mid" }));
  // Floor rails the cards stand in, and the follower block behind them with its knob.
  for (const y of [-12, 12]) out.push(L(k.lineOnTop([D_IN.x, y], [D_IN.x + D_IN.w, y], Z0, P), { tone: "faint" }));
  const follower = { x: CARD_X0 - 13, y: -22, w: 7, d: 44, r: 1.2 };
  out.push(S(k.slabOf(follower, Z0, 20, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf({ x: follower.x + follower.w, y: -2, w: 3, d: 4, r: 0.8 }, Z0 + 13, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(follower.x + follower.w + 5, 0, 2.6, Z0 + 11.6, 5.8, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(follower.x + follower.w + 5, 0, 2.6, Z0 + 11.6, Z0 + 17.4, 16, P), { tone: "lo" }));
  out.push(D([at([follower.x + 3.5, -17, Z0 + 20]), at([follower.x + 3.5, 17, Z0 + 20])], { size: 0.4 }));
  return out.join("");
}

function drawerFront() {
  const out = [];
  // Near wall (+y), then the near end (+x) with its label holder and pull.
  out.push(S(k.slabOf({ x: DRAWER.x, y: DRAWER.y + DRAWER.d - WALL, w: DRAWER.w, d: WALL, r: 1 }, Z0, WALL_H, P, 2, 0.5), { tone: "mid", inner: L(k.sideSeam({ x: DRAWER.x, y: DRAWER.y + DRAWER.d - WALL, w: DRAWER.w, d: WALL, r: 1 }, Z0 + 6, P, 2), { tone: "faint" }) }));
  const end = { x: DRAWER.x + DRAWER.w - WALL, y: DRAWER.y, w: WALL, d: DRAWER.d, r: 1 };
  out.push(S(k.slabOf(end, Z0, WALL_H, P, 2, 0.5), { tone: "mid" }));
  const fx = DRAWER.x + DRAWER.w;
  // Label holder: a brass frame with three printed lines and two rivets.
  const box = [[-11, Z0 + 21], [11, Z0 + 21], [11, Z0 + 13], [-11, Z0 + 13]];
  out.push(`<path class="iso-fill" style="fill:var(--anatomy-face)" d="${k.pathOf(box.map(([y, z]) => at([fx, y, z])), true)}"/>`);
  out.push(L(k.pathOf(box.map(([y, z]) => at([fx, y, z])), true), { tone: "mid" }));
  [[-8, Z0 + 18.6, 5], [-8, Z0 + 16.4, 1], [-8, Z0 + 14.9, 7]].forEach(([y0, z, y1]) => out.push(L(k.segment([fx, y0, z], [fx, y1, z], P), { tone: "lo", free: true })));
  out.push(D([at([fx, -13, Z0 + 17]), at([fx, 13, Z0 + 17])], { size: 0.45 }));
  // Cup pull below the holder.
  out.push(S(k.slabOf({ x: fx, y: -8, w: 2.4, d: 16, r: 1.2 }, Z0 + 5, 4.4, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([fx + 2.4, -6, Z0 + 9.4]), at([fx + 2.4, 6, Z0 + 9.4])], { size: 0.4 }));
  return out.join("");
}

// One card: a thin plate standing across the drawer, with a tab row on top.
function cardSvg(x, levels, { lit = false } = {}) {
  const out = [];
  const body = { x: x - CARD_T / 2, y: -CARD_D / 2, w: CARD_T, d: CARD_D, r: 0.5 };
  const tone = lit ? "hi" : "hi";
  out.push(S(k.slabOf(body, Z0 + 0.6, CARD_H - 0.6, P, 2), { tone, crease: lit ? "lo" : "faint", lit }));
  // Ruled lines on the card's face, like a catalogue card.
  for (let n = 0; n < 3; n++) {
    const z = Z0 + CARD_H - 7 - n * 5;
    out.push(L(k.segment([x + CARD_T / 2, -CARD_D / 2 + 4, z], [x + CARD_T / 2, CARD_D / 2 - (n === 1 ? 14 : 6), z], P), { tone: lit ? "mid" : "lo", free: true }));
  }
  out.push(`<g data-tabs>${tabsSvg(x, levels, lit)}</g>`);
  return out.join("");
}
function tabsSvg(x, levels, lit) {
  return levels
    .map((v, i) => S(k.slabOf({ x: x - CARD_T / 2, y: tabY(i), w: CARD_T, d: TAB_D, r: 0.5 }, Z0 + CARD_H, v * TAB_UNIT, P, 2), { tone: "hi", crease: lit ? "lo" : "faint", lit }))
    .join("");
}

function holder() {
  const out = [];
  const x = HOLDER_X;
  const foot = { x: x - 10, y: -26, w: 20, d: 52, r: 2.5 };
  out.push(`<path class="iso-halo" d="${k.haloOf(foot, 0, 1, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(foot, 0, 4, P, 3, 0.6), { tone: "mid" }));
  out.push(D(k.corners(foot, 2.6).map(([px, py]) => at([px, py, 4])), { size: 0.45 }));
  // Two jaws that grip the query card, back jaw first.
  out.push(S(k.slabOf({ x: x - CARD_T / 2 - 4, y: -20, w: 4, d: 40, r: 1 }, 4, 8, P, 2, 0.5), { tone: "mid" }));
  return out.join("");
}
function holderFront() {
  const x = HOLDER_X;
  const out = [];
  out.push(S(k.slabOf({ x: x + CARD_T / 2, y: -20, w: 4, d: 40, r: 1 }, 4, 8, P, 2, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(x + CARD_T / 2 + 6.4, 14, 2.4, 6, 4.4, P, 18), { tone: "mid" }));
  out.push(L(k.knurl(x + CARD_T / 2 + 6.4, 14, 2.4, 6, 10.4, 14, P), { tone: "lo" }));
  out.push(S(k.slabOf({ x: x + CARD_T / 2 + 4, y: 13, w: 2.4, d: 2, r: 0.5 }, 7.2, 2, P, 2), { tone: "mid", crease: "none" }));
  return out.join("");
}

// The query card stands on the holder foot, not the drawer floor.
const Q_Z = 4 - Z0;

const cardX = (i) => CARD_X0 + i * CARD_STEP;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A card-catalogue drawer holding ten cards. Each card's top edge is a row of five tabs whose heights are its stored vector. A lit query card stands in a holder in front of the drawer; the three cards whose tabs are nearest to the query's, by squared distance, rise out of the drawer together.",
  body: [
    base(),
    drawerBack(),
    ...ROWS.map((row, i) => `<g data-card="${i}">${cardSvg(cardX(i), row)}</g>`),
    drawerFront(),
    holder(),
    `<g data-part="query" transform="${k.translateAlong(P, [0, 0, Q_Z])}">${cardSvg(HOLDER_X, QUERIES[0], { lit: true })}</g>`,
    holderFront(),
  ],
});

const META = {
  title: "One-pass search",
  hint: "Move to change the query",
  stage: {
    tabindex: "0",
    role: "slider",
    "aria-label": "Vector search drawer: arrow keys change the query",
    "aria-valuemin": "1",
    "aria-valuemax": String(QUERIES.length),
    "aria-valuenow": "1",
  },
};
const MODEL = { P, ROWS, QUERIES, TOP_K, DIM, LIFT, Z0, CARD_H, CARD_T, CARD_D, TAB_D, TAB_UNIT, TAB_Y: Array.from({ length: DIM }, (_, i) => tabY(i)), HOLDER_X, Q_Z };

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "art.generated.ts"),
  `/* GENERATED by figures/recall/build.mjs — do not edit. */\n` +
    `import type { Projection } from '../iso/iso-kit';\n` +
    `export const SVG = ${JSON.stringify(svg)};\n` +
    `export const META = ${JSON.stringify(META)};\n` +
    `const M = ${JSON.stringify(MODEL)};\n` +
    `export const MODEL = { ...M, P: M.P as unknown as Projection };\n`,
);
console.log(`recall: ${(svg.length / 1024).toFixed(1)} KB of SVG, ${(svg.match(/iso-solid/g) || []).length} solids, ${(svg.match(/<path/g) || []).length} paths`);
