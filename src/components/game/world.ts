// src/components/game/world.ts
import * as THREE from 'three';
import { Block, TRANSPARENT, tilesFor, uvRect, buildAtlas, DROP_FOR } from '@/components/game/blocks';
import { paintSign } from '@/components/game/noticeBoard';
import type { Project, Profile } from '@/lib/content';

export const SIZE = 44; // one side of the island, in blocks
export const WATER_Y = 3;
export const MAX_H = 20;
const CENTER = SIZE / 2;
const PLATEAU_R = 7; // flattened disc the house sits on
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
  const edgeDist = Math.min(x, z, SIZE - 1 - x, SIZE - 1 - z);
  const shore = 6;
  if (edgeDist < shore) {
    const t = 1 - Math.max(0, edgeDist) / shore;
    /*
     * Smoothstepped, and the noise is faded out along with the height.
     *
     * Letting full-amplitude noise survive into the falloff is what produced
     * the row of one-block spikes sticking out of the sea in the first build:
     * neighbouring columns landed either side of the waterline, so instead of
     * a beach you got isolated posts. Damping the noise toward the edge makes
     * the last few metres a smooth sand shelf.
     */
    const ease = t * t * (3 - 2 * t);
    h = BASE_H + (big + small) * (1 - ease) - ease * (BASE_H + 1.5);
    // Never let the seabed dip so far that the sea looks bottomless.
    h = Math.max(WATER_Y - 2, h);
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
 * The house. Four plank walls with a doorway, a log frame, a peaked plank
 * roof, a glass window either side of the door, and a bed against the back
 * wall — the one piece of furniture the game actually depends on, since
 * dying respawns you standing next to it.
 */
export type HouseInfo = {
  doorX: number;
  doorZ: number;
  bedPos: THREE.Vector3;
  baseY: number;
  cx: number;
  cz: number;
  half: number;
};

function buildHouse(overlay: Overlay, hm: Heightmap): HouseInfo {
  const cx = Math.round(CENTER);
  const cz = Math.round(CENTER);
  const base = hm[cz * SIZE + cx];
  const half = 3; // interior half-width
  const wallH = 3;
  const doorX = cx;
  const doorZ = cz + half;

  for (let x = cx - half; x <= cx + half; x++) {
    for (let z = cz - half; z <= cz + half; z++) {
      // Flatten the footprint to `base` so walls don't sit on stepped terrain.
      for (let y = hm[z * SIZE + x] + 1; y <= base; y++) overlay.set(key(x, y, z), Block.DIRT);
      for (let y = base + 1; y < base + 1 + wallH; y++) {
        const onWall = x === cx - half || x === cx + half || z === cz - half || z === cz + half;
        if (!onWall) continue;
        const isDoorway = x === doorX && z === doorZ && y <= base + 2;
        if (isDoorway) continue;
        const corner = (x === cx - half || x === cx + half) && (z === cz - half || z === cz + half);
        const isWindow =
          y === base + 2 &&
          !corner &&
          ((z === cz - half && (x === cx - 1 || x === cx + 1)) ||
            (x === cx - half && (z === cz - 1 || z === cz + 1)) ||
            (x === cx + half && (z === cz - 1 || z === cz + 1)));
        overlay.set(key(x, y, z), corner ? Block.LOG : isWindow ? Block.GLASS : Block.PLANK);
      }
    }
  }
  // Peaked roof: each ring in one block, rising to a ridge, plank shingles.
  const roofBaseY = base + 1 + wallH;
  for (let ring = 0; ring <= half; ring++) {
    const y = roofBaseY + ring;
    for (let x = cx - half - 1 + ring; x <= cx + half + 1 - ring; x++) {
      for (let z = cz - half - 1 + ring; z <= cz + half + 1 - ring; z++) {
        const onRing =
          x === cx - half - 1 + ring || x === cx + half + 1 - ring || z === cz - half - 1 + ring || z === cz + half + 1 - ring;
        if (onRing) overlay.set(key(x, y, z), Block.PLANK);
      }
    }
  }
  // The bed: two blocks against the back (north) wall.
  const bedZ = cz - half + 1;
  overlay.set(key(cx - 1, base + 1, bedZ), Block.BEDRED);
  overlay.set(key(cx, base + 1, bedZ), Block.BEDWHITE);

  return {
    doorX,
    doorZ: doorZ + 1,
    bedPos: new THREE.Vector3(cx - 0.5, base + 1.5, bedZ + 0.5),
    baseY: base,
    cx,
    cz,
    half,
  };
}

/**
 * The bed, as a mesh rather than two cubes.
 *
 * Two full blocks read as a red box and a white box sitting on the floor,
 * which is what they are. A bed is a low mattress with a raised pillow at one
 * end and legs at the corners — all of that is boxes too, just not
 * block-sized ones, so it costs a handful of geometry and stops the one piece
 * of furniture in the house looking like leftover building material.
 */
function buildBedMesh(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0xb2352f });
  const pillowMat = new THREE.MeshLambertMaterial({ color: 0xece5d6 });
  const frame = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });

  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 1.9), cloth);
  mattress.position.set(0, 0.42, 0);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.5), pillowMat);
  pillow.position.set(0, 0.62, -0.62);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.12), frame);
  headboard.position.set(0, 0.5, -0.98);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.9), frame);
  base.position.set(0, 0.26, 0);
  g.add(mattress, pillow, headboard, base);

  for (const [lx, lz] of [[-0.42, -0.85], [0.42, -0.85], [-0.42, 0.85], [0.42, 0.85]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), frame);
    leg.position.set(lx, 0.11, lz);
    g.add(leg);
  }
  g.position.set(x, y, z);
  return g;
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
  if (y === h) return h <= WATER_Y ? Block.SAND : Block.GRASS;
  if (y >= h - 2) return Block.DIRT;
  return Block.STONE;
}

