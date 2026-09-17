// src/components/collapse/contactBuildings.ts
import * as THREE from 'three';
import type { BlueprintContact } from '@/components/collapse/blueprint';

/**
 * The contact section, as four buildings at the end of the city.
 *
 * Same rule as everything else: each one stands on the rect its link occupies on
 * the page. GitHub and LinkedIn get a recessed black gate — visual only, never
 * entered — and open in a new tab. Email and phone have no entrance at all and
 * copy their value instead.
 *
 * ── Why a key press and not a trigger ──
 *
 * The plan says "approach → open in new tab". Built literally, walking past a
 * building would throw the visitor out of the world into a new tab they did not
 * ask for, and there is no way back to where they were standing. So approaching
 * puts a prompt on screen and the action is a keystroke: the approach is still
 * what finds the thing, but leaving is a decision. The tab is new either way, so
 * the world survives it.
 *
 * ── They rise like everything else ──
 *
 * They used to simply appear with the city, which read as four boxes that had
 * always been there while the rest of the page stood up around them. They are
 * part of the page, so they come out of the ground on the same beat, last —
 * page order again, and Contact is the bottom of the page.
 *
 * ── Footprints and collision ──
 *
 * The footprint is the link's own rect, like every other building here. They
 * are solid; collision rounds to the metre cells whose centres fall inside,
 * because the controller has no finer grid to offer.
 */

/** Height of a contact building, metres. Lower than the project blocks: this is the end of the street, not more of it. */
const HEIGHT_M = 10;

/** How close you have to be for the prompt, metres. */
const PROMPT_RANGE_M = 9;

/**
 * Smallest footprint, metres.
 *
 * The only place here that overrides the page's own dimensions, because a
 * contact link is a line of text: at page scale its rect is a couple of metres
 * by half a metre, which extruded is a post rather than a building with a gate
 * on it. Wide enough to carry a sign and be walked up to, and no wider.
 */
const MIN_W = 5;
const MIN_D = 3;

const RISE_MS = 1500;
const SINK_MS = 650;

export type ContactPrompt = { label: string; action: string } | null;

export type ContactBuildings = {
  setVisible: (visible: boolean) => void;
  /** Out of the ground, all four together. Resolves when they land. */
  rise: (reducedMotion: boolean) => Promise<void>;
  /** Back under. */
  sink: () => Promise<void>;
  /** Drives the rise, and with it how solid they currently are. */
  tick: (now: number) => void;
  /** The prompt for whatever the player is standing near, or null. */
  update: (cameraPosition: THREE.Vector3) => ContactPrompt;
  /** Runs the nearest target's action. Returns what happened, for the toast. */
  activate: () => string | null;
  solidAt: (x: number, y: number, z: number) => boolean;
  dispose: () => void;
};

type Target = {
  contact: BlueprintContact;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
};

