// src/components/game/blocks.ts
import * as THREE from 'three';

/**
 * The block palette.
 *
 * Nothing here is a Minecraft asset — no textures, no models, no names lifted
 * from that game — because that game's textures and character design are
 * someone else's copyrighted work and a portfolio is exactly the wrong place
 * to ship a copy of them. What's reused is the *idea* (a voxel world built
 * from a small set of cube types, painted with flat, slightly-noisy pixel
 * textures at a deliberately low resolution) which is a genre, not a work.
 *
 * All sixteen tiles below are drawn procedurally onto one canvas atlas at
 * runtime — see `buildAtlas()` — so there is no binary texture asset to ship
 * or to have opinions about; changing a colour is changing a hex string.
 */
export const enum Block {
  AIR = 0,
  GRASS,
  DIRT,
  STONE,
  SAND,
  LOG,
  LEAVES,
  PLANK,
  BEDRED,
  BEDWHITE,
  BOARD,
  COBBLE,
  GLASS,
  CRAFT,
}

/** What breaking a block leaves you holding. `null` means nothing drops (matches glass, beds). */
export const DROP_FOR: Partial<Record<Block, Block>> = {
  [Block.GRASS]: Block.DIRT,
  [Block.DIRT]: Block.DIRT,
  [Block.STONE]: Block.COBBLE,
  [Block.SAND]: Block.SAND,
  [Block.LOG]: Block.LOG,
  [Block.LEAVES]: Block.LEAVES,
  [Block.PLANK]: Block.PLANK,
  [Block.COBBLE]: Block.COBBLE,
  [Block.CRAFT]: Block.CRAFT,
};

/** Flat HUD swatch colours, independent of the 3D atlas — the hotbar is drawn in CSS, not painted. */
export const SWATCH: Record<number, string> = {
  [Block.DIRT]: '#7a5636',
  [Block.STONE]: '#8a8d92',
  [Block.SAND]: '#dccb8a',
  [Block.LOG]: '#6b4a30',
  [Block.LEAVES]: '#3f7d2e',
  [Block.PLANK]: '#b98850',
  [Block.COBBLE]: '#6f7378',
  [Block.GLASS]: '#a9d3de',
  [Block.CRAFT]: '#8a6a44',
};

/** Blocks rendered on the transparent pass (holes / see-through). */
export const TRANSPARENT = new Set<Block>([Block.LEAVES, Block.GLASS]);

const TILE = 16; // px per tile, kept low-res on purpose — that graininess IS the look
const COLS = 5;
const ROWS = 4;
export const ATLAS_W = TILE * COLS;
export const ATLAS_H = TILE * ROWS;

/** Tile index, row-major in the COLSxROWS grid. */
const TILE_INDEX = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  logSide: 5,
  logEnd: 6,
  leaves: 7,
  plank: 8,
  bedRedTop: 9,
  bedWhiteTop: 10,
  board: 11,
  cobble: 12,
  glass: 13,
  bedSide: 14,
  craftTop: 15,
  craftSide: 16,
} as const;

/** [top, bottom, side] tile indices per block. */
const FACE_TILES: Record<number, [number, number, number]> = {
  [Block.GRASS]: [TILE_INDEX.grassTop, TILE_INDEX.dirt, TILE_INDEX.grassSide],
  [Block.DIRT]: [TILE_INDEX.dirt, TILE_INDEX.dirt, TILE_INDEX.dirt],
  [Block.STONE]: [TILE_INDEX.stone, TILE_INDEX.stone, TILE_INDEX.stone],
  [Block.SAND]: [TILE_INDEX.sand, TILE_INDEX.sand, TILE_INDEX.sand],
  [Block.LOG]: [TILE_INDEX.logEnd, TILE_INDEX.logEnd, TILE_INDEX.logSide],
  [Block.LEAVES]: [TILE_INDEX.leaves, TILE_INDEX.leaves, TILE_INDEX.leaves],
  [Block.PLANK]: [TILE_INDEX.plank, TILE_INDEX.plank, TILE_INDEX.plank],
  [Block.BEDRED]: [TILE_INDEX.bedRedTop, TILE_INDEX.plank, TILE_INDEX.bedSide],
  [Block.BEDWHITE]: [TILE_INDEX.bedWhiteTop, TILE_INDEX.plank, TILE_INDEX.bedSide],
  [Block.BOARD]: [TILE_INDEX.board, TILE_INDEX.board, TILE_INDEX.board],
  [Block.COBBLE]: [TILE_INDEX.cobble, TILE_INDEX.cobble, TILE_INDEX.cobble],
  [Block.GLASS]: [TILE_INDEX.glass, TILE_INDEX.glass, TILE_INDEX.glass],
  [Block.CRAFT]: [TILE_INDEX.craftTop, TILE_INDEX.plank, TILE_INDEX.craftSide],
};

