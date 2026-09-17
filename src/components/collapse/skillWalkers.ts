// src/components/collapse/skillWalkers.ts
import * as THREE from 'three';

/**
 * One walker per skill, marching the Stack section with a placard.
 *
 * ── Drawn, not modelled ──
 *
 * The reference is the crowd from *We Become What We Behold*, and that game is
 * 2D: flat white figures, heavy dark outlines, dot eyes, stick limbs. Two
 * attempts at building that out of boxes and then out of spheres produced,
 * accurately, box zombies and then marshmallow people — because the style is a
 * drawing, and a drawing is not a low-poly model of itself.
 *
 * So each walker is a billboard showing a frame of a hand-drawn character, and
 * the frames are drawn here with canvas paths: outlined circle for the head,
 * two dots and a smile, a rounded body, and arms and legs redrawn per frame.
 * Eight frames make a walk cycle. It is the same amount of code as a rig, it
 * looks like the reference because it IS the reference's technique, and the
 * feet move because the drawing moves.
 *
 * ── Why the feet were not moving before ──
 *
 * They were, by a few degrees of rotation on a thin dark capsule seen from
 * thirty metres at night: technically animated, visually a statue. A frame
 * animation cannot fail that way — the legs are in a different place in every
 * frame, at full contrast, whatever the distance.
 *
 * ── No interaction, no collision ──
 *
 * You walk straight through them. In a world with no combat and no dialogue, a
 * body that blocks you is only ever something to bump into.
 *
 * ── Two instanced quads for the whole crowd ──
 *
 * One for the people, one for the signs, each with a per-instance UV window
 * patched into the material: the people's picks this frame's pose out of the
 * character atlas, the signs' picks this walker's skill out of the name atlas.
 * Sixty-six marchers, animated, in two draw calls.
 */

/** How tall a walker stands, metres. */
const WALKER_H = 1.75;

/** Frames in the walk cycle. */
const FRAMES = 8;

/** Character atlas cell, px. */
const FRAME_W = 220;
const FRAME_H = 340;

/** Name-board atlas cell, px. */
const CELL_W = 512;
const CELL_H = 160;

const WALK_SPEED = 1.15;
/** Metres per full stride cycle. Sets how fast the frames advance. */
const STRIDE_M = 1.6;

const INK = '#141827';
const PAPER = '#f7f8ff';

export type SkillWalkers = {
  setVisible: (visible: boolean) => void;
  update: (dt: number, cameraPosition: THREE.Vector3) => void;
  dispose: () => void;
};

type Walker = {
  /** Distance travelled along the lane, metres. Wraps. */
  t: number;
  lane: number;
  dir: 1 | -1;
  speed: number;
  /** Offset across the lane, so a row is a crowd rather than a queue. */
  offset: number;
  phase: number;
  size: number;
};

