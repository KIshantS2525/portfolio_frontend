// src/components/game/world.ts
import * as THREE from 'three';
import { Block, TRANSPARENT, tilesFor, uvRect, buildAtlas, DROP_FOR } from '@/components/game/blocks';
import { paintSign, paintSignTitle } from '@/components/game/noticeBoard';
import { Water } from '@/components/game/water';
import { Chest, MapBoard } from '@/components/game/props';
import {
  buildCanopyBed, buildBookshelf, buildRug, buildHangingLantern,
  buildFramedArt, buildPottedPlant, buildBarrel, buildFireplace, buildDoor,
} from '@/components/game/decor';
import type { Project, Profile } from '@/lib/content';

/**
 * One side of the island, in blocks.
 *
 * 140² is a little over ten times the area of the old 44². At that size a
 * single merged mesh is no longer viable — it was ~19k columns before and is
 * ~196k now, and rebuilding all of it on every block edit would freeze the
 * tab. So the terrain is chunked and streamed instead; see `CHUNK` below.
 */
export const SIZE = 140;

/**
 * Chunk edge, in blocks. 16 is the usual choice and holds up here: small
 * enough that one rebuild after a block edit is imperceptible, large enough
 * that the draw-call count stays sane (a 140-wide world is 9×9 chunks).
 */
export const CHUNK = 16;
const CHUNKS_PER_SIDE = Math.ceil(SIZE / CHUNK);
export const WATER_Y = 3;
export const MAX_H = 20;
const CENTER = SIZE / 2;
const PLATEAU_R = 10; // flattened disc the house sits on — grown to match the bigger house
/**
 * The island's base elevation.
 *
 * This was 3 — the same number as WATER_Y — which is why the first build came
 * out flooded rather than solid: a third of the map generated at or under the
 * water plane, so instead of ground you got isolated grass-topped slabs
 * poking through a sea. Land has to start several blocks clear of the water
 * for a coastline to read as a shore instead of a swamp, so the base sits
 * well above it and the shore falloff below is what brings it back down.
 */
const BASE_H = 8;

/* ── tiny value noise ──────────────────────────────────────────────────────
 * No noise library in the dependency tree, and this world doesn't need
 * simplex-grade quality — a hashed lattice with smoothstep interpolation
 * gives rolling hills that are visibly terrain rather than static, which is
 * all a 44×44 island needs. Two octaves for a bit of small-scale bump on top
 * of the large-scale rise and fall.
 */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function heightAtRaw(x: number, z: number): number {
  const big = valueNoise(x * 0.07, z * 0.07) * 5;
  const small = valueNoise(x * 0.22 + 40, z * 0.22 + 40) * 2;
  let h = BASE_H + big + small;
  // Flatten toward a fixed height near the centre so the house has level ground.
  const d = Math.hypot(x - CENTER, z - CENTER);
  if (d < PLATEAU_R + 3) {
    const t = 1 - Math.min(1, Math.max(0, (d - PLATEAU_R) / 3));
    h = h + (BASE_H + 2 - h) * t;
  }
  /*
   * Coastline falloff. Only the outermost few blocks drop, and they drop hard
   * — a gentle ramp over a third of the map is what produced the flooded
   * middle. `shore` is deliberately narrow so the playable interior stays at
   * full height and the sea is a rim, not a condition of the whole island.
   */
  /*
   * The coast, in three bands rather than one ramp.
   *
   * A single falloff — however wide — gives a constant slope, and a constant
   * slope crossing three height units produces a beach about two blocks deep
   * no matter how far out you start it. The sand was there; there was just
   * never anywhere to stand on it. So the shelf is explicit: deep water at the
   * rim, then a genuinely flat sand terrace, then a blend back up to the
   * island's real height. Noise is almost entirely damped on the terrace,
   * because bumps are what turn a beach back into a row of islets.
   */
  const edgeDist = Math.min(x, z, SIZE - 1 - x, SIZE - 1 - z);
  const SURF_END = 3;    // below this, seabed rising to the waterline
  const BEACH_END = 7;   // flat sand terrace ends here
  const BLEND_END = 11;  // fully back to inland height
  const SHELF = WATER_Y + 1.7;

  if (edgeDist < BEACH_END) {
    const t = Math.min(1, Math.max(0, edgeDist / SURF_END));
    const e = t * t * (3 - 2 * t);
    h = (WATER_Y - 2.5) + (SHELF - (WATER_Y - 2.5)) * e;
    h += (big + small) * 0.10; // just enough variation to avoid a dead-flat plane
  } else if (edgeDist < BLEND_END) {
    const t = (edgeDist - BEACH_END) / (BLEND_END - BEACH_END);
    const e = t * t * (3 - 2 * t);
    h = SHELF + (h - SHELF) * e;
  }

  return Math.max(0, Math.min(MAX_H - 1, Math.round(h)));
}

export type Heightmap = Uint8Array;

export function buildHeightmap(): Heightmap {
  const hm = new Uint8Array(SIZE * SIZE);
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      hm[z * SIZE + x] = heightAtRaw(x, z);
    }
  }
  return hm;
}

function inBounds(x: number, z: number) {
  return x >= 0 && x < SIZE && z >= 0 && z < SIZE;
}

/** Extra single-block overrides layered on top of the terrain: the house, the trees, and anything placed at runtime. */
type Overlay = Map<string, Block>;
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

function addTree(overlay: Overlay, hm: Heightmap, x: number, z: number) {
  if (!inBounds(x, z)) return;
  const base = hm[z * SIZE + x];
  for (let i = 0; i < 3; i++) overlay.set(key(x, base + 1 + i, z), Block.LOG);
  const top = base + 4;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        overlay.set(key(x + dx, top + dy, z + dz), Block.LEAVES);
      }
    }
  }
  overlay.set(key(x, top + 2, z), Block.LEAVES);
}

/**
 * The house. One big hall now, not four walls around a bed — and, per the
 * cozy-cabin build spec, no longer a flat plank box either: a visible stone
 * foundation, a two-tone wood band (lighter main floor, darker upper storey)
 * split by a log belt course, real framed picture windows instead of single
 * scattered glass blocks, a covered entrance porch on log posts, a wider
 * roof overhang with a dark eave trim, a short stone path, and a few bush
 * clusters at the corners.
 *
 * What this deliberately does NOT attempt: true stairs/slab/fence geometry,
 * a physically separate upper floor, or a full wraparound balcony. Every
 * block here is a full cube — that's this engine's entire vocabulary — so
 * "balcony" and "staircase" read as banding, framing and a porch roof
 * instead of the partial-height shapes the spec's reference image uses.
 * That's a real ceiling on how far this can go without a new geometry
 * system for non-cube blocks, not an oversight.
 */
export type HouseInfo = {
  doorX: number;
  doorZ: number;
  bedPos: THREE.Vector3;
  baseY: number;
  cx: number;
  cz: number;
  half: number;
  /** How many rows tall the doorway opening is, from `baseY + 1`. */
  doorH: number;
  /** Wall height in rows, from `baseY + 1` to the belt course. */
  wallH: number;
};

