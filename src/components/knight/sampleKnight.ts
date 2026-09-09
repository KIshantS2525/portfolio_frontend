// src/components/knight/sampleKnight.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { KnightConfig } from './config.ts';

/**
 * Turning a knight — any knight — into a point cloud.
 *
 * The mesh is scaffolding and is never added to the scene. It exists to be
 * sampled and thrown away, which is the whole reason this reads as a
 * constellation rather than as a chess piece with sparkles on it.
 *
 * Two sources, one pipeline:
 *
 *   a GLB the user supplies — loaded, flattened to a single geometry, scaled
 *     so its bounding box height is exactly the specified 160mm and seated on
 *     y = 0. Normalising here rather than trusting the file is what lets every
 *     number in config.ts be a real millimetre: drop in a model authored in
 *     metres, inches or arbitrary blender units and the dust still sits 5–35mm
 *     off the surface.
 *
 *   a procedural fallback — built from the same lathe-plus-extrusion the
 *     scroll journey's knight uses, so the component renders something correct
 *     on first run instead of an empty canvas while the model is sourced. It
 *     goes through the identical sampler, so swapping in the GLB changes the
 *     input and nothing else.
 *
 * MeshSurfaceSampler weights by triangle area, so density follows surface
 * area and the interior comes out hollow — which is the volumetric look the
 * brief asks for, and it falls out of surface sampling for free rather than
 * needing to be engineered.
 */

export type KnightCloud = {
  /** Sampled surface positions, xyz triples, in millimetres. */
  positions: Float32Array;
  /** Unit surface normals at each sample, used to push dust off the surface. */
  normals: Float32Array;
  /** Bounding box of the normalised piece. */
  bounds: THREE.Box3;
  /** True when the procedural stand-in was used because no GLB was found. */
  usedFallback: boolean;
};

/** Flatten whatever the GLB contains into one geometry in world space. */
function flatten(root: THREE.Object3D): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    // Merging requires a consistent attribute set; anything decorative that a
    // DCC tool tacked on will differ between sub-meshes and break the merge.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    geometry.deleteAttribute('uv');
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  });
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

/**
 * Scale to the specified height and seat on the floor. Returns the geometry
 * mutated in place plus its final bounds.
 */
function normalise(geometry: THREE.BufferGeometry, config: KnightConfig) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = config.dimensions.totalHeight / (size.y || 1);
  geometry.scale(scale, scale, scale);

  geometry.computeBoundingBox();
  const scaled = geometry.boundingBox!;
  const centre = new THREE.Vector3();
  scaled.getCenter(centre);
  geometry.translate(
    -centre.x,
    config.dimensions.seatOnFloor ? -scaled.min.y : -centre.y,
    -centre.z,
  );
  geometry.computeBoundingBox();
  return geometry.boundingBox!.clone();
}

/**
 * The stand-in knight: a lathed pedestal plus a bevel-extruded head profile.
 *
 * The bevel is doing real work — a flat extrusion produces a cardboard
 * cut-out, and sampling one gives two dense planes with nothing between them.
 * Bevelling rounds the edge so surface samples wrap around the sides and the
 * silhouette gains thickness. Proportions are the dimension table: 78mm base,
 * 18mm bottom disc, head in the upper 45%.
 */