export function createSkillWalkers(
  parent: THREE.Object3D,
  skills: string[],
  /** The Stack section's footprint on the sheet, world metres. */
  footprint: { x0: number; x1: number; z0: number; z1: number },
  fontFamily: string,
): SkillWalkers | null {
  if (skills.length === 0) return null;

  const width = footprint.x1 - footprint.x0;
  const depth = footprint.z1 - footprint.z0;
  if (width < 4 || depth < 3) return null;

  const laneCount = 3;
  const n = skills.length;

  const root = new THREE.Group();
  root.name = 'collapse-skills';
  root.visible = false;
  parent.add(root);

  const people = buildCharacterAtlas();
  const boards = buildNameAtlas(skills, fontFamily);

  /* ── Two quads, two atlases ── */

  const bodyGeo = new THREE.PlaneGeometry(1, 1);
  const bodyUv = new Float32Array(n * 4);
  bodyGeo.setAttribute('aUvWindow', new THREE.InstancedBufferAttribute(bodyUv, 4));
  const bodyUvAttr = bodyGeo.getAttribute('aUvWindow') as THREE.InstancedBufferAttribute;

  const signGeo = new THREE.PlaneGeometry(1, 1);
  const signUv = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    signUv[i * 4] = (i % boards.cols) / boards.cols;
    signUv[i * 4 + 1] = 1 - (Math.floor(i / boards.cols) + 1) / boards.rows;
    signUv[i * 4 + 2] = 1 / boards.cols;
    signUv[i * 4 + 3] = 1 / boards.rows;
  }
  signGeo.setAttribute('aUvWindow', new THREE.InstancedBufferAttribute(signUv, 4));

  const bodyMat = new THREE.MeshBasicMaterial({
    map: people.texture,
    transparent: true,
    /* Cut out rather than blended: a half-transparent cartoon edge reads as a smudge at distance. */
    alphaTest: 0.35,
    fog: true,
  });
  const signMat = new THREE.MeshBasicMaterial({ map: boards.texture, transparent: true, alphaTest: 0.35, fog: true });
  for (const mat of [bodyMat, signMat]) patchUvWindow(mat);

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
  const signs = new THREE.InstancedMesh(signGeo, signMat, n);
  for (const mesh of [bodies, signs]) {
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  /* ── The crowd ── */

  let seed = 0x9e37;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const laneDepth = depth / laneCount;
  const walkers: Walker[] = [];
  for (let i = 0; i < n; i++) {
    const lane = i % laneCount;
    walkers.push({
      t: (i / n) * (width + 8) * laneCount + rand() * 4,
      lane,
      dir: lane % 2 === 0 ? 1 : -1,
      speed: WALK_SPEED * (0.85 + rand() * 0.35),
      offset: (rand() - 0.5) * laneDepth * 0.6,
      phase: rand() * FRAMES,
      size: 0.9 + rand() * 0.24,
    });
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const face = new THREE.Quaternion();

  function update(dt: number, cameraPosition: THREE.Vector3) {
    if (!root.visible) return;
    const span = width + 10;
    const bodyW = (WALKER_H * FRAME_W) / FRAME_H;

    walkers.forEach((w, i) => {
      w.t += w.speed * dt;
      const along = ((w.t % span) + span) % span;
      const x = w.dir > 0 ? footprint.x0 - 5 + along : footprint.x1 + 5 - along;
      const z = footprint.z0 + laneDepth * (w.lane + 0.5) + w.offset;
      const h = WALKER_H * w.size;

      /* The frame: distance walked, not time, so the legs match the speed of the body. */
      const frame = Math.floor((w.t / STRIDE_M) * FRAMES + w.phase) % FRAMES;
      bodyUv[i * 4] = (frame % people.cols) / people.cols;
      bodyUv[i * 4 + 1] = 1 - (Math.floor(frame / people.cols) + 1) / people.rows;
      bodyUv[i * 4 + 2] = 1 / people.cols;
      bodyUv[i * 4 + 3] = 1 / people.rows;

      /*
       * Billboarded about y, so a flat drawing keeps its face to whoever is
       * looking. Mirrored when the lane runs the other way — which is the
       * cheapest possible way to make half a crowd walk left: negative width.
       */
      const yaw = Math.atan2(cameraPosition.x - x, cameraPosition.z - z);
      face.setFromAxisAngle(UP, yaw);

      pos.set(x, h / 2, z);
      const flip = w.dir > 0 ? 1 : -1;
      bodies.setMatrixAt(i, m.compose(pos, face, scl.set((bodyW * w.size) * flip, h, 1)));

      /*
       * The board sits at the top of the pole the drawing is holding — the same
       * fraction of the figure's height in every frame, so it never drifts off
       * the hands.
       */
      pos.set(x, h * 1.04, z);
      signs.setMatrixAt(i, m.compose(pos, face, scl.set(1.05 * w.size, 0.33 * w.size, 1)));
    });

    bodies.instanceMatrix.needsUpdate = true;
    signs.instanceMatrix.needsUpdate = true;
    bodyUvAttr.needsUpdate = true;
  }

  return {
    setVisible(visible) {
      root.visible = visible;
    },
    update,
    dispose() {
      parent.remove(root);
      bodies.dispose();
      signs.dispose();
      bodyGeo.dispose();
      signGeo.dispose();
      bodyMat.dispose();
      signMat.dispose();
      people.texture.dispose();
      boards.texture.dispose();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** Per-instance UV window: which cell of the atlas this instance shows. */
function patchUvWindow(mat: THREE.MeshBasicMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aUvWindow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * aUvWindow.zw + aUvWindow.xy;');
  };
}

/**
 * The walk cycle, drawn.
 *
 * Eight frames across one atlas. Each is the same character — outlined head,
 * dot eyes, smile, rounded body, both arms up holding a pole — with the legs
 * and the arm angle redrawn per frame from one phase value. Heavy dark strokes
 * on white, which is the reference's whole look and, usefully, the only thing
 * that stays legible as a 40px silhouette at the far end of a dark street.
 */
function buildCharacterAtlas() {
  const cols = 4;
  const rows = Math.ceil(FRAMES / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * FRAME_W;
  canvas.height = rows * FRAME_H;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let f = 0; f < FRAMES; f++) {
      const ox = (f % cols) * FRAME_W;
      const oy = Math.floor(f / cols) * FRAME_H;
      drawWalker(ctx, ox, oy, (f / FRAMES) * Math.PI * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cols, rows };
}

/** One frame. `phase` runs 0..2π across the cycle and drives every moving part. */
function drawWalker(ctx: CanvasRenderingContext2D, ox: number, oy: number, phase: number) {
  const cx = ox + FRAME_W / 2;
  /* Layout of the figure inside its cell, top-down. */
  const headR = 44;
  const headY = oy + 92;
  const bodyTop = headY + headR + 6;
  const bodyBot = oy + 232;
  const footY = oy + FRAME_H - 16;

  /* The whole figure lifts a little at each stride's peak. */
  const bob = Math.abs(Math.sin(phase)) * 6;
  const swing = Math.sin(phase);

  ctx.save();
  ctx.translate(0, -bob);
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;

  /* Legs: one forward, one back, knees implied by a single bend in the stroke. */
  ctx.lineWidth = 13;
  for (const side of [1, -1]) {
    const kick = swing * side;
    const hipX = cx + side * 9;
    const kneeX = hipX + kick * 20;
    const kneeY = (bodyBot + footY) / 2;
    const footX = hipX + kick * 38;
    ctx.beginPath();
    ctx.moveTo(hipX, bodyBot - 6);
    ctx.quadraticCurveTo(kneeX, kneeY, footX, footY - Math.max(0, kick) * 10);
    ctx.stroke();
    /* A blunt foot, so the leg ends in something rather than tapering into the ground. */
    ctx.beginPath();
    ctx.lineWidth = 13;
    ctx.moveTo(footX, footY - Math.max(0, kick) * 10);
    ctx.lineTo(footX + (kick > 0 ? 14 : -10), footY - Math.max(0, kick) * 10);
    ctx.stroke();
  }

  /* Body: a rounded slab, filled white and outlined, so legs and arms read as behind it. */
  ctx.lineWidth = 12;
  ctx.beginPath();
  roundRect(ctx, cx - 30, bodyTop, 60, bodyBot - bodyTop, 26);
  ctx.fill();
  ctx.stroke();

  /* Arms: both raised to the pole, with a small alternating lift so the sign bobs. */
  ctx.lineWidth = 12;
  for (const side of [1, -1]) {
    const shoulderX = cx + side * 26;
    const shoulderY = bodyTop + 18;
    const handX = cx + side * 15;
    const handY = oy + 58 + swing * side * 6;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.quadraticCurveTo(shoulderX + side * 16, (shoulderY + handY) / 2, handX, handY);
    ctx.stroke();
  }

  /* The pole, running up out of frame to where the board is drawn in 3D. */
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx, oy + 78);
  ctx.lineTo(cx, oy);
  ctx.stroke();

  /* Head last, on top of everything. */
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx - 15, headY - 4, 6.5, 0, Math.PI * 2);
  ctx.arc(cx + 15, headY - 4, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, headY + 8, 15, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

/** Every skill name on one texture, a board each. */
function buildNameAtlas(skills: string[], fontFamily: string) {
  const cols = Math.ceil(Math.sqrt(skills.length));
  const rows = Math.ceil(skills.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    skills.forEach((skill, i) => {
      const x = (i % cols) * CELL_W;
      const y = Math.floor(i / cols) * CELL_H;

      /* Same ink and paper as the marchers, so the board belongs to the hands holding it. */
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      roundRect(ctx, x + 12, y + 12, CELL_W - 24, CELL_H - 24, 16);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 9;
      ctx.stroke();

      let size = 74;
      ctx.font = `600 ${size}px ${fontFamily}`;
      while (ctx.measureText(skill).width > CELL_W - 70 && size > 20) {
        size -= 3;
        ctx.font = `600 ${size}px ${fontFamily}`;
      }
      ctx.fillStyle = INK;
      ctx.fillText(skill, x + CELL_W / 2, y + CELL_H / 2 + 2);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cols, rows };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}