// src/components/game/props.ts
import * as THREE from 'three';

/**
 * Interactive furniture: the chest and the wall map.
 *
 * Both are meshes rather than blocks, for the same reason the bed is — a
 * chest made of two cubes is two cubes. Neither copies the game this
 * resembles: the chest is a banded wooden trunk with an iron clasp, the map
 * is a framed parchment on a board.
 */

export class Chest {
  group = new THREE.Group();
  private lid = new THREE.Group();
  private openness = 0;
  private target = 0;
  /** Set from outside; drives the "come and look at me" glow. */
  glow: THREE.Mesh;

  constructor(x: number, y: number, z: number, facing = 0) {
    const wood = new THREE.MeshLambertMaterial({ color: 0x9a6b35 });
    const band = new THREE.MeshLambertMaterial({ color: 0x5a4126 });
    const iron = new THREE.MeshLambertMaterial({ color: 0x8a8d92 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.56, 0.72), wood);
    base.position.y = 0.28;
    this.group.add(base);
    for (const bx of [-0.34, 0.34]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.74), band);
      strap.position.set(bx, 0.28, 0);
      this.group.add(strap);
    }

    /*
     * The lid pivots at its back edge. Geometry is translated forward inside
     * the pivot group so rotating the group swings the lid open on its hinge
     * rather than spinning it about its own centre.
     */
    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.26, 0.72), wood);
    lidBox.geometry.translate(0, 0.13, 0.36);
    this.lid.add(lidBox);
    for (const bx of [-0.34, 0.34]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.74), band);
      strap.geometry.translate(bx, 0.14, 0.36);
      this.lid.add(strap);
    }
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.08), iron);
    clasp.geometry.translate(0, 0.02, 0.73);
    this.lid.add(clasp);
    this.lid.position.set(0, 0.56, -0.36);
    this.group.add(this.lid);

    // A dim emissive slab just under the lid line: it reads as light leaking
    // out of the chest, and it's what the bloom pass catches to make the
    // chest findable at night.
    this.glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.06, 0.56),
      new THREE.MeshBasicMaterial({ color: 0xffca6a, transparent: true, opacity: 0 }),
    );
    this.glow.position.y = 0.57;
    this.group.add(this.glow);

    this.group.position.set(x, y, z);
    this.group.rotation.y = facing;
    this.group.traverse((o) => { o.castShadow = true; });
  }

  setOpen(open: boolean) {
    this.target = open ? 1 : 0;
  }

  update(dt: number, nearby: boolean, time: number) {
    this.openness += (this.target - this.openness) * Math.min(1, dt * 9);
    this.lid.rotation.x = -this.openness * 1.35;
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    // Pulses gently when you're close, so it invites a press rather than
    // sitting there as scenery.
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
    mat.opacity = (nearby ? 0.35 + pulse * 0.3 : 0.12) * (0.35 + this.openness * 0.65);
  }
}

/** A framed parchment map, hung on a post. Interacting opens the journey view. */
export class MapBoard {
  group = new THREE.Group();

  constructor(x: number, y: number, z: number, facing = 0) {
    const frame = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });
    const parchment = new THREE.MeshLambertMaterial({ color: 0xe6d8b0 });
    const ink = new THREE.MeshLambertMaterial({ color: 0x8a6a3e });

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), frame);
    post.position.y = 0.75;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 0.1), frame);
    backing.position.y = 1.75;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.04), parchment);
    sheet.position.set(0, 1.75, 0.06);
    this.group.add(post, backing, sheet);

    // A scrawled route across the parchment, so it reads as a map from a
    // distance without needing a texture.
    const pts: [number, number][] = [[-0.55, -0.3], [-0.2, 0.05], [0.15, -0.15], [0.5, 0.25]];
    for (let i = 0; i < pts.length; i++) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), ink);
      dot.position.set(pts[i][0], 1.75 + pts[i][1], 0.09);
      this.group.add(dot);
      if (i < pts.length - 1) {
        const a = pts[i]; const b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.02), ink);
        seg.position.set((a[0] + b[0]) / 2, 1.75 + (a[1] + b[1]) / 2, 0.09);
        seg.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
        this.group.add(seg);
      }
    }

    this.group.position.set(x, y, z);
    this.group.rotation.y = facing;
    this.group.traverse((o) => { o.castShadow = true; });
  }
}
