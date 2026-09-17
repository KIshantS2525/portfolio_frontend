// src/components/collapse/cityScale.ts
import * as THREE from 'three';

/**
 * The city shrinks as you walk away from it.
 *
 * Not perspective — an actual scale, applied faster than distance alone would
 * explain, so the city can never be lost and never be escaped. Walk back and it
 * swells to full size again. The effect is that the place behaves like a model
 * on a table: the void stops reading as somewhere you could go and starts
 * reading as a statement that there is nothing out there.
 *
 * ── Everything scales together, including the page ──
 *
 * One group holds the whole city: the fallen poster, the project blocks, the
 * monument, and whatever later slices add to it. The poster is in there because
 * the page IS the city — a sheet staying put while the buildings standing on it
 * shrank would be a bug, not an effect.
 *
 * The ground and the sky are not in it. They are the world the city sits in.
 *
 * ── The rule this file exists to enforce ──
 *
 * The handover calls this out as the bug most likely to survive testing and
 * turn up in a demo: if the visual scale and the collision ever disagree, you
 * get invisible walls standing in empty space, and it only happens when the
 * player is far from the city, which is exactly when nobody is looking.
 *
 * So there is no second copy of the geometry to keep in step. Collision still
 * asks the same unscaled grids it always did; `toCity` converts the query point
 * out of world space through the SAME scale the group is drawn with, every
 * frame, from the same number. They cannot drift, because there is only one.
 *
 * ── Why it never engages while you are in the city ──
 *
 * The blend starts beyond the city's own radius plus a margin, so inside the
 * streets the scale is exactly 1 and the world is ordinary. That also keeps the
 * collision conversion exactly the identity where it matters most — among
 * buildings, where the controller's whole-metre snapping assumes it.
 */

/** How small the city gets, at the far end of the blend. */
const MIN_SCALE = 0.15;

/** Clear air beyond the city's own radius before anything starts to shrink, metres. */
const MARGIN_M = 80;

/** Distance over which the scale runs from 1 to MIN_SCALE, metres. */
const RANGE_M = 420;

export type CityScale = {
  /** The parent every part of the city is added to. */
  group: THREE.Group;
  /** On only while the player is walking. Cutscene cameras fly far from the city and must not trigger it. */
  setEnabled: (enabled: boolean) => void;
  update: (cameraPosition: THREE.Vector3) => void;
  /** World point → the city's own unscaled space, for collision queries. */
  toCity: (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
};

export function createCityScale(scene: THREE.Scene): CityScale {
  const group = new THREE.Group();
  group.name = 'collapse-city';
  scene.add(group);

  /*
   * The anchor the city scales around, and the radius the blend starts outside.
   * Filled in by `measure` once the city's contents exist — a group's bounding
   * box is only meaningful after something is in it.
   */
  const centre = new THREE.Vector3();
  let radius = 100;
  let measured = false;
  let enabled = false;
  let scale = 1;

  function measure() {
    const boxScale = group.scale.x;
    /* Measured at scale 1: the box has to describe the city, not its current size. */
    group.scale.setScalar(1);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    box.getCenter(centre);
    /*
     * Ground-plane radius only. The city is hundreds of metres long and tens
     * tall, and including height would push the blend start out for no reason.
     */
    centre.y = 0;
    radius = Math.max(Math.abs(box.max.x - centre.x), Math.abs(box.max.z - centre.z));
    measured = true;
    group.scale.setScalar(boxScale);
  }

  function apply(next: number) {
    scale = next;
    group.scale.setScalar(next);
    /*
     * Scaling about `centre` rather than the origin, done by hand because
     * three has no pivot: a point p ends up at centre + (p − centre)·s, which is
     * p·s + centre·(1 − s).
     */
    group.position.copy(centre).multiplyScalar(1 - next);
  }

  return {
    group,

    setEnabled(next) {
      enabled = next;
      if (!measured) measure();
      if (!next) apply(1);
    },

    update(cameraPosition) {
      if (!enabled) return;
      if (!measured) measure();
      const dx = cameraPosition.x - centre.x;
      const dz = cameraPosition.z - centre.z;
      const out = Math.sqrt(dx * dx + dz * dz) - radius - MARGIN_M;
      const t = THREE.MathUtils.smoothstep(out, 0, RANGE_M);
      apply(1 + (MIN_SCALE - 1) * t);
    },

    toCity(x, y, z, out) {
      if (scale === 1) return out.set(x, y, z);
      return out.set(
        centre.x + (x - centre.x) / scale,
        y / scale,
        centre.z + (z - centre.z) / scale,
      );
    },

    dispose() {
      scene.remove(group);
    },
  };
}