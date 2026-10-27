// figures/omnitrace/build.mjs
//
// OmniTrace, as a go/no-go inspection bench.
//
// The idea: OmniTrace's diagnostics are fourteen deterministic rules, each a
// direct comparison between values already recorded on a span — no model call.
// The example from the write-up: a retrieval step that asked for four
// documents and got three back, with no error raised.
//
// The object: a carriage carries three span fixtures under a gauge head. Each
// fixture has four seats (k = 4 requested); each returned document is a gauge
// block in a seat. Four spring plungers drop onto the seats. Where a block is
// missing, its plunger drops six units further onto the bare seat, and one of
// the fourteen rule lamps on the beam lights. Nothing is inferred: the lamp is
// a comparison of two heights, the way the rule is a comparison of two numbers.
//
//   node figures/omnitrace/build.mjs   → src/components/figures/omnitrace/art.generated.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "components", "figures", "omnitrace");

const WIDTH = 600;
const HEIGHT = 360;

// ---- The model ------------------------------------------------------------
const K = 4; // documents each retrieval span asked for
const RULES = 14;
const RULE_COUNT = 2; // index of "retrieval returned fewer than requested": rule 03
const SPANS = [
  { c: -50, got: [1, 1, 1, 1] },
  { c: 0, got: [1, 1, 1, 0] }, // asked 4, got 3 — the nearest seat is empty
  { c: 50, got: [1, 1, 1, 1] },
];
const SEAT_Y = [-16.5, -5.5, 5.5, 16.5];

