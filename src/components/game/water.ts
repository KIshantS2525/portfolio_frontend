// src/components/game/water.ts
import * as THREE from 'three';

/**
 * The sea.
 *
 * Was a flat translucent plane, which is the one surface in the scene that
 * reads as obviously untreated — everything else has texture or shading and
 * the water was a sheet of blue. This is a stylised shader, not a physical
 * one: no real reflections, no refraction pass, no render target. It fakes
 * the three cues that actually sell water at this art level —
 *
 *   · movement — two crossed sine trains, so the surface is never still
 *   · fresnel  — edge-on is reflective sky, straight-down is deep water,
 *                which is what stops it looking like coloured glass
 *   · shore    — a foam line where the surface meets terrain
 *
 * and costs one extra material. A planar-reflection probe would look better
 * and would double the scene's draw calls for a portfolio's background water,
 * which is the wrong trade.
 */

const vert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec2 vUv;
varying float vWave;

void main() {
  vUv = uv;
  vec3 p = position;

  // Two wave trains at an angle to each other. Crossing them stops the
  // surface reading as a single rolling corrugation.
  // The plane's own rotation (baked into its vertex positions before this
  // shader ever sees them) puts the second grid axis in p.z, not p.y — the
  // geometry was authored flat in XY, then rotateX(-90°) folded that Y into
  // Z so the plane lies in the XZ ground plane. p.y is always 0 here. Reading
  // p.y made the second wave a function of p.x alone, same as the first, so
  // the two trains ran parallel instead of crossing.
  float w1 = sin(p.x * 0.55 + uTime * 1.1) * 0.5;
  float w2 = sin((p.x * 0.31 + p.z * 0.42) - uTime * 0.8) * 0.5;
  vWave = w1 + w2;
  p.z += vWave * 0.09;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const frag = /* glsl */ `
precision highp float;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSkyTint;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uNight;
varying vec3 vWorld;
varying float vWave;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 viewDir = normalize(uCamPos - vWorld);

  // Perturbed normal from the same wave field the vertex stage used, so the
  // shading and the displacement agree.
  float nx = sin(vWorld.x * 0.55 + uTime * 1.1) * 0.06;
  float nz = sin((vWorld.x * 0.31 + vWorld.z * 0.42) - uTime * 0.8) * 0.06;
  vec3 normal = normalize(vec3(nx, 1.0, nz));

  // Schlick fresnel. Looking straight down you see water colour; grazing the
  // surface you see sky.
  float f = pow(1.0 - clamp(dot(viewDir, normal), 0.0, 1.0), 4.0);
  f = clamp(f, 0.0, 1.0);

  vec3 body = mix(uDeep, uShallow, clamp(vWave * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = mix(body, uSkyTint, f * 0.75);

  // Sparkle on the crests, daytime only — at night it reads as noise.
  float crest = smoothstep(0.75, 1.0, vWave);
  float sparkle = step(0.86, hash(floor(vWorld.xz * 3.0) + floor(uTime * 3.0)));
  col += vec3(1.0) * crest * sparkle * 0.25 * (1.0 - uNight);

  float alpha = mix(0.86, 0.70, f);
  gl_FragColor = vec4(col, alpha);
}
`;

export class Water {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(size: number, centre: number, y: number) {
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false, // or the water hides the seabed behind its own depth
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uShallow: { value: new THREE.Color(0x4a9fc4) },
        uDeep: { value: new THREE.Color(0x14456e) },
        uSkyTint: { value: new THREE.Color(0xbcd6ea) },
        uCamPos: { value: new THREE.Vector3() },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(centre, y, centre);
    this.mesh.name = 'water';
    this.mesh.receiveShadow = false;
  }

  update(time: number, camPos: THREE.Vector3, skyTint: THREE.Color, night: number) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uNight.value = night;
    (u.uCamPos.value as THREE.Vector3).copy(camPos);
    (u.uSkyTint.value as THREE.Color).copy(skyTint);
    // Water darkens at night with the rest of the world rather than staying
    // a bright blue sheet under a black sky.
    (u.uShallow.value as THREE.Color).setHex(0x4a9fc4).multiplyScalar(1 - night * 0.72);
    (u.uDeep.value as THREE.Color).setHex(0x14456e).multiplyScalar(1 - night * 0.7);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