/** A framed picture window: a vertical log post either side, log sill and lintel, glass in between. */
type WindowSpec = { start: number; glassW: number; y0: number; y1: number };

function buildHouse(overlay: Overlay, hm: Heightmap): HouseInfo {
  const cx = Math.round(CENTER);
  const cz = Math.round(CENTER);
  const base = hm[cz * SIZE + cx];
  const half = 7; // interior half-width — a 15x15 great room, up from 7x7
  const wallH = 5; // taller too, so the room doesn't feel like a corridor
  const doorX = cx;
  const doorZ = cz + half;
  const doorH = 3; // door rises through the lower band, matching wallH's taller walls

  // Two-tone wood banding: a lighter main floor low, a darker upper storey
  // just under the eaves, tied together by a log belt course at the top.
  const bandSplit = base + 1 + Math.floor(wallH / 2); // rows below this: main floor; at/above: upper storey
  const beltY = base + wallH; // the row just under the roofline

  /**
   * Windows per wall, given as an explicit glass-column range (`start` to
   * `start + glassW - 1`, offset from the wall's centre) rather than a
   * centre point — with integer block coordinates a "centre ± half-width"
   * formula can't actually land on two columns for an even width, since the
   * two nearest columns are each half a block off-centre. An explicit range
   * has no such rounding trap. Kept well clear of corners and the door.
   *
   * The west and east walls get only one window each, and deliberately at
   * opposite ends (west near the door, east near the back) — those two
   * walls are also where every project plaque hangs (see the gallery
   * section below), so the goal here is real architectural windows without
   * eating the wall space the gallery actually needs. The front wall carries
   * no plaques at all, so it's free to be the windowed focal point the spec
   * asks for.
   */
  const windows: Record<'N' | 'S' | 'E' | 'W', WindowSpec[]> = {
    S: [
      { start: -(half - 1), glassW: 3, y0: base + 2, y1: base + 4 },
      { start: half - 4, glassW: 3, y0: base + 2, y1: base + 4 },
    ],
    // North keeps just one window (east end) — the west end is the bed nook.
    N: [{ start: half - 4, glassW: 3, y0: base + 2, y1: base + 4 }],
    // One window near the door end — the rest of the wall stays clear for plaques.
    W: [{ start: half - 4, glassW: 3, y0: base + 2, y1: base + 4 }],
    // One window near the back end, mirrored to the opposite end from the
    // west wall's — asymmetric on purpose, and it leaves the *other* end of
    // this wall clear for plaques too.
    E: [{ start: -(half - 1), glassW: 3, y0: base + 2, y1: base + 4 }],
  };

  /** Resolves which wall (if any) a wall cell belongs to, and its along-wall offset from centre. */
  const wallOf = (x: number, z: number): { side: 'N' | 'S' | 'E' | 'W'; along: number } | null => {
    if (z === cz - half) return { side: 'N', along: x - cx };
    if (z === cz + half) return { side: 'S', along: x - cx };
    if (x === cx - half) return { side: 'W', along: z - cz };
    if (x === cx + half) return { side: 'E', along: z - cz };
    return null;
  };

  for (let x = cx - half; x <= cx + half; x++) {
    for (let z = cz - half; z <= cz + half; z++) {
      // Flatten the footprint to `base` so walls don't sit on stepped terrain.
      for (let y = hm[z * SIZE + x] + 1; y <= base; y++) overlay.set(key(x, y, z), Block.DIRT);
      const wall = wallOf(x, z);
      if (!wall) continue;
      for (let y = base + 1; y < base + 1 + wallH; y++) {
        const isDoorway = x === doorX && z === doorZ && y <= base + doorH;
        if (isDoorway) continue;
        const corner = (x === cx - half || x === cx + half) && (z === cz - half || z === cz + half);
        if (corner) { overlay.set(key(x, y, z), Block.LOG); continue; }
        if (y === beltY) { overlay.set(key(x, y, z), Block.LOG); continue; } // the belt course, uninterrupted
        const win = windows[wall.side].find((w) => wall.along >= w.start - 1 && wall.along <= w.start + w.glassW);
        if (win) {
          const inGlassCols = wall.along >= win.start && wall.along <= win.start + win.glassW - 1;
          const isFramePost = !inGlassCols; // the column immediately either side of the glass
          const isGlass = inGlassCols && y >= win.y0 && y <= win.y1;
          const isSillOrLintel = inGlassCols && (y === win.y0 - 1 || y === win.y1 + 1);
          if (isFramePost || isSillOrLintel) { overlay.set(key(x, y, z), Block.LOG); continue; }
          if (isGlass) { overlay.set(key(x, y, z), Block.GLASS); continue; }
        }
        overlay.set(key(x, y, z), y < bandSplit ? Block.PLANK : Block.DARKPLANK);
      }
    }
  }

  // Peaked roof: each ring in one block, rising to a ridge. A 2-block
  // overhang (was 1) and a dark eave-trim row at the lowest ring, per the
  // spec's call for a chunkier, more clearly-shingled roofline.
  const roofOverhang = 2;
  const roofBaseY = base + 1 + wallH;
  const ringMax = half + roofOverhang - 1;
  for (let ring = 0; ring <= ringMax; ring++) {
    const y = roofBaseY + ring;
    const x0 = cx - half - roofOverhang + ring;
    const x1 = cx + half + roofOverhang - ring;
    const z0 = cz - half - roofOverhang + ring;
    const z1 = cz + half + roofOverhang - ring;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const onRing = x === x0 || x === x1 || z === z0 || z === z1;
        if (onRing) overlay.set(key(x, y, z), ring === 0 ? Block.DARKPLANK : Block.PLANK);
      }
    }
  }

  // The bed now lives tucked into the north-west corner rather than centred
  // on the whole back wall — the back wall has to share the room with the
  // gallery, the chest and the map now, not just the bed.
  const bedX = cx - half + 1;
  const bedZ = cz - half + 1;
  overlay.set(key(bedX, base + 1, bedZ), Block.BEDRED);
  overlay.set(key(bedX + 1, base + 1, bedZ), Block.BEDWHITE);

  /*
   * The entrance porch: a one-block-deep covered awning over the door on
   * two log posts, per the spec's "small roof/awning" over the entrance.
   * Full-cube-only, so it's a flat slab rather than a pitched mini-roof —
   * still enough to read as a porch rather than a hole in a wall.
   */
  const porchZ = doorZ + 1;
  for (const px of [doorX - 2, doorX + 2]) {
    for (let y = base + 1; y <= base + 4; y++) overlay.set(key(px, y, porchZ), Block.LOG);
  }
  for (let x = doorX - 2; x <= doorX + 2; x++) overlay.set(key(x, base + 5, porchZ), Block.DARKPLANK);

  /*
   * A short, irregular stone path leading away from the porch (spec §19 —
   * "avoid a perfectly straight artificial path"), and a stone/cobble
   * foundation footer hugging the base of the walls (spec §4 — "should NOT
   * be perfectly uniform"). Both just overwrite the top terrain layer, so
   * they only look right where the surrounding ground is near `base`
   * height, which the widened plateau flattening keeps true immediately
   * around the house.
   */
  for (let x = cx - half - 1; x <= cx + half + 1; x++) {
    for (let z = cz - half - 1; z <= cz + half + 1; z++) {
      const onFooter = x === cx - half - 1 || x === cx + half + 1 || z === cz - half - 1 || z === cz + half + 1;
      if (!onFooter) continue;
      overlay.set(key(x, base, z), hash2(x, z) > 0.5 ? Block.STONE : Block.COBBLE);
    }
  }
  for (let i = 1; i <= 5; i++) {
    const pz = porchZ + i;
    for (let dx = -1; dx <= 1; dx++) {
      if (hash2(cx + dx, pz + 0.5) > 0.55) continue; // irregular, not a solid rectangle
      overlay.set(key(cx + dx, base, pz), Block.STONE);
    }
  }

  // Bush clusters at the four exterior corners (spec §17 — "use vegetation
  // in clusters", not a hedge around the whole building).
  for (const [bx, bz] of [
    [cx - half - 1, cz - half - 1], [cx + half + 1, cz - half - 1],
    [cx - half - 1, cz + half + 1], [cx + half + 1, cz + half + 1],
  ] as const) {
    overlay.set(key(bx, base + 1, bz), Block.LEAVES);
    overlay.set(key(bx, base + 2, bz), Block.LEAVES);
  }

  return {
    doorX,
    doorZ: doorZ + 1,
    bedPos: new THREE.Vector3(bedX + 0.5, base + 1.5, bedZ + 0.5),
    baseY: base,
    cx,
    cz,
    half,
    doorH,
    wallH,
  };
}