function buildFallbackGeometry(): THREE.BufferGeometry {
  // All coordinates below are millimetres of the 160mm piece.

  // Pedestal, as a lathe profile in millimetres: (radius, height).
  const lathe: THREE.Vector2[] = (
    [
      [0, 0],
      [39, 0],
      [39, 6],
      [37, 18],
      [31, 20],
      [30, 27],
      [26, 33],
      [25, 42],
      [27, 48],
      [26, 52],
      [24, 54],
    ] as Array<[number, number]>
  ).map(([r, y]) => new THREE.Vector2(r, y));
  const pedestal = new THREE.LatheGeometry(lathe, 96);

  // Head + neck profile, in millimetres, facing -x.
  const profile: Array<[number, number]> = [
    [-24, 54],
    [-25, 63],
    [-23, 72],
    [-19, 81],
    [-15, 89],
    [-17, 96],
    [-22, 102],
    [-30, 105],
    [-39, 107],
    [-48, 108],
    [-56, 109],
    [-63, 112],
    [-67, 116],
    [-66, 121],
    [-61, 124],
    [-53, 126],
    [-45, 128],
    [-38, 131],
    [-34, 135],
    [-32, 140],
    [-31, 145],
    [-32, 150],
    [-28, 156],
    [-24, 160],
    [-21, 153],
    [-18, 147],
    [-14, 152],
    [-10, 157],
    [-5, 153],
    [2, 147],
    [12, 142],
    [20, 136],
    [27, 129],
    [24, 124],
    [31, 119],
    [27, 113],
    [35, 108],
    [31, 102],
    [39, 95],
    [35, 88],
    [39, 81],
    [37, 73],
    [37, 66],
    [35, 60],
    [33, 54],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i++) shape.lineTo(profile[i][0], profile[i][1]);
  shape.closePath();

  const head = new THREE.ExtrudeGeometry(shape, {
    depth: 26,
    bevelEnabled: true,
    bevelThickness: 7,
    bevelSize: 6,
    bevelSegments: 4,
    curveSegments: 12,
  });
  // Extrusion runs along +z from 0; centre it on the axis.
  head.translate(0, 0, -(26 + 12) / 2);

  const merged = mergeGeometries([pedestal.toNonIndexed(), head.toNonIndexed()], false);
  pedestal.dispose();
  head.dispose();
  if (!merged) throw new Error('knight: failed to build the fallback geometry');
  merged.computeVertexNormals();
  return merged;
}

/** Deterministic PRNG, so the cloud is identical on every load. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function sampleKnight(config: KnightConfig): Promise<KnightCloud> {
  let geometry: THREE.BufferGeometry | null = null;
  let usedFallback = false;

  try {
    // .obj as well as .glb: a ZBrush or Blender OBJ export drops straight in,
    // it is just a much heavier download and parse for the same result, since
    // OBJ is uncompressed text. Normals are optional either way — `flatten`
    // computes them when the file has none, which OBJ exports frequently do.
    const isObj = /\.obj(\?|$)/i.test(config.modelUrl);
    const loaded = isObj
      ? await new OBJLoader().loadAsync(config.modelUrl)
      : (await new GLTFLoader().loadAsync(config.modelUrl)).scene;
    geometry = flatten(loaded);
    if (!geometry) throw new Error('no meshes in the model');
  } catch {
    // No model yet, a 404, or a file with nothing samplable in it. Fall back
    // rather than throwing: an empty canvas is a worse failure than a
    // stand-in, and the console note tells you which one you are looking at.
    console.info(
      `[ParticleKnight] No usable model at "${config.modelUrl}" — drawing the procedural stand-in. ` +
        `See src/components/knight/README.md to add one.`,
    );
    geometry = buildFallbackGeometry();
    usedFallback = true;
  }

  const bounds = normalise(geometry, config);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const sampler = new MeshSurfaceSampler(mesh).build();

  const count = config.particleCount;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // MeshSurfaceSampler uses Math.random internally, so the cloud differs run to
  // run. Reseeding it with a deterministic generator keeps the piece identical
  // on every load, which matters because the connection network is derived
  // from these positions — a reshuffle would rewire the whole web.
  const original = Math.random;
  Math.random = rng(0x4e19a7);
  try {
    for (let i = 0; i < count; i++) {
      sampler.sample(position, normal);
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      normals[i * 3] = normal.x;
      normals[i * 3 + 1] = normal.y;
      normals[i * 3 + 2] = normal.z;
    }
  } finally {
    Math.random = original;
  }

  geometry.dispose();
  return { positions, normals, bounds, usedFallback };
}