// src/components/knight/DustField.ts
import * as THREE from 'three';
import type { KnightConfig } from './config.ts';

/**
 * The atmosphere: particles standing off the surface, so the piece fades into
 * the dark instead of stopping at a hard boundary.
 *
 * Each mote is seeded from a real sampled surface point and pushed out along
 * that point's own surface normal, which is why the dust hugs the shape —
 * scattering inside a bounding box or a sphere instead would pile it up in the
 * empty corners around the muzzle and leave the mane bare. The spec's two
 * bands are honoured directly: three quarters sit at 5–15mm, the rest drift out
 * to 35mm.
 *
 * Reuses the core shader by construction — same attributes, same uniforms —
 * so dust breathes, drifts and repels exactly like the piece it surrounds,
 * just dimmer and slower.
 */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DustField = {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  dispose(): void;
};

export function createDustField(
  surfacePositions: Float32Array,
  surfaceNormals: Float32Array,
  coreMaterial: THREE.ShaderMaterial,
  config: KnightConfig,
): DustField {
  const surfaceCount = surfacePositions.length / 3;
  const count = config.floatingDustCount;
  const rand = rng(0x51d);

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colours = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  const [near, far] = config.dustSpread;
  const palette = Object.values(config.palette).map((p) => new THREE.Color(p.color));

  for (let i = 0; i < count; i++) {
    const s = Math.floor(rand() * surfaceCount);
    // A quarter of the motes go to the far band; the rest hug the surface.
    const distance = rand() < 0.25 ? near + (far - near) * (0.55 + rand() * 0.45) : near + (far - near) * rand() * 0.35;
    // Jitter the direction off the exact normal, otherwise the dust reads as a
    // shrink-wrapped second skin rather than as a cloud.
    const jx = (rand() - 0.5) * 0.7;
    const jy = (rand() - 0.5) * 0.7;
    const jz = (rand() - 0.5) * 0.7;
    const nx = surfaceNormals[s * 3] + jx;
    const ny = surfaceNormals[s * 3 + 1] + jy;
    const nz = surfaceNormals[s * 3 + 2] + jz;
    const len = Math.hypot(nx, ny, nz) || 1;
    positions[i * 3] = surfacePositions[s * 3] + (nx / len) * distance;
    positions[i * 3 + 1] = surfacePositions[s * 3 + 1] + (ny / len) * distance;
    positions[i * 3 + 2] = surfacePositions[s * 3 + 2] + (nz / len) * distance;

    sizes[i] = 0.5 + rand() * 1.1;
    seeds[i] = rand();
    const colour = palette[Math.floor(rand() * palette.length)];
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  // Clone rather than share: the dust wants its own opacity and a lazier
  // drift, but every other uniform should stay bound to the core material's
  // values so the two clouds breathe and repel as one object.
  const material = coreMaterial.clone();
  material.uniforms = THREE.UniformsUtils.clone(coreMaterial.uniforms);
  material.uniforms.uOpacity.value = config.particleOpacity * 0.45;
  material.uniforms.uNoiseStrength.value = config.noiseStrength * 2.2;
  material.uniforms.uNoiseSpeed.value = config.noiseSpeed * 0.6;

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}