/** Drifting cloud slabs, well above the build ceiling. */
function buildClouds(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
  });
  for (let i = 0; i < 22; i++) {
    const w = 6 + Math.random() * 12;
    const d = 5 + Math.random() * 10;
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), mat);
    cloud.position.set(
      Math.random() * 120 - 40,
      34 + Math.random() * 10,
      Math.random() * 120 - 40,
    );
    g.add(cloud);
  }
  g.name = 'clouds';
  return g;
}

function blockFor(hm: Heightmap, overlay: Overlay, removed: Set<string>, x: number, y: number, z: number): Block {
  const k = key(x, y, z);
  if (removed.has(k)) return Block.AIR;
  if (overlay.has(k)) return overlay.get(k)!;
  if (!inBounds(x, z)) return Block.AIR;
  const h = hm[z * SIZE + x];
  if (y > h) return Block.AIR;
  /*
   * Sand reaches three blocks above the waterline, not zero. Previously sand
   * appeared only on columns at or under the water, so the "beach" was the
   * strip already submerged — from dry land you stepped off grass straight
   * into the sea with no shoreline at all.
   */
  if (y === h) return h <= WATER_Y + 2 ? Block.SAND : Block.GRASS;
  if (y >= h - 2) return h <= WATER_Y + 2 ? Block.SAND : Block.DIRT;
  return Block.STONE;
}

function isSolid(hm: Heightmap, overlay: Overlay, removed: Set<string>, x: number, y: number, z: number): boolean {
  if (y < 0) return true;
  const b = blockFor(hm, overlay, removed, x, y, z);
  return b !== Block.AIR && !TRANSPARENT.has(b);
}

/**
 * Blocks that are solid for collision (`isSolid`, above) but invisible in
 * the world mesh — currently just the bed. Without this distinction, a
 * neighbouring block's face-culling check (`isSolid` on the bed cell) sees
 * "solid" and skips its own face, but the bed cell renders nothing to fill
 * that gap — the floor directly under the bed loses its top face and the
 * player can see straight through it. `isSolidForMesh` is what every
 * neighbour-visibility check in the mesher uses instead of `isSolid`, so
 * mesh-invisible cells are treated as *not* solid for that one purpose
 * while collision (`isSolid`, `isSolidAt`, `isMobSolidAt`) is untouched.
 */
const MESH_INVISIBLE = new Set<Block>([Block.BEDRED, Block.BEDWHITE]);
function isSolidForMesh(hm: Heightmap, overlay: Overlay, removed: Set<string>, x: number, y: number, z: number): boolean {
  if (y < 0) return true;
  const b = blockFor(hm, overlay, removed, x, y, z);
  if (MESH_INVISIBLE.has(b)) return false;
  return b !== Block.AIR && !TRANSPARENT.has(b);
}

/*
 * Corner order matters as much as the normal.
 *
 * Each face emits triangles (0,1,2) and (0,2,3), so the winding of the first
 * three corners is what the GPU uses to decide which side is the front — and
 * backface culling throws away everything wound the other way. `top` and
 * `bottom` were both listed anticlockwise relative to their own normals, so
 * although the `normal` attribute below was right (and lighting therefore
 * looked correct on the faces that did draw), every horizontal surface in the
 * world was being culled: you could see the sides of blocks and straight
 * through their tops and bottoms.
 *
 * The rule when editing this table: walk the four corners anticlockwise *as
 * seen from the direction the face points*. `dir` and the corner order have
 * to agree, and nothing at runtime will warn you if they don't.
 */
