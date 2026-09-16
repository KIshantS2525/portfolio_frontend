// src/components/game/decor.ts
import * as THREE from 'three';

/**
 * Interior furniture and decoration.
 *
 * Everything here is the same trick the rest of the game's props use — free
 * meshes rather than voxel blocks, because a canopy bed or a bookshelf made
 * of full cubes is a box with a colour, not furniture. Canvas-painted
 * textures (books, rugs, framed art) are all generated procedurally at
 * runtime, the same way the block atlas and the project signs are — no
 * image assets, and nothing lifted from Minecraft's own art.
 *
 * The brief was "warm, lived-in forest cabin, not a perfectly empty room" —
 * so every function here exists to give a wall or a corner a reason to be
 * looked at: the bed is the bedroom's focal point, the fireplace is the
 * great room's, the bookshelf and barrels read as someone's belongings
 * rather than showroom furniture.
 */

const DARK_WOOD = 0x3f2a18;
const MID_WOOD = 0x6b4a30;
const LIGHT_WOOD = 0x9a6b35;

/**
 * A door, permanently hinged open against the inside of the door frame —
 * this engine has no state machine for "closed unless a player or mob is
 * nearby" the way blocks do, and a door that could swing shut on the player
 * (or that a zombie could open) would undo the invisible mob-barrier this
 * doorway already relies on. Propped open against the wall is a real
 * design a lot of actual cabins use, not a cop-out: it reads as "there is a
 * door here" without contradicting how the doorway actually works.
 *
 * Painted a deliberately different tone from the walls (a muted red-brown,
 * not the same dark plank brown everything else in the frame is built
 * from) — the first version used the same dark wood tone as the wall it
 * was mounted against, which is almost certainly why it read as "not
 * there": a dark object flush against a dark wall of a very similar colour
 * is easy to miss entirely even when it's rendering exactly where it
 * should be.
 */
export function buildDoor(x: number, y: number, z: number, facing = 0): THREE.Group {
  const g = new THREE.Group(); // origin is the hinge, at floor height
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a4a35 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x3a2418 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.55, 0.07), wood);
  panel.geometry.translate(0.46, 1.32, 0);
  g.add(panel);
  // Two raised panel rectangles, the same framed-door look as the reference
  // doors — just boxes, but it's what turns a plain slab into "a door".
  for (const py of [0.75, 1.9]) {
    const stripFront = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.85, 0.015), trim);
    stripFront.geometry.translate(0.46, py, 0.045);
    const stripBack = stripFront.clone();
    stripBack.geometry = stripFront.geometry.clone();
    stripBack.geometry.translate(0, 0, -0.09);
    g.add(stripFront, stripBack);
  }
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), iron);
  handle.position.set(0.86, 1.15, 0.06);
  g.add(handle);
  const hinge0 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.09), iron);
  hinge0.position.set(0.02, 0.5, 0);
  const hinge1 = hinge0.clone();
  hinge1.position.y = 2.1;
  g.add(hinge0, hinge1);

  g.position.set(x, y, z);
  g.rotation.y = facing;
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/**
 * A four-poster canopy bed — replaces the old two-cube-and-a-headboard bed.
 * Same calling convention as before: (x, y, z) is the floor anchor, and the
 * headboard sits toward -Z (so it reads correctly against the north wall of
 * the bed nook without needing a facing param).
 */
export function buildCanopyBed(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: DARK_WOOD });
  const frame = new THREE.MeshLambertMaterial({ color: MID_WOOD });
  const cloth = new THREE.MeshLambertMaterial({ color: 0xb2352f });
  const pillowMat = new THREE.MeshLambertMaterial({ color: 0xece5d6 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 2.1), frame);
  base.position.y = 0.24;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.26, 1.95), cloth);
  mattress.position.y = 0.45;
  const pillowL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.5), pillowMat);
  pillowL.position.set(-0.25, 0.65, -0.68);
  const pillowR = pillowL.clone();
  pillowR.position.x = 0.25;
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.14), dark);
  headboard.position.set(0, 0.72, -1.03);
  g.add(base, mattress, pillowL, pillowR, headboard);

  // Four posts and a flat canopy top — no cloth drape (that needs a soft,
  // non-cube shape this engine doesn't have), but the frame alone reads as
  // a canopy bed rather than a mattress on a plinth.
  const postH = 1.85;
  for (const [px, pz] of [[-0.6, -0.98], [0.6, -0.98], [-0.6, 0.98], [0.6, 0.98]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, postH, 0.13), dark);
    post.position.set(px, postH / 2, pz);
    g.add(post);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 2.2), dark);
  canopy.position.set(0, postH + 0.045, 0);
  g.add(canopy);

  for (const [lx, lz] of [[-0.55, -0.95], [0.55, -0.95], [-0.55, 0.95], [0.55, 0.95]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), frame);
    leg.position.set(lx, 0.08, lz);
    g.add(leg);
  }

  g.position.set(x, y, z);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/**
 * A plain single bed — no canopy, no posts — sized for a village cottage
 * rather than the player's own great room. Same calling convention as
 * `buildCanopyBed` (x, y, z is the floor anchor, headboard toward -Z).
 *
 * This is the piece that was actually missing from every cottage: the
 * house's bed has always been paired with `buildCanopyBed` for the visible
 * mesh, but cottages only ever placed the underlying BEDRED/BEDWHITE voxel
 * cells — and those are deliberately invisible in the world mesh (see
 * `MESH_INVISIBLE` in world.ts, added so the *player's* fancy bed mesh
 * wasn't fighting with a pair of solid-coloured cubes underneath it). With
 * no mesh standing in for them, a cottage's bed cells being invisible meant
 * there was, visibly, no bed there at all.
 */