// ---- World -----------------------------------------------------------------
const PLATE = { x: -154, y: -66, w: 308, d: 132, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

const RAIL_Y = [-25, 20];
const RAIL_X = [-140, 140];
const CAR = { x: -80, y: -28, w: 160, d: 56, r: 3 };
const CAR_Z = 3;
const CAR_TOP = 8;
const FIX_W = 38;
const FIX_D = 46;
const FIX_TOP = 15;
const DOC = { w: 10, d: 6.4 };
const DOC_TOP = 23;

const POST_Y = 48;
const POST_R = 4;
const HEAD = { x: -6.5, y: -22, w: 13, d: 44, r: 2 };
const HEAD_Z = 58;
const BEAM = { x: -7, y: -55, w: 14, d: 110, r: 2 };
const BEAM_Z = 84;
const BEAM_TOP = 94;
const TIP_R = 2.6;
const TIP_H = 2.4;
const ROD_R = 1.1;
const RETRACT = 34; // tip height while the carriage indexes
const LOWEST = FIX_TOP; // a tip can come to rest on a bare seat, never lower over a fixture
const STRIP = { x: -132, y: 31, w: 264, d: 7, r: 1 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(BEAM, BEAM_Z, BEAM_TOP)],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 58 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---- Static: base ----------------------------------------------------------
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // Ruler strip the carriage's index pointer reads against.
  out.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 4, 6, STRIP.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.topTicks(-0.0001, 0.0001, 4, 1, STRIP.y + 0.8, 0.6, [4.8, 4.8], P).major, { tone: "hi" }));
  out.push(D([at([STRIP.x + 2, STRIP.y + 3.5, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3.5, 0.6])], { size: 0.45 }));

  // Label plate, back left: three rule lines for printed text and two screws.
  const label = { x: -140, y: -60, w: 44, d: 15, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  [[-133, -55.5, -106], [-133, -52, -114], [-133, -48.5, -110]].forEach(([x0, y, x1]) =>
    out.push(L(k.lineOnTop([x0, y], [x1, y], 0.8, P), { tone: "lo", free: true })),
  );
  out.push(D([at([label.x + 3, label.y + label.d / 2, 0.8]), at([label.x + label.w - 3, label.y + label.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

function rails() {
  const out = [];
  for (const y of RAIL_Y) {
    const plan = { x: RAIL_X[0], y, w: RAIL_X[1] - RAIL_X[0], d: 5, r: 1 };
    out.push(S(k.slabOf(plan, 0, 3, P, 3, 0.4), { tone: "mid" }));
    out.push(D([-120, -60, 0, 60, 120].map((x) => at([x, y + 2.5, 3])), { size: 0.4 }));
  }
  for (const x of [RAIL_X[0] - 6, RAIL_X[1] + 1]) {
    out.push(S(k.slabOf({ x, y: -28, w: 5, d: 56, r: 1.2 }, 0, 8, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2.5, -23, 8]), at([x + 2.5, 23, 8])], { size: 0.45 }));
  }
  return out.join("");
}

function post(y) {
  const out = [];
  const pad = { x: -8, y: y - 8, w: 16, d: 16, r: 2 };
  out.push(S(k.slabOf(pad, 0, 4, P, 3, 0.5), { tone: "mid" }));
  out.push(D(k.corners(pad, 2.6).map(([x, yy]) => at([x, yy, 4])), { size: 0.45 }));
  out.push(S(k.cylinder(0, y, 5.4, 4, 4, P, 28, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(0, y, POST_R, 8, BEAM_Z - 6 - 8, P, 28), { tone: "mid", crease: "none", inner: L([30, 50].map((z) => k.sideArc(0, y, POST_R, z, P, 16)).join(""), { tone: "faint" }) }));
  out.push(S(k.cylinder(0, y, 5.4, BEAM_Z - 6, 6, P, 28, 0.4), { tone: "mid" }));
  // Thumb screw on the outer side of the top collar.
  const sx = 0;
  const sy = y + Math.sign(y) * 5.4;
  out.push(S(k.slabOf({ x: sx - 1.2, y: Math.min(sy, sy + Math.sign(y) * 2.4), w: 2.4, d: 2.4, r: 0.6 }, BEAM_Z - 4.6, 2.6, P, 2), { tone: "mid", crease: "none" }));
  return out.join("");
}

// ---- Moving: carriage and fixtures (built at carriage offset 0) ------------
function carriage() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CAR, 3), CAR_Z, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(CAR, CAR_Z, CAR_TOP - CAR_Z, P, 5, 0.6), { tone: "mid", inner: L(k.sideSeam(CAR, 5.5, P, 5), { tone: "faint" }) }));
  // Guide blocks over the rails at each end, low, with their screws.
  for (const x of [CAR.x + 3, CAR.x + CAR.w - 11]) {
    for (const y of [RAIL_Y[0] - 1, RAIL_Y[1] - 1]) {
      const plan = { x, y, w: 8, d: 7, r: 1 };
      out.push(S(k.slabOf(plan, CAR_TOP, 2, P, 2, 0.4), { tone: "mid" }));
      out.push(D([at([x + 4, y + 3.5, CAR_TOP + 2])], { size: 0.4 }));
    }
  }
  out.push(D([-64, -44, -26, 26, 44, 64].map((x) => at([x, CAR.y + CAR.d - 2.4, CAR_TOP])), { size: 0.4, tone: "lo" }));
  // Index pointer on the front edge, over the ruler.
  out.push(S(k.extrude([[-1.8, CAR.y + CAR.d], [1.8, CAR.y + CAR.d], [0, CAR.y + CAR.d + 5]], CAR_Z + 1, 2, P), { tone: "hi", crease: "lo" }));
  // Handle: neck and knurled knob on the front face, right end.
  const hx = CAR.x + CAR.w - 18;
  out.push(S(k.slabOf({ x: hx - 2, y: CAR.y + CAR.d - 1, w: 4, d: 4, r: 1 }, CAR_Z + 0.6, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(hx, CAR.y + CAR.d + 4.4, 3, CAR_Z - 0.4, 5, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(hx, CAR.y + CAR.d + 4.4, 3, CAR_Z - 0.4, CAR_Z + 4.6, 18, P), { tone: "lo" }));
  return out.join("");
}

const fixPlan = (c) => ({ x: c - FIX_W / 2, y: -FIX_D / 2, w: FIX_W, d: FIX_D, r: 2 });
const docPlan = (c, y) => ({ x: c - DOC.w / 2, y: y - DOC.d / 2, w: DOC.w, d: DOC.d, r: 0.8 });

function fixture(span, index) {
  const { c, got } = span;
  const plan = fixPlan(c);
  const out = [];
  out.push(S(k.slabOf(plan, CAR_TOP, FIX_TOP - CAR_TOP, P, 3, 0.5), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2.4), FIX_TOP, P, 3), { tone: "faint" }));
  out.push(D(k.corners(plan, 3.4).map(([x, y]) => at([x, y, FIX_TOP])), { size: 0.45 }));
  // Span number, as tally dots on the +x face: one, two or three.
  out.push(
    D(
      Array.from({ length: index + 1 }, (_, n) => at([plan.x + plan.w, -3 + n * 3, CAR_TOP + 3])),
      { size: 0.55, tone: "hi" },
    ),
  );
  // Seats, back to front, each with its block if one came back.
  SEAT_Y.forEach((y, i) => {
    const dp = docPlan(c, y);
    out.push(L(k.planOutline(k.insetPlan(dp, -1), FIX_TOP, P, 3), { tone: got[i] ? "faint" : "lo" }));
    out.push(D([at([c - DOC.w / 2 - 2.2, y, FIX_TOP]), at([c + DOC.w / 2 + 2.2, y, FIX_TOP])], { size: 0.35, tone: "lo" }));
    if (got[i]) {
      out.push(S(k.slabOf(dp, FIX_TOP, DOC_TOP - FIX_TOP, P, 2, 0.4), { tone: "hi", crease: "lo" }));
      out.push(L(k.planOutline(k.insetPlan(dp, 1.4), DOC_TOP, P, 2), { tone: "faint" }));
    }
  });
  return out.join("");
}

// ---- Gauge head, plungers, beam -------------------------------------------
function plunger(i) {
  // Built resting on a bare seat (tip at LOWEST); the live loop lifts it.
  const y = SEAT_Y[i];
  const lit = i === 3;
  const out = [];
  out.push(S(k.cylinder(0, y, ROD_R, LOWEST + TIP_H, HEAD_Z + (RETRACT - LOWEST) + 4 - LOWEST - TIP_H, P, 16), { tone: lit ? "hi" : "mid", crease: "none", lit }));
  out.push(S(k.cylinder(0, y, TIP_R, LOWEST, TIP_H, P, 20, 0.3), { tone: "hi", crease: "lo", lit }));
  return out.join("");
}

function head() {
  const out = [];
  // Guide bushings under the head, one per plunger.
  for (const y of SEAT_Y) out.push(S(k.cylinder(0, y, 2.1, HEAD_Z - 3, 3, P, 20), { tone: "mid" }));
  out.push(S(k.slabOf(HEAD, HEAD_Z, BEAM_Z - HEAD_Z, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(HEAD, HEAD_Z + 4, P, 3), { tone: "faint" }) }));
  // A nameplate on the front face: a raised rim, three rule lines for printed text.
  const fx = HEAD.x + HEAD.w;
  const box = [[-12, 67], [12, 67], [12, 77], [-12, 77]];
  out.push(`<path class="iso-fill" style="fill:var(--anatomy-face)" d="${k.pathOf(box.map(([y, z]) => at([fx, y, z])), true)}"/>`);
  out.push(L(k.pathOf(box.map(([y, z]) => at([fx, y, z])), true), { tone: "lo" }));
  [[-9, 74.4, 6], [-9, 72, 1], [-9, 69.6, 4]].forEach(([y0, z, y1]) => out.push(L(k.segment([fx, y0, z], [fx, y1, z], P), { tone: "lo", free: true })));
  // Four screws on the front face, and a spring-preload knob on the +y end.
  out.push(D([[-18, 64], [18, 64], [-18, 78], [18, 78]].map(([y, z]) => at([HEAD.x + HEAD.w, y, z])), { size: 0.45 }));
  out.push(S(k.slabOf({ x: -1.4, y: HEAD.y + HEAD.d, w: 2.8, d: 2.4, r: 0.6 }, 70, 3, P, 2), { tone: "mid", crease: "none" }));
  return out.join("");
}

