// figures/diagramstudio/build.mjs
//
// DiagramStudio, as a punched-tape reader driving a layout board.
//
// The idea: the model writes DiagramDSL, not geometry. A hand-written lexer,
// parser and resolver compile the DSL to an ELK layout graph, so layout is
// deterministic — and the DSL text is the real document: the AST, the layout,
// the canvas and every export are rebuilt from it. That is why text editing
// and visual editing can never disagree.
//
// The object: the DSL is a paper tape, one row per line. One hole declares a
// node; two holes declare an edge between the nodes on those tracks. A reader
// head's pins drop through the holes as rows pass, and a layout board behind it
// raises a block for each node read and draws each edge read, routed
// orthogonally the way ELK routes them. The board is a pure function of how
// much tape has been read: wind it back and the diagram unbuilds exactly.
//
//   node figures/diagramstudio/build.mjs → src/components/figures/diagramstudio/art.generated.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "components", "figures", "diagramstudio");

const WIDTH = 600;
const HEIGHT = 360;

// ---- The model: the document --------------------------------------------
const NODES = ["api", "auth", "db", "cache"];
const LINES = [
  { holes: [0], text: "node api" },
  { holes: [1], text: "node auth" },
  { holes: [0, 1], text: "api -> auth" },
  { holes: [2], text: "node db" },
  { holes: [0, 2], text: "api -> db" },
  { holes: [3], text: "node cache" },
  { holes: [1, 3], text: "auth -> cache" },
  { holes: [2, 3], text: "db -> cache" },
];

// ---- World -----------------------------------------------------------------
const PLATE = { x: -122, y: -64, w: 244, d: 112, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const CHANNEL = { x: -112, y: 4, w: 224, d: 38, r: 1.5 };
const CH_TOP = 1.6;
const TAPE = { x: -106, y: 8, w: 212, d: 30, r: 0.4 };
const TAPE_TOP = CH_TOP + 0.4;
const TRACK_Y = [12.5, 18.5, 27.5, 33.5];
const SPROCKET_Y = 23;
const ROW = 13; // tape pitch between DSL lines
const HOLE_R = 2.2;
const RX = -56; // the reader's x
const WINDOW = [TAPE.x + 8, TAPE.x + TAPE.w - 8]; // tape visible between the guides

const BOARD = { x: -98, y: -58, w: 142, d: 50, r: 3 };
const BOARD_TOP = 10;
const NODE_AT = [
  [-66, -33],
  [-28, -45],
  [-28, -21],
  [10, -33],
];
const NODE = { w: 16, d: 10 };
const NODE_H = 8;
const EDGE = {
  "0-1": [[-58, -33], [-47, -33], [-47, -45], [-36, -45]],
  "0-2": [[-58, -33], [-47, -33], [-47, -21], [-36, -21]],
  "1-3": [[-20, -45], [-9, -45], [-9, -33], [2, -33]],
  "2-3": [[-20, -21], [-9, -21], [-9, -33], [2, -33]],
};

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [RX, 2, 28], [RX, 46, 28]],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: 50, elevation: 38 },
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

// A flat ribbon from the reader's back block to the board, lying on the plate.
function ribbon() {
  // A flat ribbon from the reader's back block to the board's front face: the only link between them.
  const out = [];
  const y0 = BOARD.y + BOARD.d;
  out.push(S(k.slabOf({ x: RX - 3, y: y0, w: 6, d: -y0 + 0.5, r: 0.3 }, 0, 0.7, P, 2), { tone: "lo", crease: "faint" }));
  out.push(L(k.lineOnTop([RX - 1, y0], [RX - 1, 0.5], 0.7, P), { tone: "faint" }), L(k.lineOnTop([RX + 1, y0], [RX + 1, 0.5], 0.7, P), { tone: "faint" }));
  out.push(S(k.slabOf({ x: RX - 4.5, y: y0, w: 9, d: 3, r: 0.6 }, 0, 4.5, P, 2, 0.4), { tone: "mid" }));
  out.push(D([at([RX - 2.5, y0 + 1.5, 4.5]), at([RX + 2.5, y0 + 1.5, 4.5])], { size: 0.4 }));
  return out.join("");
}