export function buildSimpleBed(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: MID_WOOD });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x8a3a35 });
  const pillowMat = new THREE.MeshLambertMaterial({ color: 0xe4ddcc });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 1.9), frame);
  base.position.y = 0.24;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.75), cloth);
  mattress.position.y = 0.42;
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.14, 0.42), pillowMat);
  pillow.position.set(0, 0.6, -0.62);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.1), frame);
  headboard.position.set(0, 0.62, -0.93);
  g.add(base, mattress, pillow, headboard);

  for (const [lx, lz] of [[-0.42, -0.82], [0.42, -0.82], [-0.42, 0.82], [0.42, 0.82]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), frame);
    leg.position.set(lx, 0.1, lz);
    g.add(leg);
  }

  g.position.set(x, y, z);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
function paintBooks(rows: number, cols: number): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a2717';
  ctx.fillRect(0, 0, W, H);
  const palette = ['#7a2c2c', '#2c5a4a', '#2c3f6b', '#8a6a2c', '#5a2c6b', '#3a5a2c', '#6b3a2c'];
  const rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = 4;
    const y = r * rowH + 4;
    const h = rowH - 8;
    while (x < W - 6) {
      const w = 6 + Math.floor(Math.random() * 10);
      if (x + w > W - 4) break;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, y, 1, h); // spine shadow line
      x += w + 2;
    }
  }
  void cols;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A bookshelf: a wooden case with painted "books" filling most of the front
 * face. `facing` rotates it the same way the gallery plaques do (0 faces
 * +Z; rotate to point the front into whatever room it's against a wall in).
 */
export function buildBookshelf(x: number, y: number, z: number, facing = 0): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: MID_WOOD });
  const caseBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.36), wood);
  caseBox.position.y = 0.85;
  g.add(caseBox);

  const booksTex = paintBooks(3, 1);
  const booksMat = new THREE.MeshBasicMaterial({ map: booksTex });
  for (let shelf = 0; shelf < 3; shelf++) {
    const books = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.46), booksMat);
    books.position.set(0, 0.36 + shelf * 0.52, 0.185);
    g.add(books);
  }
  // Shelf ledges, so the case doesn't read as a single hollow slab.
  for (let shelf = 0; shelf <= 3; shelf++) {
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.34), wood);
    ledge.position.set(0, 0.08 + shelf * 0.52, 0);
    g.add(ledge);
  }

  g.position.set(x, y, z);
  g.rotation.y = facing;
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** A flat woven rug: a solid field, a border, and a simple diamond chain — no photo texture, just shapes. */
function paintRug(base: string, accent: string): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, S - 28, S - 28);
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, S - 60, S - 60);
  // A chain of diamonds down the centre — the one recognisably "woven" motif.
  ctx.fillStyle = accent;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const cy = 40 + (i + 0.5) * ((S - 80) / n);
    ctx.save();
    ctx.translate(S / 2, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-12, -12, 24, 24);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A rug lying flat on the floor. `y` should be the floor height (it sits a hair above it to avoid z-fighting). */
export function buildRug(
  x: number, y: number, z: number, w: number, d: number, facing = 0,
  base = '#5b6b73', accent = '#dfe4e6',
): THREE.Mesh {
  const tex = paintRug(base, accent);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = facing;
  rug.position.set(x, y + 0.02, z);
  rug.receiveShadow = true;
  return rug;
}

/**
 * A hanging lantern: a short ceiling chain, a wood-and-glass cage, and a
 * warm glowing core. Purely decorative — the actual light comes from the
 * shared torch pool (see world.ts, which registers this fixture's position
 * as a torch spot), so the flicker and the day/night fade are free and
 * consistent with every other light source in the world.
 */
