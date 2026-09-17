// src/components/collapse/letterGrid.ts

/**
 * Turns a filled glyph mask into walkable hollow letterforms.
 *
 * Pure functions over a grid of 1m cells, no three.js and no DOM, so they can
 * be tested on their own — which matters, because every rule here exists to
 * stop the monument shipping a place the player can see but not reach.
 *
 * The pipeline, in order:
 *
 *   1. HOLLOW. Keep only the cells of each stroke within WALL cells of its edge.
 *      The middle of every stroke becomes an open-air courtyard.
 *
 *   2. NO SLOTS. Any open space narrower than MIN_STREET cells — a courtyard in
 *      a stroke only just too thick to hollow, the gap between two letters, the
 *      tiny counter inside an A — is filled solid. The plan's rule: a street you
 *      can see but not walk is worse than no street.
 *
 *   3. GATES. Hollow outlines are, by definition, closed: every courtyard and
 *      every counter is walled in on all sides. The plan never said how you get
 *      in, and without an answer the letter streets are sealed rooms. So every
 *      enclosed space gets a MIN_STREET-wide gate cut to the outside, along the
 *      shortest straight line — preferring the side facing the player's approach
 *      when two cuts cost the same.
 *
 *   4. MERGE. Greedy rectangle merge, so a few thousand solid cells become a few
 *      hundred boxes.
 */

/** Wall thickness, cells (metres). */
export const WALL = 2;

/** Narrowest open space kept open, cells. Wide enough to walk, and to read as a street. */
export const MIN_STREET = 3;

/** Longest gate that will be cut. A space further than this from the outside stays sealed. */
const MAX_GATE = 40;

export type Grid = { w: number; h: number; solid: Uint8Array<ArrayBuffer> };

export type Rect = { col: number; row: number; w: number; h: number };

/**
 * @param filled   1 where the glyph is, 0 elsewhere. Row 0 is the FAR side
 *                 (away from the approaching player), last row the near side.
 */
export function hollowLetters(filled: Uint8Array, w: number, h: number): Grid {
  /* 1. Chebyshev distance from every glyph cell to the nearest non-glyph cell. */
  const dist = chebyshevDistance(filled, w, h);
  const interior = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) interior[i] = filled[i] && dist[i] > WALL ? 1 : 0;

  let solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = filled[i] && !interior[i] ? 1 : 0;

  /* 2. Open the empty space: anything a MIN_STREET square cannot fit in goes solid. */
  const empty = invert(solid);
  const opened = open(empty, w, h, (MIN_STREET - 1) / 2);
  solid = invert(opened);

  /* 3. Gates. */
  cutGates(solid, w, h);

  return { w, h, solid };
}

/** Greedy merge of solid cells into rectangles. Row-runs first, then grown downward while identical. */
export function mergeRects(grid: Grid): Rect[] {
  const { w, h, solid } = grid;
  const used = new Uint8Array(w * h);
  const rects: Rect[] = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = row * w + col;
      if (!solid[i] || used[i]) continue;
      let rw = 0;
      while (col + rw < w && solid[i + rw] && !used[i + rw]) rw++;
      let rh = 1;
      grow: while (row + rh < h) {
        const base = (row + rh) * w + col;
        for (let k = 0; k < rw; k++) if (!solid[base + k] || used[base + k]) break grow;
        rh++;
      }
      for (let r = 0; r < rh; r++) for (let k = 0; k < rw; k++) used[(row + r) * w + col + k] = 1;
      rects.push({ col, row, w: rw, h: rh });
    }
  }
  return rects;
}

/* ── internals ─────────────────────────────────────────────────────────── */

function invert(a: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ? 0 : 1;
  return out;
}

/** Two-pass chamfer transform with unit weights in all eight directions. Outside the grid counts as empty. */
function chebyshevDistance(filled: Uint8Array, w: number, h: number): Uint16Array {
  const INF = 0xffff;
  const d = new Uint16Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = filled[i] ? INF : 0;
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= w || r >= h ? 0 : d[r * w + c]);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(c - 1, r) + 1, at(c - 1, r - 1) + 1, at(c, r - 1) + 1, at(c + 1, r - 1) + 1);
    }
  }
  for (let r = h - 1; r >= 0; r--) {
    for (let c = w - 1; c >= 0; c--) {
      const i = r * w + c;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(c + 1, r) + 1, at(c + 1, r + 1) + 1, at(c, r + 1) + 1, at(c - 1, r + 1) + 1);
    }
  }
  return d;
}

/** Square-kernel morphology. `edge` is what lies outside the grid. */
function morph(a: Uint8Array, w: number, h: number, radius: number, erode: boolean): Uint8Array<ArrayBuffer> {
  if (radius <= 0) return a.slice();
  const edge = erode ? 1 : 0;
  /* Separable: rows, then columns. */
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let v = erode ? 1 : 0;
      for (let k = -radius; k <= radius; k++) {
        const cc = c + k;
        const s = cc < 0 || cc >= w ? edge : a[r * w + cc];
        if (erode ? !s : s) {
          v = erode ? 0 : 1;
          break;
        }
      }
      tmp[r * w + c] = v;
    }
  }
  for (let c = 0; c < w; c++) {
    for (let r = 0; r < h; r++) {
      let v = erode ? 1 : 0;
      for (let k = -radius; k <= radius; k++) {
        const rr = r + k;
        const s = rr < 0 || rr >= h ? edge : tmp[rr * w + c];
        if (erode ? !s : s) {
          v = erode ? 0 : 1;
          break;
        }
      }
      out[r * w + c] = v;
    }
  }
  return out;
}