function board() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BOARD, 0, 1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(BOARD, 0, BOARD_TOP, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(BOARD, 3.5, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BOARD, 3.5), BOARD_TOP, P, 4), { tone: "lo" }));
  out.push(D(k.corners(BOARD, 2).map(([x, y]) => at([x, y, BOARD_TOP])), { size: 0.45 }));
  // A grid of locating holes the layout snaps to: a pegboard, not decoration.
  const grid = [];
  for (let x = BOARD.x + 9; x <= BOARD.x + BOARD.w - 8; x += 6)
    for (let y = BOARD.y + 7; y <= BOARD.y + BOARD.d - 6; y += 6) grid.push([x, y]);
  const free = grid.filter(([x, y]) => !NODE_AT.some(([nx, ny]) => Math.abs(x - nx) < NODE.w / 2 + 3 && Math.abs(y - ny) < NODE.d / 2 + 3));
  out.push(D(free.map(([x, y]) => at([x, y, BOARD_TOP])), { size: 0.35, tone: "lo" }));
  // Node seats: where each block will stand once its line is read.
  NODE_AT.forEach(([x, y]) => out.push(L(k.planOutline({ x: x - NODE.w / 2 - 1, y: y - NODE.d / 2 - 1, w: NODE.w + 2, d: NODE.d + 2, r: 1.2 }, BOARD_TOP, P, 3), { tone: "faint" })));
  // Edges, each drawn on the board top and shown once its line is read.
  for (const [key, route] of Object.entries(EDGE)) {
    const d = k.onTop(route, BOARD_TOP, P);
    out.push(
      `<g data-edge="${key}" class="fig-edge">` +
        L(d, { tone: "hi" }) +
        D([at([...route[0], BOARD_TOP]), at([...route[route.length - 1], BOARD_TOP])], { size: 0.9, tone: "hi" }) +
        `</g>`,
    );
  }
  // Label plate on the board's front (+y) face.
  const fy = BOARD.y + BOARD.d;
  const box = [[BOARD.x + 106, 2.4], [BOARD.x + 134, 2.4], [BOARD.x + 134, 8], [BOARD.x + 106, 8]];
  out.push(`<path class="iso-fill" style="fill:var(--anatomy-face)" d="${k.pathOf(box.map(([x, z]) => at([x, fy, z])), true)}"/>`);
  out.push(L(k.pathOf(box.map(([x, z]) => at([x, fy, z])), true), { tone: "mid" }));
  [[109, 6.2, 126], [109, 4.2, 118]].forEach(([x0, z, x1]) => out.push(L(k.segment([BOARD.x + x0, fy, z], [BOARD.x + x1, fy, z], P), { tone: "lo", free: true })));
  return out.join("");
}

// The tape and its rows of holes. Holes and sprockets live in a group that the
// live loop slides along x, clipped to the window between the two guides.
function tape() {
  const out = [];
  out.push(S(k.slabOf(CHANNEL, 0, CH_TOP, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf(TAPE, CH_TOP, 0.4, P, 2), { tone: "hi", crease: "none" }));
  const clip = k.pathOf([[WINDOW[0], TAPE.y], [WINDOW[1], TAPE.y], [WINDOW[1], TAPE.y + TAPE.d], [WINDOW[0], TAPE.y + TAPE.d]].map(([x, y]) => at([x, y, TAPE_TOP])), true);
  const rows = LINES.map((line, i) => {
    const x = -(i + 1) * ROW; // row i is under the reader once i + 1 lines have passed
    return line.holes.map((t) => `<path class="fig-hole" d="${k.ring(x, TRACK_Y[t], HOLE_R, TAPE_TOP, P, 20)}"/>`).join("");
  }).join("");
  // Sprocket holes every half row, along the full punched length and a lead-in either side.
  const sprockets = [];
  for (let x = ROW; x >= -(LINES.length + 2) * ROW; x -= ROW / 2) sprockets.push(at([x, SPROCKET_Y, TAPE_TOP]));
  const rules = Array.from({ length: LINES.length + 1 }, (_, i) => -(i + 0.5) * ROW)
    .map((x) => L(k.lineOnTop([x, TAPE.y], [x, TAPE.y + TAPE.d], TAPE_TOP, P), { tone: "faint" }))
    .join("");
  out.push(
    `<clipPath id="ds-tape"><path d="${clip}"/></clipPath>` +
      `<g clip-path="url(#ds-tape)"><g data-part="holes">${rules}${rows}${D(sprockets, { size: 0.6, tone: "lo" })}</g></g>`,
  );
  // Track guide lines printed on the tape edges, running edge to edge of the window.
  for (const y of [TAPE.y + 1.6, TAPE.y + TAPE.d - 1.6]) out.push(L(k.lineOnTop([WINDOW[0], y], [WINDOW[1], y], TAPE_TOP, P), { tone: "faint" }));
  return out.join("");
}

function guides() {
  const out = [];
  for (const x0 of [TAPE.x - 4, TAPE.x + TAPE.w - 8]) {
    const g = { x: x0, y: 2, w: 12, d: 42, r: 1.6 };
    out.push(S(k.slabOf(g, 0, 7, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(g, 2.6, P, 3), { tone: "faint" }) }));
    out.push(D([at([x0 + 6, 5.5, 7]), at([x0 + 6, 40.5, 7])], { size: 0.45 }));
  }
  return out.join("");
}

