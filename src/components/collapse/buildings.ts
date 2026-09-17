// src/components/collapse/buildings.ts
import * as THREE from 'three';
import type { Blueprint, BlueprintBlock } from '@/components/collapse/blueprint';

/**
 * The project buildings: one per Work card, standing on its own card.
 *
 * ── The rules they follow (all locked in the handover) ──
 *
 *   · Solid. No interiors, no doors, nothing to enter.
 *   · One per project, all 29, in page order, single file — which is simply
 *     what StackCards' layout already is, read through the blueprint.
 *   · Uniform height, for now.
 *   · The project's name on the face.
 *
 * ── Exact card dimensions ──
 *
 * The footprint is the card's rect, converted to metres and used as-is: no
 * snapping, no insets, no minimum sizes. A building is its card at its card's
 * proportions, and the 24px gaps between cards are 24px of gap in the world
 * too. An earlier version rounded every edge out to the metre grid and then
 * gave a metre back at each end to open streets, which made every building a
 * different shape from the card it came from — the one thing this is not
 * allowed to be.
 *
 * ── Which leaves collision to catch up ──
 *
 * The player controller is voxel-based: it asks about INTEGER cells and snaps
 * the body to whole-metre faces, and nothing can change that. So the mesh is
 * exact and collision rounds: a metre cell counts as solid when its centre is
 * inside the card. The wall you hit can sit up to half a metre from the wall
 * you see, which on a 50m building is a shoulder's width, and is the right end
 * to lose precision at — the shape you can see is the shape the page has.
 */

/** Height of every building, metres. */
export const BUILDING_HEIGHT_M = 18;

/** Delay between one building starting to rise and the next, in page order. */
const RISE_STAGGER_MS = 95;

/** How long one building takes to reach full height. */
const RISE_MS = 1700;

/** Exit: everything sinks back at once, and quickly. */
const SINK_MS = 650;

/** Dust particles thrown off each building's base as it breaks the surface. */
const DUST_PER_BUILDING = 40;

type Building = {
  group: THREE.Group;
  /** Integer footprint, world metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 0..1, how far out of the ground it currently is. Drives visuals AND collision. */
  risen: number;
  riseStart: number;
};

export type Buildings = {
  /** Staggered rise in page order. Resolves when the last one lands. */
  rise: (reducedMotion: boolean) => Promise<void>;
  /** Everything back under the sheet. Resolves when gone. */
  sink: () => Promise<void>;
  setVisible: (visible: boolean) => void;
  /**
   * Whether the integer cell (x, y, z) is inside a building, at the height it
   * currently stands. Only cells above ground; the ground itself is the
   * caller's rule.
   */
  solidAt: (x: number, y: number, z: number) => boolean;
  update: (now: number) => void;
  dispose: () => void;
};

type Anim = { kind: 'rise' | 'sink'; start: number; from: number[]; resolve: () => void; reduced: boolean };

/**
 * @param metresPerPx poster px → world metres (handoff.ts `metresPerPx`)
 * @param sheetH       poster height in px; the hinge (poster bottom) is at z = 0
 * @param sheetW       poster width in px; the poster's centre line is at x = 0
 */
