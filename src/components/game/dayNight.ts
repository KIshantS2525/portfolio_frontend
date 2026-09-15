// src/components/game/dayNight.ts
import * as THREE from 'three';
import { Sky } from '@/components/game/sky';

/**
 * The day/night cycle.
 *
 * Previously this was a switch: `night` was a boolean and everything lerped
 * between exactly two palettes, which meant the two most interesting moments
 * in a day — golden hour and blue hour — didn't exist. This is a continuous
 * cycle instead. One phase value in [0,1) drives the sun's position, and
 * *everything else is derived from the sun's elevation*: sky colours, light
 * intensity and colour, ambient fill, fog colour and density, and the night
 * factor the mobs key off.
 *
 * Deriving it all from one number is the point. The alternative — separate
 * timelines for sky, light and fog — is how you end up with an orange sky
 * lit by white noon sunlight.
 *
 * The pull cord still works: it now scrubs the clock to dawn or dusk rather
 * than flipping a boolean, so it's a fast-forward through the cycle.
 */

/** Seconds of real time per in-game day. */
const DAY_LENGTH = 210;

/** Keyframes, keyed by sun elevation (sin of the sun's angle above horizon). */
type Palette = { zenith: number; horizon: number; tint: number; sun: number; ambSky: number; ambGround: number; fog: number };

const NIGHT: Palette = {
  zenith: 0x05070f, horizon: 0x0d1526, tint: 0x24406e,
  sun: 0x9fb4e8, ambSky: 0x1b2440, ambGround: 0x0d0f18, fog: 0x0a1120,
};
const TWILIGHT: Palette = {
  zenith: 0x1d2a55, horizon: 0x8a5a72, tint: 0xd97a5a,
  sun: 0xd98a6a, ambSky: 0x4a5480, ambGround: 0x2a2634, fog: 0x453a52,
};
const GOLDEN: Palette = {
  zenith: 0x4a7fb5, horizon: 0xf0b27a, tint: 0xffa25c,
  sun: 0xffb877, ambSky: 0x9fb6d8, ambGround: 0x5a4a38, fog: 0xd7b391,
};
const DAY: Palette = {
  zenith: 0x2f6fc0, horizon: 0xbcd6ea, tint: 0xffe2b0,
  sun: 0xfff3dc, ambSky: 0xa8c6e8, ambGround: 0x4a4436, fog: 0xc2d8e8,
};

function lerpHex(a: number, b: number, t: number, out: THREE.Color) {
  out.setHex(a).lerp(_tmp.setHex(b), t);
  return out;
}
const _tmp = new THREE.Color();

export class DayNight {
  /** 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk. */
  phase = 0.30;
  /** The current horizon colour, so the water can tint its fresnel to match. */
  get skyTint(): THREE.Color { return this.cHorizon; }

  /** 0 full day .. 1 full night — what mob spawning and the HUD read. */
  factor = 0;
  /** True once it's dark enough for hostiles. Kept for call sites that want a boolean. */
  night = false;
  paused = false;

  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  sky: Sky;
  scene: THREE.Scene;

  private sunDir = new THREE.Vector3();
  private cZenith = new THREE.Color();
  cHorizon = new THREE.Color();
  private cTint = new THREE.Color();
  private cFog = new THREE.Color();
  private elapsed = 0;

  constructor(scene: THREE.Scene, shadowRadius = 34) {
    this.scene = scene;

    /*
     * One shadow-casting directional light for the sun, one dimmer one for
     * the moon. Two lights rather than one that changes colour, because the
     * moon has to keep casting while the sun is below the horizon, and a
     * single light would have to teleport across the sky at dusk.
     */
    this.sun = new THREE.DirectionalLight(0xfff3dc, 2.2);
    this.sun.castShadow = true;
    this.configureShadow(this.sun, shadowRadius, 2048);
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9fb4e8, 0.0);
    this.moon.castShadow = true;
    this.configureShadow(this.moon, shadowRadius, 1024);
    scene.add(this.moon, this.moon.target);

    this.ambient = new THREE.HemisphereLight(0xa8c6e8, 0x4a4436, 1.0);
    scene.add(this.ambient);

    this.sky = new Sky();
    scene.add(this.sky.mesh);