export function buildHangingLantern(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: DARK_WOOD });
  const glass = new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.9 });
  const chainMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });

  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), chainMat);
  chain.position.y = -0.175;
  g.add(chain);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.24), wood);
  cap.position.y = -0.38;
  const base = cap.clone();
  base.position.y = -0.66;
  g.add(cap, base);
  for (const [px, pz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), wood);
    post.position.set(px, -0.52, pz);
    g.add(post);
  }
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), glass);
  core.position.y = -0.52;
  g.add(core);

  g.position.set(x, y, z);
  g.traverse((o) => { o.castShadow = false; }); // small, high, and lit from within — shadows here just cost frame time
  return g;
}

/** A small painted "landscape" — original, procedural, and different every call via `seed`. */
function paintArt(seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 192;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const hue = (seed * 47) % 360;
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
  sky.addColorStop(0, `hsl(${hue}, 45%, 78%)`);
  sky.addColorStop(1, `hsl(${(hue + 20) % 360}, 55%, 88%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.65);
  ctx.fillStyle = `hsl(${(hue + 90) % 360}, 35%, 32%)`;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  // A simple triangular tree/mountain silhouette, position varied by seed.
  ctx.fillStyle = `hsl(${(hue + 90) % 360}, 30%, 20%)`;
  const bx = (seed * 71) % W;
  ctx.beginPath();
  ctx.moveTo(bx, H * 0.62);
  ctx.lineTo(bx - 45, H * 0.95);
  ctx.lineTo(bx + 45, H * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `hsl(${(hue + 40) % 360}, 70%, 70%)`;
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.22, 16, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A small framed painting, mounted flush on a wall exactly like a gallery plaque. */
export function buildFramedArt(x: number, y: number, z: number, facing = 0, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: DARK_WOOD });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.05), frameMat);
  g.add(frame);
  const canvasMat = new THREE.MeshBasicMaterial({ map: paintArt(seed) });
  const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.44), canvasMat);
  canvasMesh.position.z = 0.03;
  g.add(canvasMesh);
  g.position.set(x, y, z);
  g.rotation.y = facing;
  return g;
}

/** A terracotta pot with a leafy clump — the same LEAVES green as the block palette, for a plant that belongs here. */
export function buildPottedPlant(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.22, 6),
    new THREE.MeshLambertMaterial({ color: 0xb2612f }),
  );
  pot.position.y = 0.11;
  g.add(pot);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d2e });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), leafMat);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.07, 0.35, Math.sin(a) * 0.07);
    leaf.rotation.z = Math.cos(a) * 0.3;
    leaf.rotation.x = Math.sin(a) * 0.3;
    g.add(leaf);
  }
  g.position.set(x, y, z);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** A wooden storage barrel — the "someone lives here" clutter piece. */
export function buildBarrel(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: LIGHT_WOOD });
  const band = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 10), wood);
  body.position.y = 0.31;
  g.add(body);
  for (const by of [0.08, 0.31, 0.54]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.05, 10), band);
    hoop.position.y = by;
    g.add(hoop);
  }
  g.position.set(x, y, z);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/**
 * A stone fireplace, mounted flush on an interior wall — the great room's
 * hearth and its natural focal point (spec-brief: "every room should have a
 * clear purpose and a focal point"). The firebox glow is a static emissive
 * plane rather than an animated flame mesh (that's what the torches already
 * do, and duplicating their per-frame flicker logic for one fixture wasn't
 * worth the coupling) — but the actual *light* comes from the shared torch
 * pool the same way every other fixture's does, so it still flickers and
 * fades correctly with the day/night cycle.
 */
export function buildFireplace(x: number, y: number, z: number, facing = 0): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0x8a8d92 });
  const darkStone = new THREE.MeshLambertMaterial({ color: 0x5a5d61 });
  const mantle = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.9, 0.55), stone);
  mantle.position.y = 0.95;
  g.add(mantle);
  // Firebox recess — a darker inset box, not an actual hole (this engine's
  // meshes don't do boolean cuts), sitting proud of the stone face.
  const firebox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.1), darkStone);
  firebox.position.set(0, 0.5, 0.28);
  g.add(firebox);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  );
  glow.position.set(0, 0.46, 0.34);
  g.add(glow);
  // A mantle shelf lip, and a short chimney stack rising toward the roof.
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.65), darkStone);
  shelf.position.y = 1.55;
  g.add(shelf);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.45), stone);
  chimney.position.set(0, 2.5, 0.05);
  g.add(chimney);

  g.position.set(x, y, z);
  g.rotation.y = facing;
  g.traverse((o) => { o.castShadow = true; });
  return g;
}