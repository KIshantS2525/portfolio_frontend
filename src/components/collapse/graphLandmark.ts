// src/components/collapse/graphLandmark.ts
import * as THREE from 'three';
import { knightShape, sphereShape, scatterShape, OUTER, type Vec3 } from '@/components/graph/shapes';

/**
 * The knowledge graph, standing where it is printed.
 *
 * On the page the graph sits to the right of the name in the hero. On the sheet
 * it is printed there, so in the city it hangs over that same patch of ground —
 * the same rule as the name and the project blocks: a thing is where its page
 * was.
 *
 * It is the one landmark you cannot touch. No collision, ever: you walk in
 * through it, stand inside a constellation, and walk out the other side. The
 * plan is explicit about that, and it is what makes it read as a projection of
 * the site rather than another building.
 *
 * ── Proximity is the whole interaction ──
 *
 * Far away it is a loose scatter — barely a shape, just a haze above the page.
 * Walk toward it and it gathers into a sphere. Keep walking, and inside its
 * radius it resolves into the knight from the live site's journey. Walk away
 * and it comes apart again. Nothing is clicked, nothing is prompted; the only
 * verb in this world is walking, so walking has to be the verb here too.
 *
 * ── Reused as-is ──
 *
 * `graph/shapes.ts`, unmodified, exactly as the handover asks. Its generators
 * are index-matched by contract — point i in the scatter is point i in the
 * sphere is point i in the knight — which is what makes the morph a straight
 * lerp between three arrays rather than a correspondence problem.
 */

/** Points in the cloud. Enough to hold a silhouette, few enough to be one cheap draw call. */
const COUNT = 2600;

/** Where the transitions happen, as multiples of the cloud's own radius. */
const NEAR = 1.15;
const FAR = 4.5;

export type GraphLandmark = {
  /**
   * Hidden until the city rises.
   *
   * At the swap the quad has to land on exactly the pixels the DOM sheet was
   * drawing, and a glowing cloud hanging over the page is not on that sheet. It
   * appears with everything else that stands up, and goes again on the way out.
   */
  setVisible: (visible: boolean) => void;
  update: (now: number, cameraPosition: THREE.Vector3) => void;
  dispose: () => void;
};

/**
 * @param footprint the printed graph's rect on the sheet, in world metres
 */
export function createGraphLandmark(
  parent: THREE.Object3D,
  footprint: { x0: number; x1: number; z0: number; z1: number },
): GraphLandmark {
  const width = footprint.x1 - footprint.x0;
  const depth = footprint.z1 - footprint.z0;
  /* Its own size is the printed size, like everything else here. */
  const radius = Math.max(4, Math.min(width, depth) / 2);
  const scale = radius / OUTER;

  const centre = new THREE.Vector3(
    (footprint.x0 + footprint.x1) / 2,
    /* Sitting on the page, not floating over it: the cloud's underside grazes the sheet. */
    radius * 0.92,
    (footprint.z0 + footprint.z1) / 2,
  );

  const far = scatterShape(COUNT, 1.9, 0x51ab);
  const near = sphereShape(COUNT);
  const inner = knightShape(COUNT);

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  /* Four components is three's cue to compile the points shader with per-point alpha. */
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  const material = new THREE.PointsMaterial({
    size: Math.max(0.16, radius * 0.012),
    map: softDot(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    /*
     * Additive, like the live graph. Points that overlap get brighter instead
     * of flatter, which is what makes a few thousand dim specks read as one
     * luminous body from across the city.
     */
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    /* Fog off: additive plus fog subtracts light from the sky behind it and leaves grey smudges. */
    fog: false,
  });

  const points = new THREE.Points(geometry, material);
  points.position.copy(centre);
  points.frustumCulled = false;
  points.name = 'collapse-graph';
  points.visible = false;
  parent.add(points);

  /* Held between frames so the morph eases toward the player's distance rather than snapping to it. */
  let blend = 0;

  return {
    setVisible(visible) {
      points.visible = visible;
    },

    update(now, cameraPosition) {
      if (!points.visible) return;
      /*
       * Distance measured in the city's own space. The cloud is a child of the
       * city group, so when the city shrinks the cloud shrinks with it — but
       * `cameraPosition` is in world metres, and comparing the two directly
       * would make the cloud resolve as the player walks AWAY. Converting
       * through the parent's inverse matrix costs one matrix per frame and
       * keeps the trigger where it looks like it is.
       */
      const local = _v.copy(cameraPosition);
      parent.updateWorldMatrix(true, false);
      _m.copy(parent.matrixWorld).invert();
      local.applyMatrix4(_m);

      const d = Math.hypot(local.x - centre.x, local.z - centre.z) / radius;
      /* 0 far away, 1 standing in it. */
      const target = 1 - THREE.MathUtils.smoothstep(d, NEAR, FAR);
      /* Eased rather than set: a cloud that snapped between forms as you stepped would look like a glitch. */
      blend += (target - blend) * 0.045;

      const spin = now * 0.00005;
      const cos = Math.cos(spin);
      const sin = Math.sin(spin);

      /*
       * Two stages in one number. The first half of the blend gathers the
       * scatter into a sphere; the second half resolves the sphere into the
       * knight. Splitting it this way means the far transition can be slow and
       * atmospheric while the near one is a reveal.
       */
      const gather = THREE.MathUtils.smoothstep(blend, 0, 0.55);
      const resolve = THREE.MathUtils.smoothstep(blend, 0.5, 1);

      for (let i = 0; i < COUNT; i++) {
        const a = far[i];
        const b = near[i];
        const c = inner[i];
        const x = lerp3(a, b, c, 0, gather, resolve);
        const y = lerp3(a, b, c, 1, gather, resolve);
        const z = lerp3(a, b, c, 2, gather, resolve);
        /* Spun about y, so it is always turning slowly whatever shape it is in. */
        positions[i * 3] = (x * cos - z * sin) * scale;
        positions[i * 3 + 1] = y * scale;
        positions[i * 3 + 2] = (x * sin + z * cos) * scale;

        /*
         * Cool while it is a haze, warming toward white as it resolves — and
         * brighter throughout, because a cloud that only changed shape would
         * read as drifting rather than as responding to you.
         */
        const w = 0.35 + 0.65 * blend;
        colors[i * 4] = 0.55 + 0.45 * resolve;
        colors[i * 4 + 1] = 0.62 + 0.3 * resolve;
        colors[i * 4 + 2] = 0.95;
        colors[i * 4 + 3] = w * (0.35 + 0.65 * ((i % 7) / 7));
      }

      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    },

    dispose() {
      parent.remove(points);
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
  };
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function lerp3(a: Vec3, b: Vec3, c: Vec3, axis: 0 | 1 | 2, gather: number, resolve: number): number {
  const ab = a[axis] + (b[axis] - a[axis]) * gather;
  return ab + (c[axis] - ab) * resolve;
}

/** A soft round point, so the cloud is specks of light rather than squares. */
function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}