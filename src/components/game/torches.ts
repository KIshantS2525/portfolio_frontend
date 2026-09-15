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

/*
 * Bumped again (10 → 14) once the house interior gained a hearth and three
 * hanging lanterns on top of its existing torch ring — with those, "inside
 * the house at night" alone is comfortably a dozen light sources, and the
 * budget needs enough headroom that none of them get bumped out by a
 * village torch that happens to be a touch closer.
 */
/*
 * Bumped again (14 → 18): the map now has a full lamp-post ring around the
 * plateau plus a small lit village green on top of the house interior's own
 * dozen-plus fixtures, so a player standing between the house and the
 * village can plausibly have torches from both areas competing for the
 * pool at once.
 */
/*
 * Bumped again (14 → 18): the map now has a full lamp-post ring around the
 * plateau plus a small lit village green on top of the house interior's own
 * dozen-plus fixtures, so a player standing between the house and the
 * village can plausibly have torches from both areas competing for the
 * pool at once.
 */
const LIGHT_BUDGET = 18;

/**
 * Which physical fixture a light is: a classic outdoor torch (flickering,
 * warm), or one of two modern indoor fixtures for the house (steady,
 * cleaner-white) — a ceiling tube and a hanging/wall bulb. `'none'` is a
 * light with no visible fixture at all, for spots (the fireplace) that
 * already have their own purpose-built glow mesh and don't need a second,
 * redundant prop stacked on top of it.
 */
export type FixtureStyle = 'torch' | 'tube' | 'bulb' | 'none';

export type Torch = { pos: THREE.Vector3; flame: THREE.Mesh | null; phase: number; style: FixtureStyle };

export class Torches {
  group = new THREE.Group();
  private torches: Torch[] = [];
  private lights: THREE.PointLight[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private stickMat: THREE.MeshLambertMaterial;
  private tubeGlowMat: THREE.MeshBasicMaterial;
  private bulbGlowMat: THREE.MeshBasicMaterial;
  private fixtureMat: THREE.MeshLambertMaterial;
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
    // Modern fixtures: a cool, clean white glow instead of the torches'
    // warm flame-orange — that contrast is the whole point of the request,
    // "the house should look like a modern room, not a campsite indoors".
    this.tubeGlowMat = new THREE.MeshBasicMaterial({ color: 0xeaf4ff });
    this.bulbGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
    this.fixtureMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });

    for (let i = 0; i < LIGHT_BUDGET; i++) {
      const l = new THREE.PointLight(0xffa851, 0, 13, 1.6);
      l.visible = false;
      this.lights.push(l);
      scene.add(l);
    }
  }

  add(x: number, y: number, z: number, style: FixtureStyle = 'torch') {
    if (style === 'torch') {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.11), this.stickMat);
      stick.position.set(x, y + 0.27, z);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.17), this.flameMat);
      flame.position.set(x, y + 0.63, z);
      this.group.add(stick, flame);
      this.torches.push({ pos: new THREE.Vector3(x, y + 0.63, z), flame, phase: Math.random() * 6.28, style });
    } else if (style === 'tube') {
      // A ceiling-mounted fluorescent tube: a plain housing with a long
      // glowing bar underneath, ~0.9 blocks so it reads as a fixture rather
      // than a light bulb.
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.14), this.fixtureMat);
      housing.position.set(x, y, z);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.09), this.tubeGlowMat);
      glow.position.set(x, y - 0.03, z);
      this.group.add(housing, glow);
      this.torches.push({ pos: new THREE.Vector3(x, y - 0.05, z), flame: glow, phase: 0, style });
    } else if (style === 'bulb') {
      // A wall-mounted bulb on a short backplate — the sconce version of
      // the tube, for spots (corners, gallery walls) too small for a
      // ceiling fixture to make sense.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), this.fixtureMat);
      plate.position.set(x, y, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), this.bulbGlowMat);
      bulb.position.set(x, y, z + 0.08);
      this.group.add(plate, bulb);
      this.torches.push({ pos: new THREE.Vector3(x, y, z + 0.08), flame: bulb, phase: 0, style });
    } else {
      // 'none': light only, no fixture mesh — used where a spot already has
      // its own dedicated glow (the fireplace's firebox plane).
      this.torches.push({ pos: new THREE.Vector3(x, y, z), flame: null, phase: 0, style });
    }
  }

  /**
   * Hands the light pool to the nearest torches and flickers them.
   * `nightFactor` fades the whole thing out by day — a torch burning at noon
   * washes the scene out for no visual gain. Modern fixtures don't fade with
   * the day/night cycle the way outdoor torches do (a light switch doesn't
   * care what time it is) — they still key off `lit` so the house isn't lit
   * from outer space when nobody's home, but they hold steady rather than
   * dimming to an ember at dawn.
   */
  update(dt: number, viewer: THREE.Vector3, nightFactor: number, time: number) {
    const lit = Math.max(0.12, nightFactor);
    const indoorLit = Math.max(0.55, nightFactor);

    const near = this.torches
      .map((t) => ({ t, d: t.pos.distanceToSquared(viewer) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHT_BUDGET);

    this.lights.forEach((light, i) => {
      const entry = near[i];
      if (!entry || entry.d > 26 * 26) { light.visible = false; light.intensity = 0; return; }
      const { t } = entry;
      const isModern = t.style === 'tube' || t.style === 'bulb';
      // Flicker only applies to real flame — electric light is steady.
      const f = isModern
        ? 1
        : 0.82 + 0.13 * Math.sin(time * 9 + t.phase) + 0.05 * Math.sin(time * 23.7 + t.phase * 2);
      light.visible = true;
      light.position.copy(t.pos);
      light.color.setHex(t.style === 'tube' ? 0xdcedff : t.style === 'bulb' ? 0xfff0d0 : 0xffa851);
      light.intensity = (t.style === 'tube' ? 10 : t.style === 'bulb' ? 9 : 12) * f * (isModern ? indoorLit : lit);
      light.distance = t.style === 'tube' ? 12 : 15;
    });

    for (const t of this.torches) {
      if (!t.flame) continue;
      if (t.style === 'torch') {
        const f = 0.85 + 0.15 * Math.sin(time * 11 + t.phase);
        t.flame.scale.set(1, f, 1);
      }
    }
    this.flameMat.color.setHex(0xffb347).multiplyScalar(0.6 + lit * 0.7);
    this.tubeGlowMat.color.setHex(0xeaf4ff).multiplyScalar(0.75 + indoorLit * 0.4);
    this.bulbGlowMat.color.setHex(0xfff2d0).multiplyScalar(0.75 + indoorLit * 0.4);
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
    this.tubeGlowMat.dispose();
    this.bulbGlowMat.dispose();
    this.fixtureMat.dispose();
    this.torches.length = 0;
  }
}