type Face = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
const FACE_DEFS: Record<Face, { dir: [number, number, number]; corners: [number, number, number][] }> = {
  top: { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  bottom: { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  north: { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  south: { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  east: { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  west: { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
};

class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  addFace(x: number, y: number, z: number, face: Face, tile: number) {
    const { dir, corners } = FACE_DEFS[face];
    const { u0, v0, u1, v1 } = uvRect(tile);
    const start = this.positions.length / 3;
    const uvCorners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let i = 0; i < 4; i++) {
      const [cx, cy, cz] = corners[i];
      this.positions.push(x + cx, y + cy, z + cz);
      this.normals.push(dir[0], dir[1], dir[2]);
      this.uvs.push(uvCorners[i][0], uvCorners[i][1]);
    }
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  toGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setIndex(this.indices);
    return geo;
  }
}

/**
 * A small village cottage: plank walls on a log frame, a doorway, a window,
 * and a peaked roof. Simpler than the player's house on purpose — these are
 * scenery and there are several of them, so each one is a handful of blocks
 * rather than a build.
 */
function buildCottage(overlay: Overlay, hm: Heightmap, cx: number, cz: number, w: number, d: number) {
  if (cx - w < 1 || cx + w > SIZE - 2 || cz - d < 1 || cz + d > SIZE - 2) return null;
  let base = 0;
  for (let x = cx - w; x <= cx + w; x++) {
    for (let z = cz - d; z <= cz + d; z++) base = Math.max(base, hm[z * SIZE + x]);
  }
  // Level the pad, so a cottage never straddles a slope.
  for (let x = cx - w; x <= cx + w; x++) {
    for (let z = cz - d; z <= cz + d; z++) {
      for (let y = hm[z * SIZE + x] + 1; y <= base; y++) overlay.set(key(x, y, z), Block.DIRT);
    }
  }
  const wallH = 3;
  const doorZ = cz + d;
  for (let x = cx - w; x <= cx + w; x++) {
    for (let z = cz - d; z <= cz + d; z++) {
      const onWall = x === cx - w || x === cx + w || z === cz - d || z === cz + d;
      if (!onWall) continue;
      const corner = (x === cx - w || x === cx + w) && (z === cz - d || z === cz + d);
      for (let y = base + 1; y <= base + wallH; y++) {
        if (x === cx && z === doorZ && y <= base + 2) continue; // doorway
        const window = y === base + 2 && !corner && (z === cz - d || x === cx - w || x === cx + w) && (x + z) % 2 === 0;
        overlay.set(key(x, y, z), corner ? Block.LOG : window ? Block.GLASS : Block.PLANK);
      }
    }
  }
  const roofY = base + wallH + 1;
  for (let ring = 0; ring <= Math.min(w, d); ring++) {
    for (let x = cx - w - 1 + ring; x <= cx + w + 1 - ring; x++) {
      for (let z = cz - d - 1 + ring; z <= cz + d + 1 - ring; z++) {
        const onRing = x === cx - w - 1 + ring || x === cx + w + 1 - ring
          || z === cz - d - 1 + ring || z === cz + d + 1 - ring;
        if (onRing) overlay.set(key(x, roofY + ring, z), Block.COBBLE);
      }
    }
  }
  return { doorX: cx, doorZ: doorZ + 1, base };
}

export type BuiltWorld = {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  house: HouseInfo;
  boards: { slug: string; position: THREE.Vector3; facing: number }[];
  waterMesh: THREE.Mesh;
  /** What's at this cell right now (terrain, overlay, or air). */
  getBlock: (x: number, y: number, z: number) => Block;
  /**
   * Whether this cell stops a body. This is what the player controller
   * collides against — it must agree with the mesher about what is solid, so
   * it goes through the same `isSolid` the face-culling uses rather than a
   * second opinion that could drift from it.
   */
  isSolidAt: (x: number, y: number, z: number) => boolean;
  /**
   * Same as `isSolidAt`, plus the house's doorway opening — used for every
   * mob (hostile or not) and their arrows, never the player. This is the
   * entire "gate": one column that's a wall to anything non-player, so
   * zombies can't wander in at night and the guide can't wander out.
   */
  isMobSolidAt: (x: number, y: number, z: number) => boolean;
  /** World Y of the sea surface, for the swim check. */
  waterLevel: number;
  /** The shared atlas material, reused by every dropped item. */
  itemMaterial: THREE.Material;
  /** The animated sea, updated each frame. */
  water: Water;
  /** Résumé chest, just inside the front door. */
  chest: Chest;
  chestPos: THREE.Vector3;
  /** Career map, just inside the front door on the other side. */
  mapPos: THREE.Vector3;
  /** Where the resident guide NPC starts and wanders — the centre of the great room floor. */
  guideHome: THREE.Vector3;
  /** Doorsteps of the village cottages — where townsfolk and the guardian live. */
  village: { x: number; z: number }[];
  /** Where torches should stand: doorways, cottages, and the corners of the great room. */
  torchSpots: { x: number; y: number; z: number }[];
  /**
   * Removes whatever's at this cell and returns the item it drops (or null
   * for air / undroppable blocks like glass and the bed). Session-only: this
   * mutates the in-memory heightmap/overlay, never the server, so leaving
   * `/game` and coming back regenerates a fresh island.
   */
  breakBlock: (x: number, y: number, z: number) => Block | null;
  /** Places `block` at this cell if it's currently air. Returns whether it placed. */
  placeBlock: (x: number, y: number, z: number, block: Block) => boolean;
  isInBounds: (x: number, z: number) => boolean;
  /**
   * Builds up to `budget` nearby chunks and frees distant ones. Call once per
   * frame with the player's position; returns how many chunks are still
   * missing so the loading screen knows when the spawn area is ready.
   */
  updateStreaming: (px: number, pz: number, budget?: number) => { built: number; total: number; ready: number };
  /** The drifting cloud layer, so Game.tsx can animate it — see buildClouds(). */
  clouds: THREE.Group;
  /**
   * Frees every GPU resource this world owns: all built terrain chunks, the
   * water, the chest/map/bed/sign meshes and — critically — the ~16 baked
   * canvas textures behind the project + name signs, none of which were ever
   * disposed before. `renderer.dispose()` alone does not walk the scene
   * graph disposing materials/textures, so every visit to `/game` leaked a
   * fresh set of these.
   */
  dispose: () => void;
};

export function buildWorld(projects: Project[], profile: Profile): BuiltWorld {
  const hm = buildHeightmap();
  const overlay: Overlay = new Map();
  const removed = new Set<string>();
  const house = buildHouse(overlay, hm);

  /*
   * Trees, placed procedurally rather than from a fixed list.
   *
   * The old hard-coded ten coordinates were picked for a 44-wide map; on a
   * 140-wide one they'd all huddle in one corner and the other 90% of the
   * island would be bald. This scatters them on a jittered grid, skipping
   * anything on the beach, in the sea, on the plateau or inside the village
   * pads — the same kind of placement test the cottages get, applied to a few
   * hundred candidates instead of five.
   */
  const spread = 7;
  const forest: [number, number][] = [];
  for (let gx = spread; gx < SIZE - spread; gx += spread) {
    for (let gz = spread; gz < SIZE - spread; gz += spread) {
      const jx = Math.round(gx + (hash2(gx, gz) - 0.5) * spread * 0.8);
      const jz = Math.round(gz + (hash2(gz, gx) - 0.5) * spread * 0.8);
      if (jx < 4 || jz < 4 || jx > SIZE - 5 || jz > SIZE - 5) continue;
      if (hm[jz * SIZE + jx] <= WATER_Y + 2) continue;          // beach or sea
      if (Math.hypot(jx - CENTER, jz - CENTER) < PLATEAU_R + 6) continue; // plateau
      if (hash2(jx * 3.1, jz * 7.7) > 0.72) continue;           // thin them out
      forest.push([jx, jz]);
    }
  }

  /*
   * The village: a cluster off to the north-west of the plateau, far enough
   * that it reads as a separate place you walk to.
   *
   * Positions are expressed as offsets from the centre rather than absolute
   * coordinates, so they follow the island when SIZE changes instead of
   * ending up stranded on the far shore.
   */
  const village: { x: number; z: number }[] = [];
  const VOFF = -26; // village sits this far NW of centre
  const cottageOffsets: [number, number][] = [
    [0, 0], [6, -2], [12, -2], [-2, 7], [-2, 13],
  ];
  const cottages: [number, number, number, number][] = cottageOffsets.map(
    ([ox, oz]) => [Math.round(CENTER + VOFF + ox), Math.round(CENTER + VOFF + oz), 2, 2],
  );
  for (const [cx2, cz2, w, d] of cottages) {
    const built = buildCottage(overlay, hm, cx2, cz2, w, d);
    if (built) village.push({ x: built.doorX, z: built.doorZ });
  }

  // Trees last, so they can be skipped where a cottage has already landed.
  for (const [x, z] of forest) {
    const nearCottage = cottages.some(([cx2, cz2, w, d]) =>
      x >= cx2 - w - 2 && x <= cx2 + w + 2 && z >= cz2 - d - 2 && z <= cz2 + d + 2);
    if (!nearCottage) addTree(overlay, hm, x, z);
  }

  const atlas = buildAtlas();
  const group = new THREE.Group();
  group.name = 'voxel-world';

  const opaqueMat = new THREE.MeshLambertMaterial({ map: atlas });
  const transMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'terrain';
  group.add(terrainGroup);

  /**
   * The highest block anything has ever occupied, so the remesh loop doesn't
   * scan empty sky. Raising MAX_H to lift the island above water also raised
   * the fixed ceiling this used to scan to, and since a full remesh runs on
   * every single break and place, that scan is the cost that shows up as lag
   * on each click. Tracked rather than computed: placing a block can only
   * ever raise it, and never lowering it costs one wasted layer at worst.
   */
  let ceiling = MAX_H + 2;
  for (const k of overlay.keys()) {
    const y = Number(k.split(',')[1]);
    if (y + 2 > ceiling) ceiling = y + 2;
  }

  /*
   * ── Chunked terrain with streaming ────────────────────────────────────
   *
   * Each chunk owns two meshes (opaque and cutout) and is built on demand.
   * `updateStreaming` is called every frame with the player's position and a
   * budget: it builds at most `budget` missing chunks per frame, nearest
   * first, and frees chunks that fall outside the keep radius.
   *
   * Budgeting the work per frame is the whole point of "virtual" loading —
   * meshing all 81 chunks at once is the same stall as the old full rebuild,
   * just relocated. Spreading it means the world fills in over a few frames
   * while remaining interactive, and the loading screen simply waits for the
   * chunks around spawn rather than for all of them.
   */
  type ChunkEntry = { opaque: THREE.Mesh; trans: THREE.Mesh; dirty: boolean };
  const chunks = new Map<string, ChunkEntry>();
  const chunkKey = (cx: number, cz: number) => `${cx}|${cz}`;

  function buildChunk(cx: number, cz: number) {
    const opaque = new MeshBuilder();
    const trans = new MeshBuilder();
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(SIZE, x0 + CHUNK);
    const z1 = Math.min(SIZE, z0 + CHUNK);

    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        // Start from the column's own top rather than the world ceiling:
        // most columns are far below it and scanning the empty sky above
        // every one of 196k columns is the bulk of the cost otherwise.
        const colTop = Math.min(ceiling, Math.max(hm[z * SIZE + x], MAX_H) + 8);
        for (let y = 0; y <= colTop; y++) {
          const b = blockFor(hm, overlay, removed, x, y, z);
          if (b === Block.AIR) continue;
          /*
           * The bed's two voxel cells exist purely for collision and for
           * culling the world mesh around them — the decorative
           * `buildCanopyBed` group is what's actually meant to be seen. But
           * with no special case here, the mesher painted them anyway: two
           * full-brightness, fully-saturated red/white cubes sitting right
           * through the canopy mesh, which is exactly why the bed read as
           * "a coloured block" no matter how much detail the mesh added on
           * top of it. Skipping face generation makes them invisible while
           * leaving `isSolid()` (a separate check) untouched, so they're
           * still there for collision and for sleeping.
           */
          if (b === Block.BEDRED || b === Block.BEDWHITE) continue;
          const builder = TRANSPARENT.has(b) ? trans : opaque;
          const [top, bottom, side] = tilesFor(b);
          if (!isSolidForMesh(hm, overlay, removed, x, y + 1, z)) builder.addFace(x, y, z, 'top', top);
          if (!isSolidForMesh(hm, overlay, removed, x, y - 1, z)) builder.addFace(x, y, z, 'bottom', bottom);
          if (!isSolidForMesh(hm, overlay, removed, x, y, z - 1)) builder.addFace(x, y, z, 'north', side);
          if (!isSolidForMesh(hm, overlay, removed, x, y, z + 1)) builder.addFace(x, y, z, 'south', side);
          if (!isSolidForMesh(hm, overlay, removed, x + 1, y, z)) builder.addFace(x, y, z, 'east', side);
          if (!isSolidForMesh(hm, overlay, removed, x - 1, y, z)) builder.addFace(x, y, z, 'west', side);
        }
      }
    }

    const existing = chunks.get(chunkKey(cx, cz));
    if (existing) {
      existing.opaque.geometry.dispose();
      existing.opaque.geometry = opaque.toGeometry();
      existing.trans.geometry.dispose();
      existing.trans.geometry = trans.toGeometry();
      existing.dirty = false;
      return;
    }

    const om = new THREE.Mesh(opaque.toGeometry(), opaqueMat);
    om.castShadow = true;
    om.receiveShadow = true;
    const tm = new THREE.Mesh(trans.toGeometry(), transMat);
    tm.castShadow = true;
    tm.receiveShadow = true;
    terrainGroup.add(om, tm);
    chunks.set(chunkKey(cx, cz), { opaque: om, trans: tm, dirty: false });
  }

  function disposeChunk(key: string) {
    const c = chunks.get(key);
    if (!c) return;
    terrainGroup.remove(c.opaque, c.trans);
    c.opaque.geometry.dispose();
    c.trans.geometry.dispose();
    chunks.delete(key);
  }

  /** Marks the chunk containing this cell dirty, plus neighbours on a seam. */
  function touch(x: number, y: number, z: number) {
    void y;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        // A face on a chunk boundary is culled against a block in the next
        // chunk, so editing at a seam invalidates the neighbour's mesh too.
        if (dx !== 0 && x % CHUNK !== 0 && x % CHUNK !== CHUNK - 1) continue;
        if (dz !== 0 && z % CHUNK !== 0 && z % CHUNK !== CHUNK - 1) continue;
        const c = chunks.get(chunkKey(cx + dx, cz + dz));
        if (c) c.dirty = true;
      }
    }
  }

  /*
   * At SIZE 140 the whole island is 9x9 chunks, so with a view radius of 5
   * everything stays resident and nothing is ever evicted. That is fine and
   * deliberate: the measured cost of meshing the entire world is ~16ms total,
   * and the wins chunking actually buys here are elsewhere —
   *
   *   · a block edit rebuilds one 16x16 chunk (~0.04ms) instead of the whole
   *     world (~12ms), which is the difference between instant and a hitch
   *     on every single click;
   *   · startup spreads the build across frames behind the loading screen
   *     instead of blocking in one lump.
   *
   * The eviction path still exists and still works, so raising SIZE further
   * degrades gracefully rather than needing a rewrite.
   */
  const VIEW_CHUNKS = 5;  // build radius, in chunks
  const KEEP_CHUNKS = 6;  // free anything beyond this
  /*
   * Shadow casting is a different budget from drawing. The sun's shadow
   * camera only spans ~36 blocks, so a chunk five chunks away contributes
   * nothing to the shadow map but is still submitted for it — doubling or
   * tripling the draw calls for no pixels. Only nearby chunks cast.
   */
  const SHADOW_CHUNKS = 3;

  function updateStreaming(px: number, pz: number, budget = 1): { built: number; total: number; ready: number } {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);

    const wanted: { cx: number; cz: number; d: number }[] = [];
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
        const d = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
        if (d <= VIEW_CHUNKS) wanted.push({ cx, cz, d });
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    let built = 0;
    for (const w of wanted) {
      if (built >= budget) break;
      const k = chunkKey(w.cx, w.cz);
      const c = chunks.get(k);
      if (!c) { buildChunk(w.cx, w.cz); built++; }
      else if (c.dirty) { buildChunk(w.cx, w.cz); built++; }
    }

    for (const k of Array.from(chunks.keys())) {
      const [cx, cz] = k.split('|').map(Number);
      const d = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
      if (d > KEEP_CHUNKS) { disposeChunk(k); continue; }
      const c = chunks.get(k)!;
      const casts = d <= SHADOW_CHUNKS;
      if (c.opaque.castShadow !== casts) {
        c.opaque.castShadow = casts;
        c.trans.castShadow = casts;
      }
    }

    const ready = wanted.filter((w) => chunks.has(chunkKey(w.cx, w.cz))).length;
    return { built, total: wanted.length, ready };
  }

  const water = new Water(SIZE + 36, CENTER, WATER_Y + 0.85);
  const waterMesh = water.mesh;
  waterMesh.name = 'water';
  group.add(waterMesh);

  const heightAt = (x: number, z: number) => {
    const xi = Math.max(0, Math.min(SIZE - 1, Math.round(x)));
    const zi = Math.max(0, Math.min(SIZE - 1, Math.round(z)));
    for (let y = ceiling; y >= 0; y--) {
      if (isSolid(hm, overlay, removed, xi, y, zi)) return y;
    }
    return 0;
  };

  /*
   * The gallery: every project, résumé chest, and career map now lives
   * *inside* the house instead of scattered around the island — mounted flat
   * on the interior of the two long (east/west) walls, splitting the list
   * between them. The house is built wide specifically so this fits: at
   * `half = 7` each side wall has room for a handful of plaques with clear
   * margin at the corners, the bed nook, the doorway, and — now that these
   * walls have real windows — the window each of them carries. The west
   * wall's window sits at its door (south) end, so the gallery run there
   * uses the rest of the wall (north of it); the east wall's window is
   * mirrored to the opposite end, so its gallery run sits south of it.
   *
   * The project list is admin-controlled and unbounded, so a single row per
   * wall isn't enough on its own — it would just let plaques start
   * overlapping once the count outgrew the wall length. `layoutOnWall`
   * wraps into extra rows (zig-zagging up and down from eye level) once a
   * row fills up, so adding a project in the admin panel always adds a
   * *visible, non-overlapping* plaque here rather than crowding an existing
   * one out.
   */
  const { cx, cz, half, baseY, doorH, wallH } = house;
  const floorY = baseY + 1;
  const boards: BuiltWorld['boards'] = [];
  const galleryGroup = new THREE.Group();
  galleryGroup.name = 'gallery';

  // Usable z-range on each wall: inside the corners, clear of that wall's
  // own window, and (on the west wall) clear of the bed nook too.
  // Widened after the windows grew from 2 columns to 3 (brief: "increase
  // windows and add glass to them") — each zone now keeps a full block of
  // clearance from the wider window frame and the bed-nook corner, not just
  // enough to avoid literally overlapping it, so a plaque never ends up
  // hanging close enough to a window or the bed to read as misplaced.
  const westZ0 = cz - half + 4; // clear of the bed-nook corner
  const westZ1 = cz + half - 6; // clear of the west wall's door-end window
  const eastZ0 = cz - half + 5; // clear of the east wall's back-end window
  const eastZ1 = cz + half - 3;

  const westX = cx - half + 0.52; // just proud of the interior west wall face
  const eastX = cx + half - 0.52; // just proud of the interior east wall face
  const plaqueY = floorY + 1.55; // comfortable reading height, row 0

  /** Lays `count` plaques along [z0, z1], wrapping into extra rows (zig-zagging above/below eye level) once a row is full. */
  function layoutOnWall(count: number, z0: number, z1: number, eyeY: number): { z: number; y: number }[] {
    if (count <= 0) return [];
    const span = Math.max(0.1, z1 - z0);
    const pitch = 1.05; // plaques are 0.95 wide; this leaves a visible gap between them
    const perRow = Math.max(1, Math.floor(span / pitch) + 1);
    const rowY = (r: number) => {
      if (r === 0) return eyeY;
      const step = Math.ceil(r / 2);
      return r % 2 === 1 ? eyeY + step * 0.85 : eyeY - step * 0.85;
    };
    const out: { z: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const idxInRow = i % perRow;
      const countInRow = Math.min(perRow, count - row * perRow);
      const t = countInRow > 1 ? idxInRow / (countInRow - 1) : 0.5;
      out.push({ z: z0 + t * span, y: rowY(row) });
    }
    return out;
  }

  const westCount = projects.filter((_, i) => i % 2 === 0).length;
  const eastCount = projects.length - westCount;
  const westLayout = layoutOnWall(westCount, westZ0, westZ1, plaqueY);
  const eastLayout = layoutOnWall(eastCount, eastZ0, eastZ1, plaqueY);

  let westI = 0;
  let eastI = 0;
  projects.forEach((p, i) => {
    const onWest = i % 2 === 0;
    const pos = onWest ? westLayout[westI++] : eastLayout[eastI++];

    const plaque = buildWallPlaque(p.name);
    plaque.userData.slug = p.slug;
    // A plane's default normal is +Z; rotating ±90° about Y points it into
    // the room from whichever wall it's hanging on (see the derivation in
    // the comment on buildWallPlaque below).
    const facing = onWest ? Math.PI / 2 : -Math.PI / 2;
    plaque.rotation.y = facing;
    plaque.position.set(onWest ? westX : eastX, pos.y, pos.z);
    galleryGroup.add(plaque);
    boards.push({ slug: p.slug, position: plaque.position.clone(), facing });
  });
  group.add(galleryGroup);

  // Furniture and sky, added as meshes rather than blocks.
  group.add(buildCanopyBed(house.bedPos.x, house.baseY + 1, house.bedPos.z));
  const clouds = buildClouds();
  group.add(clouds);

  // One extra sign by the door: whose world this is.
  const nameSign = buildSignMesh(profile.name, profile.title, true);
  const signY = heightAt(house.doorX, house.doorZ + 1);
  nameSign.position.set(house.doorX + 0.5, signY + 1, house.doorZ + 1.5);
  group.add(nameSign);

  /*
   * The résumé chest and the career map now flank the *inside* of the
   * doorway rather than the outside of it — the first thing you see walking
   * in, same as they used to be the first thing you saw walking up.
   */
  const chestX = cx - 2;
  const chestZ = cz + half - 2;
  const chest = new Chest(chestX + 0.5, floorY, chestZ + 0.5, Math.PI);
  group.add(chest.group);

  const mapX = cx + 2;
  const mapZ = cz + half - 2;
  const mapBoard = new MapBoard(mapX + 0.5, floorY, mapZ + 0.5, Math.PI);
  group.add(mapBoard.group);

  /*
   * Interior dressing: the brief was "warm, lived-in forest cabin", which a
   * bed, a chest and a map board don't add up to on their own — a room with
   * three interaction points and otherwise bare walls still reads as empty.
   * Each piece here gives a wall or a corner its own reason to exist: the
   * hearth is the great room's focal point (directly opposite the door, the
   * first thing you see walking in), the bookshelf and barrels are the
   * "someone actually lives here" clutter, the rugs anchor the bed and the
   * gallery floor, and the lanterns are what keeps the room from reading as
   * a dark box at night on top of the torch ring.
   *
   * Placement is hand-fit to this house's specific geometry (`half = 7`,
   * the window layout above) rather than derived generically — every one of
   * these needed to land in a gap the walls, windows, gallery and doorway
   * had already claimed, which isn't worth generalising for a single room.
   */

  // The hearth: centred on the back (north) wall, in the one stretch of it
  // that's neither the bed nook nor that wall's window.
  group.add(buildFireplace(cx + 0.5, floorY, cz - half + 0.52));

  // A bookshelf between the hearth and the bed — the "study corner" you'd
  // actually find next to someone's bed, not a showroom shelf.
  group.add(buildBookshelf(cx - 2 + 0.5, floorY, cz - half + 0.5));

  // A framed piece over the head of the bed, and one over the door — the
  // two spots every reference image of a cabin like this puts one.
  group.add(buildFramedArt(cx - half + 0.52, floorY + 1.55, cz - half + 1.5, Math.PI / 2, 3));
  group.add(buildFramedArt(cx - 2 + 0.5, floorY + 2.3, cz + half - 0.48, Math.PI, 7));

  // Firewood and stores by the hearth and the door.
  group.add(buildBarrel(cx + 1.6, floorY, cz - half + 1.3));
  group.add(buildBarrel(chestX - 1.2, floorY, chestZ + 0.6));

  // A plant beside each of the doorway fixtures.
  group.add(buildPottedPlant(chestX - 0.9, floorY, chestZ + 0.4));
  group.add(buildPottedPlant(mapX + 0.9, floorY, mapZ + 0.4));

  // Rugs: one under the bed, one anchoring the middle of the room.
  group.add(buildRug(house.bedPos.x, floorY, house.bedPos.z + 0.3, 2.6, 3.1, 0, '#4a5b66', '#dfe4e6'));
  group.add(buildRug(cx + 0.5, floorY, cz + 0.5, 3.4, 3.4, Math.PI / 4, '#6b4530', '#e8d2a0'));

  /*
   * Hanging lanterns — decoration only; each one's actual light comes from
   * the torch pool below via a matching `torchSpots` entry, the same way
   * the fireplace's does. Hung from a nominal ceiling line just under the
   * belt course, well clear of head height under `wallH`-tall walls.
   */
  const ceilingY = house.baseY + wallH + 0.6;
  const lanternSpots: { x: number; z: number }[] = [
    { x: cx + 0.5, z: cz + half - 3 }, // just inside the door
    { x: cx + 0.5, z: cz + 0.5 }, // centre of the room, over the guide
    { x: cx - half + 3, z: cz - 2 }, // over the bed/bookshelf corner
  ];
  for (const s of lanternSpots) group.add(buildHangingLantern(s.x, ceilingY, s.z));

  /*
   * The gate: a low wooden gate across the porch, at the same column as the
   * actual (invisible) mob barrier below — see `isMobSolidAt`. Visually it
   * reads as "this entrance is guarded"; the collision that actually keeps
   * zombies out and the guide in is a separate, deliberately invisible
   * check, since this mesh is knee-high and the player still has to walk
   * straight through it.
   */
  const gateZ = cz + half + 1;
  group.add(buildGateMesh(house.doorX + 0.5, heightAt(house.doorX, gateZ) + 1, gateZ + 0.5));

  /*
   * The door itself — hinged open against the inside of the left jamb (see
   * `buildDoor`'s own comment for why it doesn't swing shut). Mounted right
   * on the wall plane, at the actual opening, so it reads as part of the
   * doorway rather than a separate object near it.
   */
  group.add(buildDoor(house.doorX - 0.5, floorY, cz + half, -Math.PI * 0.47));

  /*
   * Torch placement: either side of the front door (outside, so the
   * threshold is lit), one at each cottage doorstep, a ring around the
   * inside of the great room — including one at each gallery wall's
   * midpoint — and now the hearth and every hanging lantern too. This was
   * the single biggest thing making the house feel gloomy after dark: four
   * corner torches over a 15x15 floor leaves the middle of each wall (and
   * every new piece of furniture) sitting in shadow.
   */
  const torchSpots: { x: number; y: number; z: number }[] = [];
  const addTorch = (x: number, z: number) => {
    if (!inBounds(x, z)) return;
    torchSpots.push({ x: x + 0.5, y: heightAt(x, z) + 1, z: z + 0.5 });
  };
  addTorch(house.doorX - 1, house.doorZ);
  addTorch(house.doorX + 1, house.doorZ);
  for (const v of village) addTorch(v.x, v.z + 1);
  // Interior corners, inset one block from the walls so the torch isn't
  // buried inside the log framing.
  torchSpots.push({ x: cx - half + 1.5, y: floorY, z: cz - half + 1.5 });
  torchSpots.push({ x: cx + half - 1.5, y: floorY, z: cz - half + 1.5 });
  torchSpots.push({ x: cx - half + 1.5, y: floorY, z: cz + half - 1.5 });
  torchSpots.push({ x: cx + half - 1.5, y: floorY, z: cz + half - 1.5 });
  // Gallery-wall midpoints, so the plaques are lit rather than just the
  // corners and the doorway.
  torchSpots.push({ x: cx - half + 1.5, y: floorY, z: cz + 0.5 });
  torchSpots.push({ x: cx + half - 1.5, y: floorY, z: cz + 0.5 });
  // The hearth's own glow — matched to the firebox glow mesh's actual
  // position in buildFireplace (group origin + local y=0.46, z=0.34).
  torchSpots.push({ x: cx + 0.5, y: floorY + 0.46, z: cz - half + 0.52 + 0.34 });
  // Each hanging lantern's light, at the fixture's actual glowing core.
  for (const s of lanternSpots) torchSpots.push({ x: s.x, y: ceilingY - 0.52, z: s.z });

  /** Where the resident guide stands and wanders — dead centre of the hall. */
  const guideHome = new THREE.Vector3(cx + 0.5, floorY, cz + 0.5);

  /*
   * The one place in the whole map that treats mobs and the player
   * differently: this column, the actual doorway opening in the wall, is
   * solid to any mob but open air to the player. That's what stops a
   * zombie from wandering in at night, an arrow from a skeleton outside
   * flying in through the door, and — the same mechanism, for free — the
   * guide from wandering back out once it's inside. The player's own
   * collision (`isSolidAt`, used by player.ts) never sees this column.
   */
  const doorBlockX = house.doorX;
  const doorBlockZ = cz + half;
  const doorBlockY0 = baseY + 1;
  const doorBlockY1 = baseY + doorH;
  const isMobSolidAt = (x: number, y: number, z: number): boolean => {
    if (x === doorBlockX && z === doorBlockZ && y >= doorBlockY0 && y <= doorBlockY1) return true;
    if (!inBounds(x, z)) return true;
    return isSolid(hm, overlay, removed, x, y, z);
  };

  const getBlock = (x: number, y: number, z: number) => blockFor(hm, overlay, removed, x, y, z);

  const breakBlock = (x: number, y: number, z: number): Block | null => {
    const b = getBlock(x, y, z);
    if (b === Block.AIR) return null;
    /*
     * The bed is two things at once: these overlay voxels (which drive the
     * world mesh's face-culling around it) and a separate decorative
     * `buildCanopyBed` group added straight to `group`. Mining the voxels used
     * to leave the world mesh with a hole where the bed was while the
     * decorative mesh kept floating over it — and `bedPos` still pointed at
     * the now-empty spot, so the sleep prompt kept appearing over nothing.
     * The bed was never meant to be minable in the first place, so the fix
     * is simply to refuse.
     */
    if (b === Block.BEDRED || b === Block.BEDWHITE) return null;
    const k = key(x, y, z);
    if (overlay.has(k)) overlay.delete(k);
    else removed.add(k);
    touch(x, y, z);
    updateStreaming(x, z, 9); // rebuild the dirty chunks immediately
    return DROP_FOR[b] ?? null;
  };

  const placeBlock = (x: number, y: number, z: number, block: Block): boolean => {
    if (getBlock(x, y, z) !== Block.AIR) return false;
    if (!inBounds(x, z) || y < 0 || y > MAX_H + 8) return false;
    const k = key(x, y, z);
    overlay.set(k, block);
    removed.delete(k);
    if (y + 2 > ceiling) ceiling = y + 2;
    touch(x, y, z);
    updateStreaming(x, z, 9);
    return true;
  };

  function disposeMaterial(mat: THREE.Material) {
    const m = mat as unknown as Record<string, unknown>;
    for (const k of ['map', 'alphaMap', 'aoMap', 'bumpMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap']) {
      const tex = m[k] as THREE.Texture | undefined;
      tex?.dispose?.();
    }
    mat.dispose();
  }

  function disposeObject(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(disposeMaterial);
      else if (mat) disposeMaterial(mat);
    });
  }

  const dispose = () => {
    for (const k of chunks.keys()) disposeChunk(k);
    // The board and name signs each carry their own baked CanvasTexture and
    // MeshBasicMaterial (~16 of them for a full project list) — these are
    // the leak in bug #22, and disposeObject walks every mesh under `group`
    // (signs, chest, map board, bed, clouds) to free them all.
    disposeObject(group);
    water.dispose();
    disposeMaterial(opaqueMat);
    disposeMaterial(transMat);
  };

  return {
    group,
    heightAt,
    house,
    boards,
    waterMesh,
    getBlock,
    isSolidAt: (x, y, z) => {
      // Outside the map horizontally is an invisible wall rather than air, so
      // you cannot walk off the edge of the world into the skybox.
      if (!inBounds(x, z)) return true;
      return isSolid(hm, overlay, removed, x, y, z);
    },
    isMobSolidAt,
    waterLevel: WATER_Y + 0.85,
    itemMaterial: opaqueMat,
    water,
    chest,
    chestPos: new THREE.Vector3(chestX + 0.5, floorY, chestZ + 0.5),
    mapPos: new THREE.Vector3(mapX + 0.5, floorY + 1.4, mapZ + 0.5),
    guideHome,
    village,
    torchSpots,
    breakBlock,
    placeBlock,
    isInBounds: inBounds,
    updateStreaming,
    clouds,
    dispose,
  };
}