function isSolid(hm: Heightmap, overlay: Overlay, removed: Set<string>, x: number, y: number, z: number): boolean {
  if (y < 0) return true;
  const b = blockFor(hm, overlay, removed, x, y, z);
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

export type BuiltWorld = {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  house: HouseInfo;
  boards: { slug: string; position: THREE.Vector3; facing: number }[];
  waterMesh: THREE.Mesh;
  craftingTablePos: THREE.Vector3;
  /** What's at this cell right now (terrain, overlay, or air). */
  getBlock: (x: number, y: number, z: number) => Block;
  /**
   * Whether this cell stops a body. This is what the player controller
   * collides against — it must agree with the mesher about what is solid, so
   * it goes through the same `isSolid` the face-culling uses rather than a
   * second opinion that could drift from it.
   */
  isSolidAt: (x: number, y: number, z: number) => boolean;
  /** World Y of the sea surface, for the swim check. */
  waterLevel: number;
  /** The shared atlas material, reused by every dropped item. */
  itemMaterial: THREE.Material;
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
};

export function buildWorld(projects: Project[], profile: Profile): BuiltWorld {
  const hm = buildHeightmap();
  const overlay: Overlay = new Map();
  const removed = new Set<string>();
  const house = buildHouse(overlay, hm);

  // A handful of trees, placed away from the plateau so they don't collide with the house.
  const treeSpots: [number, number][] = [
    [6, 8], [10, 34], [34, 9], [38, 30], [16, 38], [30, 40], [5, 22], [40, 18], [22, 5], [22, 40],
  ];
  for (const [x, z] of treeSpots) addTree(overlay, hm, x, z);

  /*
   * The crafting table, on open ground a couple of paces off the doorstep.
   *
   * It used to be placed at `doorZ - 1`, and `doorZ` is already the cell
   * *outside* the doorway — so `doorZ - 1` is the doorway itself, and the
   * table was being buried inside the house's south wall where nothing could
   * see or reach it. Offsetting outward along +Z from the door puts it in the
   * open, and the height comes from `heightAt` rather than the raw heightmap
   * so it sits on whatever the house flattening actually left behind.
   */
  const craftX = house.doorX + 2;
  const craftZ = house.doorZ + 1;
  // Scan down for the real surface: the house flattening writes DIRT into the
  // overlay, so the raw heightmap alone would bury the table under it.
  let craftY = MAX_H + 2;
  while (craftY > 0 && !isSolid(hm, overlay, removed, craftX, craftY - 1, craftZ)) craftY--;
  overlay.set(key(craftX, craftY, craftZ), Block.CRAFT);

  const atlas = buildAtlas();
  const group = new THREE.Group();
  group.name = 'voxel-world';

  const opaqueMat = new THREE.MeshLambertMaterial({ map: atlas });
  const opaqueMesh = new THREE.Mesh(new THREE.BufferGeometry(), opaqueMat);
  opaqueMesh.name = 'terrain-opaque';
  const transMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const transMesh = new THREE.Mesh(new THREE.BufferGeometry(), transMat);
  transMesh.name = 'terrain-trans';
  group.add(opaqueMesh, transMesh);

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

  function regenerate() {
    const opaque = new MeshBuilder();
    const trans = new MeshBuilder();
    for (let x = 0; x < SIZE; x++) {
      for (let z = 0; z < SIZE; z++) {
        for (let y = 0; y <= ceiling; y++) {
          const b = blockFor(hm, overlay, removed, x, y, z);
          if (b === Block.AIR) continue;
          const builder = TRANSPARENT.has(b) ? trans : opaque;
          const [top, bottom, side] = tilesFor(b);
          if (!isSolid(hm, overlay, removed, x, y + 1, z)) builder.addFace(x, y, z, 'top', top);
          if (!isSolid(hm, overlay, removed, x, y - 1, z)) builder.addFace(x, y, z, 'bottom', bottom);
          if (!isSolid(hm, overlay, removed, x, y, z - 1)) builder.addFace(x, y, z, 'north', side);
          if (!isSolid(hm, overlay, removed, x, y, z + 1)) builder.addFace(x, y, z, 'south', side);
          if (!isSolid(hm, overlay, removed, x + 1, y, z)) builder.addFace(x, y, z, 'east', side);
          if (!isSolid(hm, overlay, removed, x - 1, y, z)) builder.addFace(x, y, z, 'west', side);
        }
      }
    }
    opaqueMesh.geometry.dispose();
    opaqueMesh.geometry = opaque.toGeometry();
    transMesh.geometry.dispose();
    transMesh.geometry = trans.toGeometry();
  }
  regenerate();

  const waterGeo = new THREE.PlaneGeometry(SIZE + 30, SIZE + 30);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2f6fa8, transparent: true, opacity: 0.72 });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  /*
   * A block at height `y` occupies y..y+1, so the top of the shallowest sand
   * is at WATER_Y + 1. Sitting the surface just under that puts the shelf
   * barely awash instead of cutting a waterline through the middle of every
   * edge block, which is what the old 0.55 offset did.
   */
  waterMesh.position.set(CENTER, WATER_Y + 0.85, CENTER);
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

  // Notice boards: one per project, ringed around the plateau facing the house.
  const boards: BuiltWorld['boards'] = [];
  const n = Math.max(1, projects.length);
  const ringR = PLATEAU_R + 8;
  const boardsGroup = new THREE.Group();
  boardsGroup.name = 'boards';
  projects.forEach((p, i) => {
    const angle = (i / n) * Math.PI * 2;
    /*
     * Walk inward from the ring until the column is clear of the water.
     *
     * A fixed radius puts boards wherever the ring happens to land, and on a
     * map with a real coastline some of those land in the surf — a project
     * sign standing in the sea reads as a bug, because it is one. The ring is
     * a starting suggestion; dry land wins.
     */
    let r = ringR;
    let gx = Math.round(CENTER + Math.cos(angle) * r);
    let gz = Math.round(CENTER + Math.sin(angle) * r);
    while (r > 3 && heightAt(gx, gz) <= WATER_Y + 1) {
      r -= 1;
      gx = Math.round(CENTER + Math.cos(angle) * r);
      gz = Math.round(CENTER + Math.sin(angle) * r);
    }
    const gy = heightAt(gx, gz);
    const facing = angle + Math.PI; // face the plateau/house
    const mesh = buildSignMesh(p.name, p.blurb);
    mesh.position.set(gx + 0.5, gy + 1, gz + 0.5);
    mesh.rotation.y = facing;
    mesh.userData.slug = p.slug;
    boardsGroup.add(mesh);
    boards.push({ slug: p.slug, position: new THREE.Vector3(gx + 0.5, gy + 1, gz + 0.5), facing });
  });
  group.add(boardsGroup);

  // Furniture and sky, added as meshes rather than blocks.
  group.add(buildBedMesh(house.bedPos.x, house.baseY + 1, house.bedPos.z));
  group.add(buildClouds());

  // One extra sign by the door: whose world this is.
  const nameSign = buildSignMesh(profile.name, profile.title, true);
  const signY = heightAt(house.doorX, house.doorZ + 1);
  nameSign.position.set(house.doorX + 0.5, signY + 1, house.doorZ + 1.5);
  group.add(nameSign);

  const getBlock = (x: number, y: number, z: number) => blockFor(hm, overlay, removed, x, y, z);

  const breakBlock = (x: number, y: number, z: number): Block | null => {
    const b = getBlock(x, y, z);
    if (b === Block.AIR) return null;
    const k = key(x, y, z);
    if (overlay.has(k)) overlay.delete(k);
    else removed.add(k);
    regenerate();
    return DROP_FOR[b] ?? null;
  };

  const placeBlock = (x: number, y: number, z: number, block: Block): boolean => {
    if (getBlock(x, y, z) !== Block.AIR) return false;
    if (!inBounds(x, z) || y < 0 || y > MAX_H + 8) return false;
    const k = key(x, y, z);
    overlay.set(k, block);
    removed.delete(k);
    if (y + 2 > ceiling) ceiling = y + 2;
    regenerate();
    return true;
  };

  return {
    group,
    heightAt,
    house,
    boards,
    waterMesh,
    craftingTablePos: new THREE.Vector3(craftX + 0.5, heightAt(craftX, craftZ) + 1, craftZ + 0.5),
    getBlock,
    isSolidAt: (x, y, z) => {
      // Outside the map horizontally is an invisible wall rather than air, so
      // you cannot walk off the edge of the world into the skybox.
      if (!inBounds(x, z)) return true;
      return isSolid(hm, overlay, removed, x, y, z);
    },
    waterLevel: WATER_Y + 0.85,
    itemMaterial: opaqueMat,
    breakBlock,
    placeBlock,
    isInBounds: inBounds,
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