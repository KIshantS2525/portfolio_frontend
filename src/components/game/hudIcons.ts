// src/components/game/hudIcons.ts
import { Block, tilesFor, tilePixels } from '@/components/game/blocks';

/**
 * HUD icons, drawn rather than shipped.
 *
 * The hotbar used to be flat CSS colour swatches, which read as a colour
 * picker rather than an inventory — a slot showing `#7a5636` tells you
 * nothing about the dirt block you actually dug up. These are the real tile
 * pixels from the world atlas, projected into a small isometric cube, so the
 * icon in the slot and the block in your hand are provably the same texture:
 * both come from `tilePixels()`, so changing a block's colour changes both
 * with no second place to update.
 *
 * Everything is a data URL built once at module scope and cached, so the
 * hotbar costs eight canvases on first paint and nothing thereafter.
 */

const ICON = 48; // output px; a multiple of 16 so pixels land on pixels
const cache = new Map<string, string>();

/** Samples a 16x16 tile's pixel grid into a flat RGBA lookup. */
function tileSampler(tile: number) {
  const px = tilePixels(tile);
  return (u: number, v: number): [number, number, number, number] => {
    const x = Math.min(15, Math.max(0, Math.floor(u * 16)));
    const y = Math.min(15, Math.max(0, Math.floor(v * 16)));
    const i = (y * 16 + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
}

function shade(c: [number, number, number, number], mul: number): string {
  const [r, g, b, a] = c;
  return `rgba(${Math.round(r * mul)},${Math.round(g * mul)},${Math.round(b * mul)},${a / 255})`;
}

/**
 * An isometric cube, drawn as three parallelograms.
 *
 * Each face is rendered by setting a canvas transform built from that face's
 * two edge vectors, then filling a unit N×N grid of texels through it. Doing
 * it this way rather than computing per-texel screen offsets by hand is the
 * whole reason the faces meet: the shared corners are shared *by
 * construction*, because all three transforms are expressed from the same
 * origin and the same two basis vectors.
 *
 * The axes are the standard 2:1 isometric pair — right is (+w, +h), left is
 * (−w, +h) — with the top face spanned by both and the sides by one of them
 * plus straight-down.
 */
export function blockIconUrl(block: Block): string {
  const key = `block:${block}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = ICON;
  canvas.height = ICON;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const [topTile, , sideTile] = tilesFor(block);
  const top = tileSampler(topTile);
  const side = tileSampler(sideTile);

  const N = 16;
  const w = ICON * 0.46; // half-width of the cube
  const h = ICON * 0.23; // vertical run of one iso step (2:1)
  const depth = ICON * 0.42; // how far the side faces drop
  const apexX = ICON / 2;
  const apexY = ICON * 0.06; // the top corner of the top face

  /**
   * Fills an N×N texel grid across the parallelogram spanned by `e1` and
   * `e2` from `(ox, oy)`. The +0.5 overdraw on each quad closes the hairline
   * seams that otherwise show between texels at fractional scales.
   */
  const fillFace = (
    ox: number, oy: number,
    e1: [number, number], e2: [number, number],
    sample: (u: number, v: number) => [number, number, number, number],
    mul: number,
  ) => {
    for (let v = 0; v < N; v++) {
      for (let u = 0; u < N; u++) {
        const c = sample(u / N, v / N);
        if (c[3] === 0) continue;
        ctx.fillStyle = shade(c, mul);
        const x0 = ox + (e1[0] * u) / N + (e2[0] * v) / N;
        const y0 = oy + (e1[1] * u) / N + (e2[1] * v) / N;
        const x1 = x0 + e1[0] / N;
        const y1 = y0 + e1[1] / N;
        const x2 = x1 + e2[0] / N;
        const y2 = y1 + e2[1] / N;
        const x3 = x0 + e2[0] / N;
        const y3 = y0 + e2[1] / N;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 0.5);
        ctx.lineTo(x1 + 0.5, y1);
        ctx.lineTo(x2, y2 + 0.5);
        ctx.lineTo(x3 - 0.5, y3);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  // Top face: from the apex, spanning down-right and down-left.
  fillFace(apexX, apexY, [w, h], [-w, h], top, 1);
  // Left face: from the left corner, spanning down-right to the bottom apex,
  // and straight down.
  fillFace(apexX - w, apexY + h, [w, h], [0, depth], side, 0.72);
  // Right face: from the bottom apex, spanning up-right, and straight down.
  fillFace(apexX, apexY + h * 2, [w, -h], [0, depth], side, 0.54);

  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/**
 * The heart, as actual pixel art rather than a CSS `clip-path` polygon.
 *
 * A clip-path heart is a smooth vector shape scaled to 18px, which fights
 * every other element in this HUD — the whole room is 16px texels and hard
 * edges. This is a 9x9 bitmap blown up with nearest-neighbour, so its
 * staircase edges match the blocks.
 */
const HEART = [
  '.XX.XX...',
  'XOOXOOX..',
  'XOOOOOX..',
  'XOOOOOX..',
  '.XOOOX...',
  '..XOX....',
  '...X.....',
];

export function heartUrl(state: 'full' | 'half' | 'empty'): string {
  const key = `heart:${state}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 4; // px per texel
  const W = 9;
  const H = HEART.length;
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const fill = state === 'empty' ? '#3b352c' : '#c2352f';
  const light = state === 'empty' ? '#4a4238' : '#e05a4d';
  const outline = '#1c1813';

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = HEART[y][x];
      if (ch === '.') continue;
      // A half heart keeps its right side hollow, so a 1-point hit is visible.
      const hollow = state === 'half' && x > 3;
      ctx.fillStyle = ch === 'X' ? outline : hollow ? '#3b352c' : y < 2 ? light : fill;
      ctx.fillRect(x * S, y * S, S, S);
    }
  }

  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