/** A post + board, with the project's name and blurb painted onto its own small canvas texture. */
function buildSignMesh(title: string, body: string, hero = false): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });
  const postGeo = new THREE.BoxGeometry(0.18, 1.5, 0.18);
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.y = 0.75;
  g.add(post);

  const boardTex = paintSign(title, body, hero);
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide });
  const boardGeo = new THREE.PlaneGeometry(1.4, 0.9);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(0, 1.35, 0.1);
  g.add(board);

  return g;
}

/**
 * A project plaque mounted flush on an interior wall — the gallery version
 * of `buildSignMesh`, minus the post: there's a real wall right behind it,
 * so it doesn't need one to stand on.
 *
 * Title only, no blurb — the plaque is a nameplate you spot from across the
 * room; the write-up lives in the panel that opens on E, at the same depth
 * as everywhere else on the site. Painting the blurb onto a few pixels of
 * canvas texture was never going to be readable at that size anyway.
 * Smaller than the old title+blurb board, too, since a name needs less
 * real estate than a name-and-paragraph — which is also what makes the
 * gallery walls able to fit more plaques.
 *
 * `PlaneGeometry`'s default face normal is +Z. Rotating the mesh ±90° about
 * Y is what the gallery placement code uses to point that normal into the
 * room from whichever wall it's hanging on — `Math.PI / 2` sends +Z to +X
 * (for a plaque on the west wall, where the room is on the +X side of it),
 * and `-Math.PI / 2` sends it to -X (east wall, room on the -X side).
 */
function buildWallPlaque(title: string): THREE.Mesh {
  const boardTex = paintSignTitle(title);
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide });
  const boardGeo = new THREE.PlaneGeometry(0.95, 0.6);
  return new THREE.Mesh(boardGeo, boardMat);
}

/**
 * A low wooden gate across the doorway, on the porch — the visible half of
 * "keep zombies out." (The half that actually works is the invisible mob
 * collider at the wall opening itself, see `isMobSolidAt` — a knee-high
 * decorative gate can't stop anything on its own, and the player still
 * needs to walk through this same spot.) Two posts, a top rail, and a
 * cross-brace read as "gate" without needing hinge geometry this engine
 * doesn't have.
 */
function buildGateMesh(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3f26 });
  for (const dx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), wood);
    post.position.set(dx, 0.55, 0);
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.09), wood);
  rail.position.set(0, 1.02, 0);
  g.add(rail);
  const brace1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), wood);
  brace1.rotation.z = Math.PI / 5.5;
  brace1.position.set(0, 0.55, 0);
  const brace2 = brace1.clone();
  brace2.rotation.z = -Math.PI / 5.5;
  g.add(brace1, brace2);
  g.position.set(x, y, z);
  return g;
}