export function tilesFor(block: Block): [number, number, number] {
  return FACE_TILES[block] ?? [TILE_INDEX.stone, TILE_INDEX.stone, TILE_INDEX.stone];
}

export function uvRect(tile: number) {
  const col = tile % COLS;
  const row = Math.floor(tile / COLS);
  // Half-texel inset, or the nearest-filtered atlas bleeds its neighbour's
  // colour into the last row/column of pixels at grazing angles.
  const insetU = 0.5 / ATLAS_W;
  const insetV = 0.5 / ATLAS_H;
  const u0 = col / COLS + insetU;
  const v0 = 1 - (row + 1) / ROWS + insetV;
  const u1 = (col + 1) / COLS - insetU;
  const v1 = 1 - row / ROWS - insetV;
  return { u0, v0, u1, v1 };
}

/** A tiny deterministic hash — this is texture grain, not gameplay, so it doesn't need to be a real PRNG. */
function hash(x: number, y: number, seed: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453;
  return v - Math.floor(v);
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  base: string,
  seed: number,
  opts?: { speckle?: string; bands?: string; alphaHoles?: boolean },
) {
  const x0 = col * TILE;
  const y0 = row * TILE;
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash(x, y, seed);
      if (opts?.alphaHoles && n < 0.22) {
        ctx.clearRect(x0 + x, y0 + y, 1, 1);
        continue;
      }
      if (opts?.speckle && n > 0.82) {
        ctx.fillStyle = opts.speckle;
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      } else if (opts?.bands && (x + y) % 4 === 0 && n > 0.5) {
        ctx.fillStyle = opts.bands;
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
  }
}

/**
 * The painted atlas, as a canvas, built once and reused.
 *
 * Split out from `buildAtlas()` so the HUD can read the same pixels the world
 * is textured with — see hudIcons.ts. Two paint passes would mean two places
 * to change a colour, and they would drift.
 */
let atlasCanvas: HTMLCanvasElement | null = null;

function getAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paintAll(ctx);
  atlasCanvas = canvas;
  return canvas;
}

/** The 16x16 RGBA texels of one atlas tile. */
export function tilePixels(tile: number): Uint8ClampedArray {
  const canvas = getAtlasCanvas();
  const ctx = canvas.getContext('2d')!;
  const col = tile % COLS;
  const row = Math.floor(tile / COLS);
  return ctx.getImageData(col * TILE, row * TILE, TILE, TILE).data;
}

/**
 * A cube with this block's real atlas UVs on each face.
 *
 * `BoxGeometry` lays its faces out +X, -X, +Y, -Y, +Z, -Z with four vertices
 * each, so remapping the uv attribute in that order is enough to texture a
 * standalone cube from the same atlas the terrain uses. Used for dropped
 * items and anything else that needs one block rendered on its own, rather
 * than as part of the merged world mesh.
 */
export function blockBoxGeometry(block: Block, size = 1): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(size, size, size);
  const [top, bottom, side] = tilesFor(block);
  const faceTiles = [side, side, top, bottom, side, side];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const { u0, v0, u1, v1 } = uvRect(faceTiles[f]);
    const i = f * 4;
    uv.setXY(i + 0, u0, v1);
    uv.setXY(i + 1, u1, v1);
    uv.setXY(i + 2, u0, v0);
    uv.setXY(i + 3, u1, v0);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Builds the whole atlas once. Called a single time by the world builder. */