function open(a: Uint8Array, w: number, h: number, radius: number): Uint8Array<ArrayBuffer> {
  return morph(morph(a, w, h, radius, true), w, h, radius, false);
}

/** 4-connected labels of empty cells. Label 1 is reserved for whatever touches the grid border. */
function labelEmpty(solid: Uint8Array, w: number, h: number): Int32Array {
  const label = new Int32Array(w * h);
  const stack: number[] = [];
  let next = 2;
  const flood = (start: number, id: number) => {
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const i = stack.pop() as number;
      const c = i % w;
      const r = (i - c) / w;
      const n = [c > 0 ? i - 1 : -1, c < w - 1 ? i + 1 : -1, r > 0 ? i - w : -1, r < h - 1 ? i + w : -1];
      for (const j of n) {
        if (j >= 0 && !solid[j] && !label[j]) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
  };
  for (let c = 0; c < w; c++) {
    for (const r of [0, h - 1]) {
      const i = r * w + c;
      if (!solid[i] && !label[i]) flood(i, 1);
    }
  }
  for (let r = 0; r < h; r++) {
    for (const c of [0, w - 1]) {
      const i = r * w + c;
      if (!solid[i] && !label[i]) flood(i, 1);
    }
  }
  for (let i = 0; i < w * h; i++) if (!solid[i] && !label[i]) flood(i, next++);
  return label;
}

/**
 * Cuts a gate from every enclosed space to the outside.
 *
 * Repeated until nothing enclosed remains (or nothing more can be cut), because
 * one gate can open a space into another enclosed space rather than straight
 * outside — the counter of an R opening into the courtyard of its bowl — and
 * that space then needs its own way out, or the first gate led nowhere.
 */
function cutGates(solid: Uint8Array, w: number, h: number) {
  const half = (MIN_STREET - 1) / 2;
  /* Down (toward the near side, where the player approaches) first, so it wins ties. */
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];

  for (let pass = 0; pass < 64; pass++) {
    const label = labelEmpty(solid, w, h);
    /* The cheapest gate for each enclosed space, all cut in the same pass. */
    const best = new Map<number, { c: number; r: number; dc: number; dr: number; len: number; rank: number }>();

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const id = label[r * w + c];
        if (id <= 1) continue;
        for (let rank = 0; rank < dirs.length; rank++) {
          const [dc, dr] = dirs[rank];
          /* Only from cells right against a wall in this direction — anywhere else the walk starts through open space. */
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= w || nr >= h || !solid[nr * w + nc]) continue;
          const current = best.get(id);
          const bestCost = current?.len ?? Infinity;
          /*
           * Equal-length cuts are allowed through so the direction ranking can
           * break the tie — otherwise scan order would, and scan order starts at
           * the far side, which is the one side nobody arrives from.
           */
          const beats = (len: number) => len < bestCost || (len === bestCost && rank < (current?.rank ?? 99));
          /* The gate is MIN_STREET wide, so the cells either side of the start must be in the same space. */
          const pc = dr !== 0 ? 1 : 0;
          const pr = dc !== 0 ? 1 : 0;
          let ok = true;
          for (let k = -half; k <= half; k++) {
            const cc = c + pc * k;
            const rr = r + pr * k;
            if (cc < 0 || rr < 0 || cc >= w || rr >= h || label[rr * w + cc] !== id) ok = false;
          }
          if (!ok) continue;
          /* Walk outward until the whole band is in a different open space. */
          for (let len = 1; len <= MAX_GATE && len <= bestCost; len++) {
            const bc = c + dc * len;
            const br = r + dr * len;
            let arrived = true;
            let inBounds = true;
            for (let k = -half; k <= half; k++) {
              const cc = bc + pc * k;
              const rr = br + pr * k;
              if (cc < 0 || rr < 0 || cc >= w || rr >= h) {
                inBounds = false;
                break;
              }
              const j = rr * w + cc;
              if (solid[j] || label[j] === id) arrived = false;
            }
            if (!inBounds) break;
            if (arrived) {
              if (beats(len)) best.set(id, { c, r, dc, dr, len, rank });
              break;
            }
          }
        }
      }
    }

    if (best.size === 0) return;
    for (const g of best.values()) {
      const pc = g.dr !== 0 ? 1 : 0;
      const pr = g.dc !== 0 ? 1 : 0;
      for (let s = 1; s < g.len; s++) {
        for (let k = -half; k <= half; k++) {
          solid[(g.r + g.dr * s + pr * k) * w + (g.c + g.dc * s + pc * k)] = 0;
        }
      }
    }
  }
}