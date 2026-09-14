// src/components/game/dayNight.ts
import * as THREE from 'three';

/**
 * Day and night here are a switch, not a clock — the same mechanic the site
 * uses for its own theme, because the brief for this room was explicitly
 * "day/night again, by pull cord," not a real-time cycle. `night` is the
 * target; `factor` eases toward it over ~2.5s so the sky and light actually
 * transition instead of cutting, and it's `factor` — not the raw boolean —
 * that mobs check, so they fade in around the midpoint of the transition
 * rather than popping in the instant the cord is pulled.
 */
export class DayNight {
  night = false;
  factor = 0; // 0 = full day, 1 = full night
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.6);
    this.sun.position.set(30, 40, 10);
    scene.add(this.sun, this.sun.target);

    this.ambient = new THREE.HemisphereLight(0xbcd6ff, 0x3a3226, 0.9);
    scene.add(this.ambient);

    scene.fog = new THREE.Fog(0xbfe0f5, 20, 90);
    scene.background = new THREE.Color(0xbfe0f5);
  }

  setNight(night: boolean) {
    this.night = night;
  }

  update(dt: number) {
    const target = this.night ? 1 : 0;
    this.factor += (target - this.factor) * Math.min(1, dt * 1.6);

    const day = new THREE.Color(0xbfe0f5);
    const dusk = new THREE.Color(0x0c1024);
    const sky = day.clone().lerp(dusk, this.factor);
    (this.scene.background as THREE.Color).copy(sky);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(sky);

    this.sun.intensity = THREE.MathUtils.lerp(1.6, 0.05, this.factor);
    this.sun.position.set(30 - this.factor * 20, 40 - this.factor * 30, 10);
    this.ambient.intensity = THREE.MathUtils.lerp(0.9, 0.2, this.factor);
    this.ambient.color.set(0xbcd6ff).lerp(new THREE.Color(0x40507a), this.factor);
  }
}
