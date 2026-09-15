// src/components/game/torches.ts
import * as THREE from 'three';

/**
 * Torches.
 *
 * The warm/cool contrast is the single biggest thing that makes a night scene
 * read: cool moonlight everywhere, warm pools around the fires. Without them
 * night is just a dark version of day.
 *
 * The cost here is point lights, and they are genuinely expensive — every
 * additional one recompiles nothing but does add per-fragment work across
 * every lit material in range. So the lights are *pooled*: there can be any
 * number of torch props in the world, but only the nearest `LIGHT_BUDGET` of
 * them actually own a light at any moment, reassigned as the player moves.
 * A torch across the island contributes nothing visible anyway.
 */

const LIGHT_BUDGET = 6;

export type Torch = { pos: THREE.Vector3; flame: THREE.Mesh; phase: number };

export class Torches {
  group = new THREE.Group();
  private torches: Torch[] = [];
  private lights: THREE.PointLight[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private stickMat: THREE.MeshLambertMaterial;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'torches';
    scene.add(this.group);

    // Basic (unlit) material for the flame — it's the light source, so
    // shading it by other lights would be backwards. This is also what the
    // bloom threshold is tuned to catch.
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    this.stickMat = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });

    for (let i = 0; i < LIGHT_BUDGET; i++) {
      const l = new THREE.PointLight(0xffa851, 0, 11, 1.7);
      l.visible = false;
      this.lights.push(l);
      scene.add(l);
    }
  }

  add(x: number, y: number, z: number) {
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.11), this.stickMat);
    stick.position.set(x, y + 0.27, z);
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.17), this.flameMat);
    flame.position.set(x, y + 0.63, z);
    this.group.add(stick, flame);
    this.torches.push({ pos: new THREE.Vector3(x, y + 0.63, z), flame, phase: Math.random() * 6.28 });
  }

  /**
   * Hands the light pool to the nearest torches and flickers them.
   * `nightFactor` fades the whole thing out by day — a torch burning at noon
   * washes the scene out for no visual gain.
   */
  update(dt: number, viewer: THREE.Vector3, nightFactor: number, time: number) {
    const lit = Math.max(0.12, nightFactor);

    const near = this.torches
      .map((t) => ({ t, d: t.pos.distanceToSquared(viewer) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHT_BUDGET);

    this.lights.forEach((light, i) => {
      const entry = near[i];
      if (!entry || entry.d > 26 * 26) { light.visible = false; light.intensity = 0; return; }
      const { t } = entry;
      // Flicker: two out-of-phase sines, so it wavers rather than pulses.
      const f = 0.82 + 0.13 * Math.sin(time * 9 + t.phase) + 0.05 * Math.sin(time * 23.7 + t.phase * 2);
      light.visible = true;
      light.position.copy(t.pos);
      light.intensity = 9.5 * f * lit;
      light.distance = 12;
    });

    for (const t of this.torches) {
      const f = 0.85 + 0.15 * Math.sin(time * 11 + t.phase);
      t.flame.scale.set(1, f, 1);
      (t.flame.material as THREE.MeshBasicMaterial).opacity = 1;
    }
    this.flameMat.color.setHex(0xffb347).multiplyScalar(0.6 + lit * 0.7);
    void dt;
  }

  /**
   * Removes the pooled lights and the torch group from the scene, and frees
   * their geometry/materials. There was no dispose() at all before — the 6
   * pooled PointLights (each with real cost across every lit material in
   * range) and every torch mesh just stayed in the scene graph forever after
   * the game unmounted.
   */
  dispose() {
    for (const light of this.lights) this.scene.remove(light);
    this.lights.length = 0;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
    });
    this.flameMat.dispose();
    this.stickMat.dispose();
    this.torches.length = 0;
  }
}
