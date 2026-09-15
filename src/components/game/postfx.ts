// src/components/game/postfx.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

/**
 * The post chain.
 *
 * Order matters and is the conventional one: scene → AO (needs raw depth and
 * normals, so it goes first) → bloom (needs pre-tonemap HDR values, or the
 * threshold has nothing left to find) → grade → output/sRGB.
 *
 * Everything is kept deliberately restrained. The spec's warning about bloom
 * is the right instinct: the failure mode of this whole stack is a world
 * where every surface glows and nothing reads, which looks worse than no post
 * at all. Threshold sits high enough that only genuinely bright things — the
 * sun disc, torch flames, the moon — cross it.
 */

/**
 * Filmic tonemap + time-of-day grade, written here rather than pulled in.
 *
 * `ACESFilmicToneMapping` is available on the renderer, but doing it in the
 * pass instead lets the grade happen in the same step, on linear values,
 * before the sRGB conversion — which is the only place a lift/gain/saturation
 * tweak behaves predictably.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.04 },
    uContrast: { value: 1.06 },
    uLift: { value: new THREE.Color(0x000000) },
    uGain: { value: new THREE.Color(0xffffff) },
    uVignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uVignette;

    // Narkowicz's ACES approximation — a well-known closed form, not anyone's
    // shader pack. Cheap, and it rolls highlights off instead of clipping the
    // sun and torch flames to flat white.
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;

      // Lift/gain before tonemapping, so the shadow tint reads as ambient
      // colour rather than a wash over the final image.
      col = col * uGain + uLift;
      col = aces(col);

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = mix(vec3(0.5), col, uContrast);

      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * uVignette;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export type PostFX = {
  composer: EffectComposer;
  setSize: (w: number, h: number) => void;
  /** Drives exposure/grade from the cycle, so night is cool and dusk is warm. */
  updateGrade: (nightFactor: number, sunElevation: number) => void;
  /**
   * Eases depth of field in and out. `focus` is the distance to hold sharp.
   * Called every frame so the blur ramps rather than snapping on.
   */
  setFocus: (amount: number, focus: number, dt: number) => void;
  dispose: () => void;
};

export function createPostFX(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  quality: 'high' | 'low',
): PostFX {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let gtao: GTAOPass | null = null;
  if (quality === 'high') {
    /*
     * AO grounds the geometry — without it, a block sitting on the floor and
     * a block floating a hair above it look identical, because both faces get
     * the same flat directional light. Radius is small: this is contact
     * shading in the corners, not a dirt layer over the world.
     */
    gtao = new GTAOPass(scene, camera, width, height);
    gtao.output = GTAOPass.OUTPUT.Default;
    const p = gtao as unknown as { updateGtaoMaterial: (o: Record<string, number>) => void };
    p.updateGtaoMaterial?.({ radius: 0.42, distanceExponent: 1.2, thickness: 1.0, scale: 0.9 });
    composer.addPass(gtao);
  }

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.42, // strength — subtle on purpose
    0.72, // radius
    0.92, // threshold: only the sun, moon and flames get through
  );
  composer.addPass(bloom);

  /*
   * DOF sits before the grade so the blur happens on linear colour, and it is
   * off by default — `maxblur` at 0 makes the pass a cheap passthrough. It
   * only opens up when a board or chest panel is showing, which is the one
   * moment the spec asks for it: the world softens, the thing you're reading
   * stays sharp. Leaving it on permanently is how a game ends up looking like
   * it has a smudged lens.
   */
  const bokeh = quality === 'high'
    ? new BokehPass(scene, camera, { focus: 6, aperture: 0.00022, maxblur: 0.0 })
    : null;
  if (bokeh) composer.addPass(bokeh);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  // Handles the linear→sRGB conversion once, at the end, which is the only
  // correct place for it when a chain is involved.
  composer.addPass(new OutputPass());

  composer.setSize(width, height);

  const lift = grade.uniforms.uLift.value as THREE.Color;
  const gain = grade.uniforms.uGain.value as THREE.Color;

  return {
    composer,
    setSize: (w, h) => {
      composer.setSize(w, h);
      bloom.setSize(w, h);
      gtao?.setSize(w, h);
    },
    updateGrade: (nightFactor, sunElev) => {
      // Open up at night so the world stays readable, and let the low sun
      // push a warm cast without touching the lighting itself.
      grade.uniforms.uExposure.value = THREE.MathUtils.lerp(1.0, 1.28, nightFactor);
      grade.uniforms.uSaturation.value = THREE.MathUtils.lerp(1.06, 0.88, nightFactor);
      grade.uniforms.uContrast.value = THREE.MathUtils.lerp(1.06, 1.12, nightFactor);
      grade.uniforms.uVignette.value = THREE.MathUtils.lerp(0.2, 0.42, nightFactor);

      // Cool blue lift at night, warm gain when the sun is low.
      lift.setRGB(0.0, 0.004, 0.018).multiplyScalar(nightFactor);
      const golden = Math.max(0, 1 - Math.abs(sunElev) * 3.2) * (1 - nightFactor);
      gain.setRGB(1 + golden * 0.10, 1 + golden * 0.015, 1 - golden * 0.06);
      bloom.strength = 0.42 + nightFactor * 0.22;
    },
    setFocus: (amount, focus, dt) => {
      if (!bokeh) return;
      const u = (bokeh as unknown as { uniforms: Record<string, { value: number }> }).uniforms;
      if (!u) return;
      const targetBlur = amount * 0.011;
      u.maxblur.value += (targetBlur - u.maxblur.value) * Math.min(1, dt * 6);
      u.focus.value += (focus - u.focus.value) * Math.min(1, dt * 6);
    },
    dispose: () => {
      composer.dispose();
      bloom.dispose();
      gtao?.dispose();
      bokeh?.dispose();
    },
  };
}
