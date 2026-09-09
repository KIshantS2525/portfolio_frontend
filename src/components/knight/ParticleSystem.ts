// src/components/knight/ParticleSystem.ts
import * as THREE from 'three';
import type { KnightConfig } from './config.ts';

/**
 * The core cloud: one THREE.Points, one draw call, sixteen thousand particles.
 *
 * Everything that moves is done on the GPU in the vertex shader. Drift,
 * breathing and pointer repulsion are all functions of (home position, time,
 * pointer) with no frame-to-frame state, so the CPU per frame is three uniform
 * writes — not a sixteen-thousand-iteration loop rewriting a buffer. That is
 * the difference between this holding 60fps on a phone and not.
 *
 * Being stateless also means the particles genuinely return home: each one is
 * displaced from its sampled position every frame rather than integrating a
 * velocity, so when the pointer leaves there is nothing to settle or drift —
 * the displacement term simply goes to zero and the particle is exactly where
 * it started.
 */

/**
 * Ashima's simplex noise, the standard GLSL port. Used for the drift: three
 * lookups at offset coordinates give a divergence-free-ish vector field, which
 * looks like the cloud is suspended in a slow current rather than each particle
 * wandering on its own private sine wave.
 */
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uNoiseStrength;
uniform float uNoiseSpeed;
uniform float uBreath;
uniform vec3  uPointer;
uniform float uPointerActive;
uniform float uRepulsionRadius;
uniform float uRepulsionStrength;
uniform float uSize;
uniform float uPixelRatio;

attribute float aSize;
attribute vec3  aColor;
attribute float aSeed;

varying vec3  vColor;
varying float vFade;

${SIMPLEX}

void main() {
  vec3 home = position;

  // Breathing: a uniform swell about the origin. Scaling the home position
  // rather than adding an offset means the whole piece inflates evenly instead
  // of the top drifting away from the base.
  vec3 pos = home * uBreath;

  // Drift. Three offset lookups so the field has curl to it.
  float t = uTime * uNoiseSpeed;
  vec3 n = vec3(
    snoise(pos * 0.018 + vec3(t, 0.0, 0.0)),
    snoise(pos * 0.018 + vec3(0.0, t, 31.4)),
    snoise(pos * 0.018 + vec3(11.7, 0.0, t))
  );
  pos += n * uNoiseStrength;

  // Pointer repulsion. Distance is measured in world millimetres, and the
  // falloff is squared so particles right under the cursor move a lot and the
  // edge of the radius is imperceptible — a linear falloff makes a visible
  // hard circle sweep across the piece.
  vec3 away = pos - uPointer;
  float d = length(away);
  float push = 1.0 - smoothstep(0.0, uRepulsionRadius, d);
  pos += normalize(away + vec3(0.0001)) * push * push * uRepulsionStrength * uPointerActive;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // Perspective attenuation, with a floor so distant particles stay visible
  // rather than collapsing to sub-pixel flicker.
  float attenuation = 300.0 / max(60.0, -mv.z);
  gl_PointSize = max(1.0, aSize * uSize * attenuation * uPixelRatio);

  vColor = aColor;
  // Slight twinkle, seeded per particle so they are not in lockstep.
  vFade = 0.75 + 0.25 * sin(uTime * 1.4 + aSeed * 6.2831);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3  vColor;
varying float vFade;

void main() {
  // Round the point sprite and give it a soft core. Squaring the falloff twice
  // concentrates the brightness in the middle, which is what the bloom pass
  // needs to grab onto — a flat disc just blooms into mush.
  vec2 uv = gl_PointCoord - 0.5;
  float d = dot(uv, uv);
  if (d > 0.25) discard;
  float core = 1.0 - smoothstep(0.0, 0.25, d);
  gl_FragColor = vec4(vColor, core * core * uOpacity * vFade);
}
`;

export type ParticleSystem = {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  /** Bright-node positions, for the connection network to hang off. */
  nodePositions: Float32Array;
  update(elapsed: number, pointer: THREE.Vector3 | null): void;
  dispose(): void;
};

/** Deterministic PRNG, so colour and size assignment never reshuffle. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the cumulative colour table once, from the palette shares. */
function colourPicker(config: KnightConfig) {
  const entries = Object.values(config.palette);
  const total = entries.reduce((sum, e) => sum + e.share, 0);
  const table: Array<{ colour: THREE.Color; upTo: number }> = [];
  let acc = 0;
  for (const entry of entries) {
    acc += entry.share / total;
    table.push({ colour: new THREE.Color(entry.color), upTo: acc });
  }
  return (r: number) => (table.find((e) => r <= e.upTo) ?? table[table.length - 1]).colour;
}

export function createParticleSystem(
  positions: Float32Array,
  config: KnightConfig,
  pixelRatio: number,
): ParticleSystem {
  const count = positions.length / 3;
  const rand = rng(0x9c31);
  const pickColour = colourPicker(config);

  const sizes = new Float32Array(count);
  const colours = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const nodeIndices: number[] = [];

  for (let i = 0; i < count; i++) {
    const bright = rand() < config.brightNodeRatio;
    // Tiny particles 0.5–1.5, bright nodes 2–4, matching the spec's pixel sizes.
    sizes[i] = bright ? 2 + rand() * 2 : 0.5 + rand();
    seeds[i] = rand();
    // Bright nodes skew toward white and gold so the accents land on the
    // particles big enough to actually register as accents.
    const colour = pickColour(bright ? rand() * 0.35 + 0.65 : rand());
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
    if (bright) nodeIndices.push(i);
  }

  const nodePositions = new Float32Array(nodeIndices.length * 3);
  nodeIndices.forEach((index, n) => {
    nodePositions[n * 3] = positions[index * 3];
    nodePositions[n * 3 + 1] = positions[index * 3 + 1];
    nodePositions[n * 3 + 2] = positions[index * 3 + 2];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNoiseStrength: { value: config.noiseStrength },
      uNoiseSpeed: { value: config.noiseSpeed },
      uBreath: { value: 1 },
      uPointer: { value: new THREE.Vector3(0, -9999, 0) },
      uPointerActive: { value: 0 },
      uRepulsionRadius: { value: config.mouseRepulsion },
      uRepulsionStrength: { value: config.mouseRepulsionStrength },
      uSize: { value: config.particleSize },
      uOpacity: { value: config.particleOpacity },
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Additive, and therefore depth-write off: with additive blending the draw
    // order stops mattering for colour, but a depth buffer would still let
    // whichever particle drew first occlude the ones behind it.
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    material,
    nodePositions,
    update(elapsed, pointer) {
      const u = material.uniforms;
      u.uTime.value = elapsed;
      u.uBreath.value =
        1 + Math.sin((elapsed / config.breathPeriod) * Math.PI * 2) * config.breathAmount;
      if (pointer) {
        u.uPointer.value.copy(pointer);
        u.uPointerActive.value = Math.min(1, (u.uPointerActive.value as number) + 0.08);
      } else {
        u.uPointerActive.value = Math.max(0, (u.uPointerActive.value as number) - 0.05);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}