export function createContactBuildings(
  parent: THREE.Object3D,
  contacts: BlueprintContact[],
  metresPerPx: number,
  sheetW: number,
  sheetH: number,
): ContactBuildings | null {
  if (contacts.length === 0) return null;

  const root = new THREE.Group();
  root.name = 'collapse-contacts';
  root.visible = false;
  root.position.y = -HEIGHT_M;
  parent.add(root);

  /* Clipped at the ground so they emerge rather than slide up through it — as in buildings.ts. */
  const groundClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const wall = new THREE.MeshLambertMaterial({ color: 0x20263a, emissive: 0x0b0e18, clippingPlanes: groundClip });
  /* The gate: a recessed black face. Not a door — there is nothing behind it, by the rules. */
  const gate = new THREE.MeshBasicMaterial({ color: 0x05060a, clippingPlanes: groundClip });
  const disposables: { dispose: () => void }[] = [box, wall, gate];

  const targets: Target[] = [];

  for (const contact of contacts) {
    const cx = (contact.x + contact.w / 2 - sheetW / 2) * metresPerPx;
    const cz = -(sheetH - (contact.y + contact.h / 2)) * metresPerPx;
    const w = Math.max(MIN_W, contact.w * metresPerPx);
    const d = Math.max(MIN_D, contact.h * metresPerPx);
    const x0 = cx - w / 2;
    const z0 = cz - d / 2;
    const t: Target = { contact, x0, x1: x0 + w, z0, z1: z0 + d };
    targets.push(t);

    const mesh = new THREE.Mesh(box, wall);
    mesh.scale.set(w, HEIGHT_M, d);
    mesh.position.set(x0 + w / 2, 0, z0 + d / 2);
    root.add(mesh);

    /* Signage and, for the link targets, the gate — both on the face you arrive at. */
    const sign = makeSign(contact);
    if (sign) {
      disposables.push(sign.material, sign.material.map as THREE.Texture, sign.geometry);
      sign.material.clippingPlanes = groundClip;
      const plane = new THREE.Mesh(sign.geometry, sign.material);
      const signW = Math.min(w * 0.8, 9);
      plane.scale.set(signW, signW / 4, 1);
      plane.position.set(x0 + w / 2, HEIGHT_M * 0.62, z0 + d + 0.04);
      root.add(plane);
    }

    if (contact.kind === 'link') {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gate);
      disposables.push(g.geometry);
      g.scale.set(Math.min(3, w * 0.4), 4.2, 1);
      g.position.set(x0 + w / 2, 2.1, z0 + d + 0.03);
      root.add(g);
    }
  }

  let nearest: Target | null = null;
  let risen = 0;
  let anim: { kind: 'rise' | 'sink'; start: number; from: number; resolve: () => void; reduced: boolean } | null =
    null;

  function startAnim(kind: 'rise' | 'sink', reduced: boolean): Promise<void> {
    anim?.resolve();
    return new Promise((resolve) => {
      anim = { kind, start: performance.now(), from: risen, resolve, reduced };
    });
  }

  return {
    setVisible(visible) {
      root.visible = visible;
      if (!visible) nearest = null;
    },

    rise: (reduced) => startAnim('rise', reduced),
    sink: () => startAnim('sink', false),

    tick(now) {
      if (!anim) return;
      const a = anim;
      let done = true;
      if (a.kind === 'rise') {
        if (a.reduced) {
          risen = 1;
        } else {
          const t = clamp01((now - a.start) / RISE_MS);
          risen = a.from + (1 - a.from) * (1 - Math.pow(1 - t, 3));
          if (t < 1) done = false;
        }
      } else {
        const t = clamp01((now - a.start) / SINK_MS);
        risen = a.from * (1 - t * t);
        if (t < 1) done = false;
      }
      root.position.y = -HEIGHT_M * (1 - risen);
      if (done) {
        anim = null;
        a.resolve();
      }
    },

    update(cameraPosition) {
      /* No prompts from a building that is still coming out of the ground. */
      if (!root.visible || risen < 0.95) return null;
      let best: Target | null = null;
      let bestD = PROMPT_RANGE_M;
      for (const t of targets) {
        /* Distance to the footprint, not its centre: a wide building is near along all of its face. */
        const dx = Math.max(t.x0 - cameraPosition.x, 0, cameraPosition.x - t.x1);
        const dz = Math.max(t.z0 - cameraPosition.z, 0, cameraPosition.z - t.z1);
        const d = Math.hypot(dx, dz);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      nearest = best;
      if (!best) return null;
      return {
        label: best.contact.label,
        action: best.contact.kind === 'link' ? 'open' : 'copy',
      };
    },

    activate() {
      if (!nearest) return null;
      const { kind, value, label } = nearest.contact;
      if (kind === 'link') {
        /*
         * A new tab, never this one. Navigating away would tear down the
         * renderer, the city and the visitor's place in it — and the back button
         * would return them to a page that has to build the whole thing again.
         */
        window.open(value, '_blank', 'noopener');
        return `Opening ${label}`;
      }
      void navigator.clipboard?.writeText(value).catch(() => {});
      return `Copied ${value}`;
    },

    solidAt(x, y, z) {
      /* Only as solid as it is tall right now, so nothing blocks the player before it exists. */
      if (y < 0 || y >= HEIGHT_M * risen) return false;
      const cx = x + 0.5;
      const cz = z + 0.5;
      for (const t of targets) {
        if (cx >= t.x0 && cx < t.x1 && cz >= t.z0 && cz < t.z1) return true;
      }
      return false;
    },

    dispose() {
      anim?.resolve();
      anim = null;
      parent.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
}

function makeSign(contact: BlueprintContact) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e7ebfa';
  let size = 120;
  ctx.font = `600 ${size}px sans-serif`;
  while (ctx.measureText(contact.label).width > 960 && size > 30) {
    size -= 6;
    ctx.font = `600 ${size}px sans-serif`;
  }
  ctx.fillText(contact.label.toUpperCase(), 512, 128);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return {
    geometry: new THREE.PlaneGeometry(1, 1),
    material: new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}