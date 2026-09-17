// src/components/collapse/monument.ts
import * as THREE from 'three';
import { mergeRects } from '@/components/collapse/letterGrid';
import type { BlueprintName } from '@/components/collapse/blueprint';

/**
 * The page's <h1> — "Ishant / Shrivastava" — standing up out of the sheet.
 *
 * Same place, same size, same face. The heading is measured off the poster
 * (blueprint.ts) and re-drawn here at exactly the size it is printed, then
 * extruded straight up. It is the hero's name as a building, in the same sense
 * that each project block is its card as a building.
 *
 * ── Why it is not scaled up ──
 *
 * It was, for one version: letters twelve metres tall, so you could walk down
 * the strokes as streets. It was wrong twice over. Everything else in this
 * world keeps the page's own scale, and a stroke three metres wide on a
 * whole-metre grid is neither a letter nor a wall — it came out as a row of
 * lumps. So: printed size, and the name is read rather than walked.
 *
 * ── Two resolutions, on purpose ──
 *
 * The shape is built on a fine grid — CELL_M is a fifth of a metre — because at
 * printed size a stroke is well under a metre wide, and anything coarser
 * destroys the letterforms.
 *
 * Collision cannot use that grid: the player controller asks about whole-metre
 * cells and snaps the body to whole-metre faces, and nothing here can change
 * that. So a second, coarse grid is derived from the fine one — a metre cell is
 * solid once enough of it is letter — and that is what `solidAt` answers from.
 * Both come out of the same mask in the same function, so they cannot describe
 * different shapes; the coarse one is simply blunter, which at this size means
 * you walk around a word rather than between its letters.
 */

/**
 * Cell size of the shape grid, metres.
 *
 * Twenty to the metre. At printed size the cap height is around four metres, so
 * this is letters eighty cells tall: smooth curves, real counters, an actual
 * letterform. It was a fifth of a metre at first — twenty cells per letter — and
 * twenty cells is a pixel font, which is exactly why the name came out blocky.
 * The cost is one pass over a bigger grid at click time and a few thousand
 * merged boxes in a single instanced draw.
 */
const CELL_M = 0.05;

/** Supersampling when rasterising, px per cell. */
const SS = 2;

/** How much of a metre cell must be letter before the player is stopped by it. */
const SOLID_COVERAGE = 0.35;

/** Extrusion height as a multiple of cap height. Enough to be a building, low enough to still read as text. */
const HEIGHT_PER_CAP = 1.4;

const RISE_MS = 2600;
const SINK_MS = 650;

export type Monument = {
  /** World footprint, metres. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Extrusion height, metres. Derived from the heading's own cap height. */
  height: number;
  rise: (reducedMotion: boolean) => Promise<void>;
  sink: () => Promise<void>;
  solidAt: (x: number, y: number, z: number) => boolean;
  update: (now: number) => void;
  dispose: () => void;
};

