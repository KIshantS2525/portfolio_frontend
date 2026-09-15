// src/components/game/sky.ts
import * as THREE from 'three';

/**
 * The sky dome.
 *
 * Written from scratch against three.js. The *techniques* here — a
 * height-based gradient standing in for Rayleigh scattering, a warm horizon
 * band that swells as the sun drops, a fixed star field that fades in at
 * twilight — are standard atmospheric rendering, but none of the code is
 * ported from anywhere.
 *
 * Rendered on the inside of a big sphere with depth writing off, so it sits
 * behind everything without needing to be part of the depth sort. Every
 * colour decision keys off `uSunDir.y` (the sun's elevation) rather than a
 * clock, so the sky, the lights and the fog can all be driven from one number
 * and can't drift out of agreement.
 */

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  // Kill translation so the dome is always centred on the camera: the sky
  // must not parallax as the player walks, or the horizon slides.
  mat4 rotOnly = modelViewMatrix;
  rotOnly[3].xyz = vec3(0.0);
  vec4 pos = projectionMatrix * rotOnly * vec4(position, 1.0);
  gl_Position = pos.xyww; // force z = w -> depth 1.0, always furthest
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform vec3 uSunDir;
uniform float uNight;     // 0 day .. 1 night, for star/moon fade
uniform float uTime;

// Zenith/horizon colours for each phase, blended on the CPU side and handed
// in already mixed, so the shader stays cheap.
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunTint;    // warm band colour near the sun

// Cheap hash-based star field. A texture would be one more asset to ship for
// something that is, in the end, white dots at fixed directions.
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float stars(vec3 dir) {
  vec3 g = floor(dir * 190.0);
  float h = hash(g);
  // Only a small fraction of cells contain a star, so the sky isn't static.
  float star = smoothstep(0.9965, 1.0, h);
  // Gentle twinkle, different phase per cell.
  float tw = 0.75 + 0.25 * sin(uTime * 1.7 + h * 63.0);
  return star * tw;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -1.0, 1.0);

  // Gradient: saturated overhead, pale and hazy toward the horizon. The pow
  // keeps most of the sky the zenith colour and compresses the transition
  // into the last stretch above the horizon, which is how real sky reads.
  float t = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);

  // Below the horizon, fall off into a dim ground haze rather than a hard
  // edge — the player can look down past the terrain at the world's rim.
  col = mix(col * 0.55, col, smoothstep(-0.25, 0.02, h));

  // Warm scattering around the sun, widest when the sun is near the horizon.
  float sunDot = max(dot(dir, uSunDir), 0.0);
  float lowSun = 1.0 - clamp(abs(uSunDir.y) * 2.2, 0.0, 1.0);
  float glow = pow(sunDot, mix(14.0, 3.0, lowSun));
  col += uSunTint * glow * (0.45 + lowSun * 1.5);

  // Horizon band: the orange/pink smear that makes golden hour read.
  float band = pow(1.0 - abs(h), 9.0) * lowSun;
  col += uSunTint * band * 0.75;

  // The sun disc. Blocky world, but a hard-edged square sun looks like a bug,
  // so it's a soft disc with a tight core.
  float disc = smoothstep(0.9987, 0.9995, sunDot);
  col += vec3(1.0, 0.94, 0.82) * disc * 2.4 * (1.0 - uNight);

  // The moon sits opposite the sun, and only matters at night.
  vec3 moonDir = -uSunDir;
  float moonDot = max(dot(dir, moonDir), 0.0);
  float moonDisc = smoothstep(0.9990, 0.9996, moonDot);
  float moonHalo = pow(moonDot, 260.0);
  col += vec3(0.82, 0.86, 1.0) * (moonDisc * 1.5 + moonHalo * 0.35) * uNight;

  // Stars, above the horizon only, fading in with night.
  col += vec3(0.9, 0.93, 1.0) * stars(dir) * uNight * smoothstep(-0.02, 0.2, h);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uNight: { value: 0 },
        uTime: { value: 0 },
        uZenith: { value: new THREE.Color(0x2f6fc0) },
        uHorizon: { value: new THREE.Color(0xbcd6ea) },
        uSunTint: { value: new THREE.Color(0xffd9a0) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000; // before everything else
    this.mesh.name = 'sky';
  }

  update(sunDir: THREE.Vector3, night: number, zenith: THREE.Color, horizon: THREE.Color, tint: THREE.Color, time: number) {
    const u = this.mat.uniforms;
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    u.uNight.value = night;
    u.uTime.value = time;
    (u.uZenith.value as THREE.Color).copy(zenith);
    (u.uHorizon.value as THREE.Color).copy(horizon);
    (u.uSunTint.value as THREE.Color).copy(tint);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