const LAMP_Y = Array.from({ length: RULES }, (_, i) => -45.5 + i * 7);
function beam() {
  const out = [];
  out.push(S(k.slabOf(BEAM, BEAM_Z, BEAM_TOP - BEAM_Z, P, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(BEAM, BEAM_Z + 3, P, 3), { tone: "faint" }) }));
  out.push(D([-51, 51].flatMap((y) => [at([-3.5, y, BEAM_TOP]), at([3.5, y, BEAM_TOP])]), { size: 0.45 }));
  // Fourteen rule lamps along the top: a bezel ring and a lens, one per rule.
  LAMP_Y.forEach((y, i) => {
    out.push(
      `<g data-lamp="${i}">` +
        L(k.ring(0, y, 2.3, BEAM_TOP, P, 28), { tone: "lo" }) +
        `<path class="fig-lens" d="${k.ring(0, y, 1.25, BEAM_TOP, P, 20)}"/>` +
        `</g>`,
    );
  });
  return out.join("");
}

// ---- Assemble ---------------------------------------------------------------
const START = -SPANS[0].c;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An inspection bench. A carriage carries three span fixtures under a gauge head with four spring plungers. Each fixture has four seats for documents; the middle one is missing its nearest document, so when it passes under the head that plunger drops onto the bare seat and the third of fourteen rule lamps lights.",
  body: [
    base(),
    rails(),
    post(-POST_Y),
    `<g data-layer>`,
    `<g data-part="carriage" transform="${k.translateAlong(P, [START, 0, 0])}">${carriage()}</g>`,
    ...SPANS.map((s, i) => `<g data-fixture="${i}" transform="${k.translateAlong(P, [START, 0, 0])}">${fixture(s, i)}</g>`),
    `<g data-part="plungers">${SEAT_Y.map((_, i) => `<g data-plunger="${i}">${plunger(i)}</g>`).join("")}</g>`,
    `<g data-part="head">${head()}</g>`,
    `</g>`,
    post(POST_Y),
    beam(),
  ],
});