export function createMonument(
  /** The city group — see cityScale.ts. */
  parent: THREE.Object3D,
  heading: BlueprintName,
  /** Poster px → world metres. */
  metresPerPx: number,
  /** The heading's printed top-left, in world metres. */
  printed: { x0: number; z0: number },
): Monument | null {
  const shape = rasterise(heading, metresPerPx);
  if (!shape) return null;

  const rects = mergeRects({ w: shape.w, h: shape.h, solid: shape.solid });
  if (rects.length === 0) return null;

  const H = Math.max(2, Math.round(shape.capM * HEIGHT_PER_CAP * 10) / 10);
  const x0 = printed.x0;
  const z0 = printed.z0;

  const root = new THREE.Group();
  root.name = 'collapse-monument';
  root.position.y = -H;
  parent.add(root);

  const groundClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  /*
   * Pale and faintly lit from within, unlike the project blocks. This is the
   * one thing in the city whose shape is the page's own words, and at printed
   * size it is small — it has to hold its own beside 18m buildings without
   * being any taller than the text was.
   */
  const wallMat = new THREE.MeshLambertMaterial({
    color: 0xd8def5,
    emissive: 0x2a3050,
    clippingPlanes: groundClip,
  });

  const mesh = new THREE.InstancedMesh(box, wallMat, rects.length);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  rects.forEach((r, i) => {
    m.makeScale(r.w * CELL_M, H, r.h * CELL_M).setPosition(
      x0 + (r.col + r.w / 2) * CELL_M,
      H / 2,
      z0 + (r.row + r.h / 2) * CELL_M,
    );
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);

  /* ── Collision, on the world's metre grid ── */

  const cellX0 = Math.floor(x0);
  const cellZ0 = Math.floor(z0);
  const cellW = Math.max(1, Math.ceil(x0 + shape.w * CELL_M) - cellX0);
  const cellD = Math.max(1, Math.ceil(z0 + shape.h * CELL_M) - cellZ0);
  const coarse = new Uint8Array(cellW * cellD);
  {
    const counts = new Uint16Array(coarse.length);
    for (let r = 0; r < shape.h; r++) {
      for (let c = 0; c < shape.w; c++) {
        if (!shape.solid[r * shape.w + c]) continue;
        const cx = Math.floor(x0 + c * CELL_M) - cellX0;
        const cz = Math.floor(z0 + r * CELL_M) - cellZ0;
        if (cx < 0 || cz < 0 || cx >= cellW || cz >= cellD) continue;
        counts[cz * cellW + cx]++;
      }
    }
    const per = Math.round(1 / CELL_M);
    const full = per * per;
    for (let i = 0; i < counts.length; i++) coarse[i] = counts[i] / full >= SOLID_COVERAGE ? 1 : 0;
  }

  /* ── Animation ── */

  let risen = 0;
  let anim: { kind: 'rise' | 'sink'; start: number; from: number; resolve: () => void; reduced: boolean } | null =
    null;

  function start(kind: 'rise' | 'sink', reduced: boolean): Promise<void> {
    anim?.resolve();
    return new Promise((resolve) => {
      anim = { kind, start: performance.now(), from: risen, resolve, reduced };
    });
  }

  return {
    bounds: { x0, x1: x0 + shape.w * CELL_M, z0, z1: z0 + shape.h * CELL_M },
    height: H,

    rise: (reduced) => start('rise', reduced),
    sink: () => start('sink', false),

    update(now) {
      if (!anim) return;
      const a = anim;
      let done = true;
      if (a.kind === 'rise') {
        if (a.reduced) {
          risen = 1;
        } else {
          const t = clamp01((now - a.start) / RISE_MS);
          risen = a.from + (1 - a.from) * (1 - Math.pow(1 - t, 3));
          if (t < 1) done = false;
        }
      } else {
        const t = clamp01((now - a.start) / SINK_MS);
        risen = a.from * (1 - t * t);
        if (t < 1) done = false;
      }
      root.position.y = -H * (1 - risen);
      if (done) {
        anim = null;
        a.resolve();
      }
    },

    solidAt(x, y, z) {
      if (y < 0 || y >= Math.floor(H * risen)) return false;
      const cx = x - cellX0;
      const cz = z - cellZ0;
      if (cx < 0 || cz < 0 || cx >= cellW || cz >= cellD) return false;
      return coarse[cz * cellW + cx] === 1;
    },

    dispose() {
      anim?.resolve();
      anim = null;
      parent.remove(root);
      mesh.dispose();
      box.dispose();
      wallMat.dispose();
    },
  };
}

/**
 * Draws the heading at its printed size and samples it into the fine grid.
 *
 * Everything is the page's: family, weight, style, size, line height, letter
 * spacing, capitalisation, left alignment. The only conversion is poster px →
 * world metres → grid cells, so a letter 130px tall on the page is
 * 130 × metresPerPx metres of city, and the two lines sit the same distance
 * apart here as they do up there.
 */
function rasterise(
  heading: BlueprintName,
  metresPerPx: number,
): { w: number; h: number; solid: Uint8Array<ArrayBuffer>; capM: number } | null {
  const lines = heading.lines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  /* Canvas px per world metre, and therefore canvas px per poster px. */
  const ppm = SS / CELL_M;
  const scale = metresPerPx * ppm;

  const fontPx = heading.fontSize * scale;
  const linePx = heading.lineHeight * scale;
  const font = `${heading.fontStyle} ${heading.fontWeight} ${fontPx}px ${heading.fontFamily}`;

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.font = font;
  const capPx = probe.measureText('H').actualBoundingBoxAscent;
  if (!capPx || !isFinite(capPx)) return null;

  const widths = lines.map((l) => probe.measureText(l).width);
  const cw = Math.ceil(Math.max(...widths) + 4);
  const ch = Math.ceil(linePx * lines.length + 4);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = font;
  if ('letterSpacing' in ctx && heading.letterSpacing !== 'normal') {
    ctx.letterSpacing = `${parseFloat(heading.letterSpacing) * scale}px`;
    ctx.font = font;
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    /* Half the leading above the cap, then the cap — where the browser puts the baseline. */
    const half = (linePx - capPx) / 2;
    ctx.fillText(line, 2, 2 + linePx * i + half + capPx);
  });

  const px = ctx.getImageData(0, 0, cw, ch).data;
  const w = Math.floor(cw / SS);
  const h = Math.floor(ch / SS);
  const solid = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let sum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          sum += px[((r * SS + sy) * cw + (c * SS + sx)) * 4 + 3];
        }
      }
      solid[r * w + c] = sum / (SS * SS * 255) > 0.45 ? 1 : 0;
    }
  }
  return { w, h, solid, capM: capPx / ppm };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}