export function buildAtlas(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(getAtlasCanvas());
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function paintAll(ctx: CanvasRenderingContext2D) {
  paintTile(ctx, TILE_INDEX.grassTop % COLS, Math.floor(TILE_INDEX.grassTop / COLS), '#5fa83a', 1, { speckle: '#6fbf44', bands: '#4d8f2c' });
  paintTile(ctx, TILE_INDEX.grassSide % COLS, Math.floor(TILE_INDEX.grassSide / COLS), '#8a5a34', 2, { speckle: '#7a4c29' });
  // cap the top three rows of the side tile with grass, like a turf overhang
  ctx.fillStyle = '#5fa83a';
  ctx.fillRect((TILE_INDEX.grassSide % COLS) * TILE, Math.floor(TILE_INDEX.grassSide / COLS) * TILE, TILE, 4);
  ctx.fillStyle = '#4d8f2c';
  for (let x = 0; x < TILE; x += 2) {
    ctx.fillRect((TILE_INDEX.grassSide % COLS) * TILE + x, Math.floor(TILE_INDEX.grassSide / COLS) * TILE + 3, 1, 1);
  }

  paintTile(ctx, TILE_INDEX.dirt % COLS, Math.floor(TILE_INDEX.dirt / COLS), '#7a5636', 3, { speckle: '#6a482c', bands: '#8a6440' });
  paintTile(ctx, TILE_INDEX.stone % COLS, Math.floor(TILE_INDEX.stone / COLS), '#8a8d92', 4, { speckle: '#75787d', bands: '#9a9da2' });
  paintTile(ctx, TILE_INDEX.sand % COLS, Math.floor(TILE_INDEX.sand / COLS), '#dccb8a', 5, { speckle: '#cbb972' });
  paintTile(ctx, TILE_INDEX.logSide % COLS, Math.floor(TILE_INDEX.logSide / COLS), '#6b4a30', 6, { bands: '#54381f' });
  paintTile(ctx, TILE_INDEX.logEnd % COLS, Math.floor(TILE_INDEX.logEnd / COLS), '#c9a877', 7, { bands: '#a9865a' });
  paintTile(ctx, TILE_INDEX.leaves % COLS, Math.floor(TILE_INDEX.leaves / COLS), '#3f7d2e', 8, { speckle: '#2e5f20', alphaHoles: true });
  paintTile(ctx, TILE_INDEX.plank % COLS, Math.floor(TILE_INDEX.plank / COLS), '#b98850', 9, { bands: '#a1713e' });
  paintTile(ctx, TILE_INDEX.bedRedTop % COLS, Math.floor(TILE_INDEX.bedRedTop / COLS), '#b23a3a', 10, { speckle: '#962e2e' });
  paintTile(ctx, TILE_INDEX.bedWhiteTop % COLS, Math.floor(TILE_INDEX.bedWhiteTop / COLS), '#eae4d8', 11, { speckle: '#d8d0bf' });
  paintTile(ctx, TILE_INDEX.board % COLS, Math.floor(TILE_INDEX.board / COLS), '#d8c49a', 12, { bands: '#c2ab7d' });
  paintTile(ctx, TILE_INDEX.cobble % COLS, Math.floor(TILE_INDEX.cobble / COLS), '#6f7378', 13, { speckle: '#5a5d61', bands: '#83878c' });
  paintTile(ctx, TILE_INDEX.glass % COLS, Math.floor(TILE_INDEX.glass / COLS), 'rgba(180,215,225,0.35)', 14, {});
  paintTile(ctx, TILE_INDEX.bedSide % COLS, Math.floor(TILE_INDEX.bedSide / COLS), '#8a4646', 15, { bands: '#733a3a' });
  paintTile(ctx, TILE_INDEX.craftTop % COLS, Math.floor(TILE_INDEX.craftTop / COLS), '#a1753f', 16, { bands: '#8a6030' });
  // a crossed-grid on top, standing in for the recipe grid
  const ctx0 = (TILE_INDEX.craftTop % COLS) * TILE;
  const cty0 = Math.floor(TILE_INDEX.craftTop / COLS) * TILE;
  ctx.strokeStyle = '#5e3f1d';
  ctx.lineWidth = 1;
  for (let i = 4; i < TILE; i += 4) {
    ctx.beginPath(); ctx.moveTo(ctx0 + i, cty0 + 1); ctx.lineTo(ctx0 + i, cty0 + TILE - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ctx0 + 1, cty0 + i); ctx.lineTo(ctx0 + TILE - 1, cty0 + i); ctx.stroke();
  }
  paintTile(ctx, TILE_INDEX.craftSide % COLS, Math.floor(TILE_INDEX.craftSide / COLS), '#8a6030', 17, { bands: '#734f27', speckle: '#5e3f1d' });
}