// Capstan on the right guide: a knurled knob whose pointer turns with the tape.
const CAP = [TAPE.x + TAPE.w - 2, 23];
const CAP_R = 6;
const CAP_Z = 7;
function capstan() {
  const out = [];
  out.push(S(k.cylinder(CAP[0], CAP[1], 3.4, CAP_Z, 2, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(CAP[0], CAP[1], CAP_R, CAP_Z + 2, 5, P, 36, 0.5), { tone: "mid" }));
  out.push(L(k.knurl(CAP[0], CAP[1], CAP_R, CAP_Z + 2, CAP_Z + 7, 36, P), { tone: "lo" }));
  return out.join("");
}
const capPointer = (turn) =>
  k.lineOnTop([CAP[0], CAP[1]], [CAP[0] + Math.cos(turn) * (CAP_R - 1.4), CAP[1] + Math.sin(turn) * (CAP_R - 1.4)], CAP_Z + 7, P);

// The reader: two side blocks, a bar across, four sensing pins.
const BAR_Z = [18, 25];
function readerBack() {
  const back = { x: RX - 6, y: 0, w: 12, d: 6, r: 1 };
  return S(k.slabOf(back, 0, BAR_Z[0], P, 2, 0.5), { tone: "mid" }) + D([at([RX - 3, 3, BAR_Z[0]]), at([RX + 3, 3, BAR_Z[0]])], { size: 0.4 });
}
const PIN_TOP = BAR_Z[0] - 2;
function pin(t) {
  // Built dropped (tip in the hole); the live loop lifts the ones that read paper.
  const y = TRACK_Y[t];
  return (
    S(k.cylinder(RX, y, 1, TAPE_TOP - 1.2 + 2, PIN_TOP + 3 - (TAPE_TOP - 1.2 + 2), P, 14), { tone: "hi", crease: "none" }) +
    S(k.cylinder(RX, y, 1.8, TAPE_TOP - 1.2, 2, P, 18), { tone: "hi", crease: "lo" })
  );
}
function readerFront() {
  const out = [];
  for (const y of TRACK_Y) out.push(S(k.cylinder(RX, y, 2, PIN_TOP, 2, P, 18), { tone: "mid" }));
  const bar = { x: RX - 6, y: 0, w: 12, d: 46, r: 1.4 };
  out.push(S(k.slabOf(bar, BAR_Z[0], BAR_Z[1] - BAR_Z[0], P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(bar, BAR_Z[0] + 2.4, P, 3), { tone: "faint" }) }));
  out.push(D([at([RX, 4, BAR_Z[1]]), at([RX, 42, BAR_Z[1]])], { size: 0.45 }));
  // Four tell-tale windows on the bar's top, one per track: lit when that pin reads a hole.
  TRACK_Y.forEach((y, t) => out.push(`<path class="fig-tell" data-tell="${t}" d="${k.ring(RX, y, 1.5, BAR_Z[1], P, 18)}"/>`));
  out.push(S(k.slabOf({ x: RX - 6, y: 40, w: 12, d: 6, r: 1 }, 0, BAR_Z[0], P, 2, 0.5), { tone: "mid" }));
  return out.join("");
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A punched-tape reader beside a layout board. Each row of the tape is one line of a diagram's text: one hole declares a node, two holes an edge between them. As the tape passes the reader, its pins drop through the holes, and the board raises a block for each node read and draws each edge read, routed at right angles. Winding the tape back takes the diagram apart in the same order.",
  body: [
    base(),
    ribbon(),
    board(),
    `<g data-part="nodes">${NODE_AT.map((_, i) => `<g data-node="${i}"></g>`).join("")}</g>`,
    tape(),
    guides(),
    capstan(),
    `<path data-part="capstan" class="iso-line" data-tone="hi" d="${capPointer(0)}" style="stroke-width:1"/>`,
    readerBack(),
    `<g data-part="pins">${TRACK_Y.map((_, t) => `<g data-pin="${t}">${pin(t)}</g>`).join("")}</g>`,
    readerFront(),
  ],
});

const META = {
  title: "Text is the document",
  hint: "Move to wind the tape",
  stage: {
    tabindex: "0",
    role: "slider",
    "aria-label": "Tape reader: arrow keys read the diagram text one line at a time",
    "aria-valuemin": "0",
    "aria-valuemax": String(LINES.length),
    "aria-valuenow": "0",
  },
};
const MODEL = { P, NODES, LINES, TRACK_Y, ROW, HOLE_R, RX, NODE_AT, NODE, NODE_H, BOARD_TOP, CAP, CAP_R, CAP_Z, TAPE_TOP, LIFT: 1.2 };

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "art.generated.ts"),
  `/* GENERATED by figures/diagramstudio/build.mjs — do not edit. */\n` +
    `import type { Projection } from '../iso/iso-kit';\n` +
    `export const SVG = ${JSON.stringify(svg)};\n` +
    `export const META = ${JSON.stringify(META)};\n` +
    `const M = ${JSON.stringify(MODEL)};\n` +
    `export const MODEL = { ...M, P: M.P as unknown as Projection };\n`,
);
console.log(`diagramstudio: ${(svg.length / 1024).toFixed(1)} KB of SVG, ${(svg.match(/iso-solid/g) || []).length} solids, ${(svg.match(/<path/g) || []).length} paths`);