const META = {
  title: "Rule engine",
  hint: "Hover to index the spans",
  stage: {
    tabindex: "0",
    role: "slider",
    "aria-label": "Inspection bench: arrow keys move the carriage from span to span",
    "aria-valuemin": "1",
    "aria-valuemax": "3",
    "aria-valuenow": "1",
    "aria-valuetext": "Span 1: asked 4, got 4, no findings",
  },
};

const MODEL = {
  P,
  K,
  RULES,
  RULE_COUNT,
  SPANS,
  SEAT_Y,
  FIX_W,
  DOC_W: DOC.w,
  CAR_TOP,
  FIX_TOP,
  DOC_TOP,
  TIP_R,
  LOWEST,
  RETRACT,
  START,
  REACH: [-60, 60],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "art.generated.ts"),
  `/* GENERATED by figures/omnitrace/build.mjs — do not edit. */\n` +
    `export const SVG = ${JSON.stringify(svg)};\n` +
    `export const META = ${JSON.stringify(META)} as const;\n` +
    `import type { Projection } from '../iso/iso-kit';\n` +
    `const M = ${JSON.stringify(MODEL)};\n` +
    `export const MODEL = { ...M, P: M.P as unknown as Projection };\n`,
);
console.log(`omnitrace: ${(svg.length / 1024).toFixed(1)} KB of SVG, ${(svg.match(/iso-solid/g) || []).length} solids, ${(svg.match(/<path/g) || []).length} paths`);