    // Exponential-squared fog: denser falloff than linear, which is what
    // gives distant terrain that "dissolving into the air" look rather than
    // a visible cutoff plane.
    scene.fog = new THREE.FogExp2(0xc2d8e8, 0.012);
  }

  private configureShadow(light: THREE.DirectionalLight, r: number, size: number) {
    const cam = light.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 0.5; cam.far = r * 4;
    light.shadow.mapSize.set(size, size);
    // Bias fights shadow acne on the big flat block faces; normalBias does
    // most of the work here because every surface is axis-aligned.
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.06;
  }

  /** Jump the clock — used by the pull cord and by sleeping. */
  setPhase(p: number) {
    this.phase = ((p % 1) + 1) % 1;
  }

  /**
   * The current phase, as a word.
   *
   * Derived from sun elevation and direction of travel, not from the clock —
   * the first version computed this from `phase` while the palette came from
   * elevation, so the HUD cheerfully said "Golden hour" during what was
   * rendering as flat midday. One source or they drift.
   */
  get label(): string {
    const ang = (this.phase - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const rising = Math.cos(ang) > 0;
    if (elev < -0.28) return 'Night';
    if (elev < -0.08) return rising ? 'Dawn' : 'Twilight';
    if (elev < 0.12) return rising ? 'Sunrise' : 'Sunset';
    // 0.30 is where the GOLDEN→DAY smoothstep passes ~0.6, i.e. where the
    // sky stops being visibly warm. Picked from the blend, not by feel, so
    // the word and the picture change at the same moment.
    if (elev < 0.30) return rising ? 'Morning' : 'Golden hour';
    return 'Midday';
  }

  /** Nearest dawn (0.26) or noon (0.5), for "wake up" transitions. */
  skipToMorning() {
    this.setPhase(0.27);
  }

  /** Back-compat with the old boolean API: jump to noon or midnight. */
  setNight(night: boolean) {
    this.setPhase(night ? 0.0 : 0.42);
  }

  update(dt: number, focus: THREE.Vector3) {
    this.elapsed += dt;
    if (!this.paused) this.phase = (this.phase + dt / DAY_LENGTH) % 1;

    // Sun angle: phase 0.25 = sunrise (elevation 0, east), 0.5 = noon.
    const ang = (this.phase - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.55, elev, Math.cos(ang) * 0.45 + 0.25).normalize();

    /*
     * Blend the palette by elevation, not by clock time, so sunrise and
     * sunset are automatically symmetric and the same code serves both.
     */
    let pa: Palette, pb: Palette, t: number;
    if (elev < -0.12) { pa = NIGHT; pb = TWILIGHT; t = THREE.MathUtils.smoothstep(elev, -0.32, -0.12); }
    else if (elev < 0.06) { pa = TWILIGHT; pb = GOLDEN; t = THREE.MathUtils.smoothstep(elev, -0.12, 0.06); }
    /*
     * Wide on purpose. At [0.06, 0.34] the warm palette was gone before the
     * sun had properly cleared the horizon, so golden hour lasted a couple of
     * seconds and the spec's "visual showcase" never happened. Holding the
     * warm mix until the sun is high gives a long, slow warm-to-neutral ramp
     * in the morning and the reverse in the evening.
     */
    else { pa = GOLDEN; pb = DAY; t = THREE.MathUtils.smoothstep(elev, 0.08, 0.48); }

    lerpHex(pa.zenith, pb.zenith, t, this.cZenith);
    lerpHex(pa.horizon, pb.horizon, t, this.cHorizon);
    lerpHex(pa.tint, pb.tint, t, this.cTint);
    lerpHex(pa.fog, pb.fog, t, this.cFog);

    // Night factor: fully night below the horizon, fully day once the sun is
    // properly up. Mobs read this, so the crossover is where dusk "turns".
    this.factor = 1 - THREE.MathUtils.smoothstep(elev, -0.14, 0.12);
    this.night = this.factor > 0.5;

    // Sun: intensity ramps with elevation and dies at the horizon.
    const sunUp = Math.max(0, elev);
    // Two curves multiplied: a fast gate at the horizon (so the sun switches
    // off cleanly at dusk) times a slow climb (so midday is visibly brighter
    // than mid-morning instead of the whole day being one flat exposure).
    this.sun.intensity =
      THREE.MathUtils.smoothstep(elev, -0.06, 0.14)
      * THREE.MathUtils.lerp(0.55, 1.0, THREE.MathUtils.smoothstep(elev, 0.05, 0.6))
      * 2.9;
    this.sun.color.copy(lerpHex(pa.sun, pb.sun, t, _tmp));
    this.sun.visible = this.sun.intensity > 0.001;

    this.moon.intensity = this.factor * 0.42;
    this.moon.visible = this.moon.intensity > 0.001;

    // Ambient fill. Never zero — shadows must not crush to black.
    this.ambient.intensity = THREE.MathUtils.lerp(0.28, 1.0, 1 - this.factor);
    this.ambient.color.copy(lerpHex(pa.ambSky, pb.ambSky, t, _tmp));
    this.ambient.groundColor.copy(lerpHex(pa.ambGround, pb.ambGround, t, _tmp));

    /*
     * Both shadow casters follow the player. A directional light's shadow
     * camera is a fixed-size box; if it stays at the origin, the player walks
     * out of it and their shadow — and every shadow near them — vanishes.
     */
    this.placeLight(this.sun, this.sunDir, focus, 60);
    this.placeLight(this.moon, this.sunDir.clone().negate(), focus, 60);

    // Fog thickens at night and in twilight haze, thins at midday.
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.cFog);
    fog.density = THREE.MathUtils.lerp(0.0085, 0.030, this.factor)
      + (1 - Math.abs(elev)) * 0.004; // extra haze when the sun is low
    void sunUp;

    this.sky.update(this.sunDir, this.factor, this.cZenith, this.cHorizon, this.cTint, this.elapsed);
    this.sky.mesh.position.copy(focus);
  }

  private placeLight(light: THREE.DirectionalLight, dir: THREE.Vector3, focus: THREE.Vector3, dist: number) {
    light.position.set(focus.x + dir.x * dist, focus.y + dir.y * dist, focus.z + dir.z * dist);
    light.target.position.copy(focus);
    light.target.updateMatrixWorld();
  }

  dispose() {
    this.sky.dispose();
  }
}