export function createBuildings(
  /** The city group — everything in here scales together when the player walks away (cityScale.ts). */
  parent: THREE.Object3D,
  blueprint: Blueprint,
  metresPerPx: number,
  sheetW: number,
  sheetH: number,
): Buildings {
  const root = new THREE.Group();
  root.name = 'collapse-buildings';
  parent.add(root);

  /*
   * Everything a building is made of is clipped at the ground plane.
   *
   * The ground does not write depth (environment.ts explains why), so nothing
   * about the ground can hide the part of a building still below it. Without
   * this the rise would be a full-height tower sliding up THROUGH the sheet,
   * visible top to bottom the whole time, rather than a building emerging out
   * of it. Requires `renderer.localClippingEnabled`, set in collapseWorld.ts.
   */
  const groundClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];

  const disposables: { dispose: () => void }[] = [];
  const buildings: Building[] = [];

  /*
   * One shared box geometry, scaled per building. Built with its base at y = 0
   * so the rise is a single `position.y` change on the group.
   */
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const edges = new THREE.EdgesGeometry(box);
  disposables.push(box, edges);

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0xaeb9ff,
    transparent: true,
    opacity: 0.32,
    clippingPlanes: groundClip,
  });
  disposables.push(edgeMat);

  for (const block of blueprint.projects) {
    const b = buildBuilding(block);
    if (b) buildings.push(b);
  }

  function buildBuilding(block: BlueprintBlock): Building | null {
    /* Poster px → world. The poster's bottom edge (the hinge) is z = 0; its top is −sheetH. */
    const worldX0 = (block.x - sheetW / 2) * metresPerPx;
    const worldX1 = (block.x + block.w - sheetW / 2) * metresPerPx;
    const worldZFar = -(sheetH - block.y) * metresPerPx;
    const worldZNear = -(sheetH - (block.y + block.h)) * metresPerPx;

    /* The card, exactly. */
    const x0 = worldX0;
    const x1 = worldX1;
    const z0 = worldZFar;
    const z1 = worldZNear;
    if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return null;

    const w = x1 - x0;
    const d = z1 - z0;
    const H = BUILDING_HEIGHT_M;

    const color = new THREE.Color(block.fill ?? '#161a26');
    const mat = new THREE.MeshLambertMaterial({
      color,
      /*
       * A little of its own colour as emissive. At night under one moon, the
       * sides facing away from it would otherwise be flat black against a
       * near-black sky — a building you only find by walking into it.
       */
      emissive: color.clone().multiplyScalar(block.fill ? 0.1 : 0.35),
      clippingPlanes: groundClip,
    });
    disposables.push(mat);

    const group = new THREE.Group();
    group.position.set(x0 + w / 2, -H, z0 + d / 2);

    const body = new THREE.Mesh(box, mat);
    body.scale.set(w, H, d);
    group.add(body);

    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.scale.set(w, H, d);
    group.add(lines);

    /*
     * Signage on both long faces. The front (+z) is what the player sees walking
     * up the row from the Contact end; the back is what they see looking back
     * from the monument. A building signed on one side only is anonymous from
     * half the city.
     */
    const sign = makeSign(block);
    if (sign) {
      disposables.push(sign.texture, sign.material, sign.geometry);
      const signW = Math.min(w * 0.82, 44);
      const signH = signW / sign.aspect;
      for (const side of [1, -1]) {
        const plane = new THREE.Mesh(sign.geometry, sign.material);
        plane.scale.set(signW, signH, 1);
        plane.position.set(0, H * 0.55, side * (d / 2 + 0.03));
        if (side < 0) plane.rotation.y = Math.PI;
        group.add(plane);
      }
    }

    /*
     * Visible from the start, parked fully underground and therefore fully
     * clipped. Hidden objects are skipped by `renderer.compile`, and a building
     * whose shaders first compile on the frame it starts to rise is a hitch in
     * the middle of the one beat that has to feel heavy and smooth.
     */
    root.add(group);
    return { group, x0, x1, z0, z1, risen: 0, riseStart: 0 };
  }

  function makeSign(block: BlueprintBlock) {
    const cw = 1024;
    const ch = 256;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const onAccent = Boolean(block.fill);
    /* Fit the name to the width rather than truncating it — a sign cut off mid-word reads as a bug. */
    let size = 118;
    ctx.font = `400 ${size}px ${block.fontFamily}`;
    while (ctx.measureText(block.name).width > cw * 0.94 && size > 40) {
      size -= 4;
      ctx.font = `400 ${size}px ${block.fontFamily}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = onAccent ? '#ffffff' : '#eef1fb';
    ctx.fillText(block.name, cw / 2, ch * 0.58);

    ctx.font = `400 40px ${block.fontFamily}`;
    ctx.fillStyle = onAccent ? 'rgba(255,255,255,0.72)' : 'rgba(200,208,230,0.6)';
    ctx.fillText(block.caption, cw / 2, ch * 0.86);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      clippingPlanes: groundClip,
      /* Pushed toward the camera so it never z-fights the face it is mounted on. */
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    return { texture, material, geometry: new THREE.PlaneGeometry(1, 1), aspect: cw / ch };
  }

  /* ── Dust ── */

  const dustCount = buildings.length * DUST_PER_BUILDING;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 4);
  /* Per particle: start x, z, outward vx, vz, up speed. Fixed at build, replayed each rise. */
  const dustSeed = new Float32Array(dustCount * 5);
  {
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    buildings.forEach((b, bi) => {
      for (let i = 0; i < DUST_PER_BUILDING; i++) {
        const k = (bi * DUST_PER_BUILDING + i) * 5;
        /* Along the perimeter, weighted to the long faces where the break is widest. */
        const onLong = rand() < 0.8;
        let x: number;
        let z: number;
        let nx: number;
        let nz: number;
        if (onLong) {
          x = b.x0 + rand() * (b.x1 - b.x0);
          const front = rand() < 0.5;
          z = front ? b.z1 : b.z0;
          nx = (rand() - 0.5) * 0.4;
          nz = front ? 1 : -1;
        } else {
          z = b.z0 + rand() * (b.z1 - b.z0);
          const right = rand() < 0.5;
          x = right ? b.x1 : b.x0;
          nx = right ? 1 : -1;
          nz = (rand() - 0.5) * 0.4;
        }
        const speed = 2 + rand() * 4;
        dustSeed[k] = x;
        dustSeed[k + 1] = z;
        dustSeed[k + 2] = nx * speed;
        dustSeed[k + 3] = nz * speed;
        dustSeed[k + 4] = 1.5 + rand() * 3.5;
        const c = 0.55 + rand() * 0.2;
        dustCol[(bi * DUST_PER_BUILDING + i) * 4] = c;
        dustCol[(bi * DUST_PER_BUILDING + i) * 4 + 1] = c * 0.97;
        dustCol[(bi * DUST_PER_BUILDING + i) * 4 + 2] = c * 0.92;
      }
    });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  /* Four components: three's cue to compile the points shader with per-particle alpha. */
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 4));
  const dustTex = softDot();
  const dustMat = new THREE.PointsMaterial({
    size: 2.4,
    map: dustTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.visible = false;
  root.add(dust);
  disposables.push(dustGeo, dustMat, dustTex);

  /* ── Animation ── */

  let anim: Anim | null = null;

  function update(now: number) {
    if (!anim) return;
    const a = anim;
    let done = true;

    buildings.forEach((b, i) => {
      if (a.kind === 'rise') {
        if (a.reduced) {
          b.risen = 1;
        } else {
          const t = clamp01((now - a.start - i * RISE_STAGGER_MS) / RISE_MS);
          /*
           * Fast out of the ground, grinding to a stop — ease-out cubic. Linear
           * reads as an elevator. An overshoot reads as a toy: something this
           * heavy does not bounce.
           */
          b.risen = 1 - Math.pow(1 - t, 3);
          if (t < 1) done = false;
        }
      } else {
        const t = clamp01((now - a.start) / SINK_MS);
        b.risen = a.from[i] * (1 - t * t);
        if (t < 1) done = false;
      }
      b.group.position.y = -BUILDING_HEIGHT_M * (1 - b.risen);
    });

    /* Dust only on the way up. The way out is a quick retreat, not an event. */
    if (a.kind === 'rise' && !a.reduced) {
      dust.visible = true;
      buildings.forEach((_, bi) => {
        const age = (now - a.start - bi * RISE_STAGGER_MS) / 1000;
        for (let i = 0; i < DUST_PER_BUILDING; i++) {
          const p = bi * DUST_PER_BUILDING + i;
          const k = p * 5;
          const life = 2.6;
          const u = age / life;
          const visible = u > 0 && u < 1;
          /* Outward drift that slows as it spreads, and a lift that tapers off. */
          const spread = visible ? (1 - Math.exp(-age * 1.4)) / 1.4 : 0;
          dustPos[p * 3] = dustSeed[k] + dustSeed[k + 2] * spread;
          dustPos[p * 3 + 1] = visible ? dustSeed[k + 4] * spread * 0.7 : -10;
          dustPos[p * 3 + 2] = dustSeed[k + 1] + dustSeed[k + 3] * spread;
          dustCol[p * 4 + 3] = visible ? Math.sin(u * Math.PI) * 0.5 : 0;
        }
      });
      (dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (dustGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      if (done) {
        const lastAge = (now - a.start - (buildings.length - 1) * RISE_STAGGER_MS) / 1000;
        if (lastAge < 2.6) done = false;
      }
    } else {
      dust.visible = false;
    }

    if (done) {
      dust.visible = false;
      anim = null;
      a.resolve();
    }
  }

  function start(kind: Anim['kind'], reduced: boolean): Promise<void> {
    anim?.resolve();
    return new Promise((resolve) => {
      anim = { kind, start: performance.now(), from: buildings.map((b) => b.risen), resolve, reduced };
      if (buildings.length === 0) {
        anim = null;
        resolve();
      }
    });
  }

  return {
    rise: (reduced) => start('rise', reduced),
    sink: () => start('sink', false),

    setVisible(visible) {
      root.visible = visible;
    },

    solidAt(x, y, z) {
      if (y < 0) return false;
      /* The cell's centre, because the footprints are no longer on the grid — see the note at the top. */
      const cx = x + 0.5;
      const cz = z + 0.5;
      for (const b of buildings) {
        if (cx < b.x0 || cx >= b.x1 || cz < b.z0 || cz >= b.z1) continue;
        /*
         * Collision grows WITH the building, from the same `risen` value as the
         * mesh. A collision box at full height under a building still rising
         * would be an invisible wall above it — the exact class of bug the
         * handover warns about for the shrink effect, arriving early.
         */
        if (y < Math.floor(BUILDING_HEIGHT_M * b.risen)) return true;
      }
      return false;
    },

    update,

    dispose() {
      anim?.resolve();
      anim = null;
      parent.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A soft round point, so the dust is puffs rather than squares. */
function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}