// src/components/archive/lockerScene.ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CHART_H, CHART_W, hitChart, paintChart,
  type Chart, type ChartNode,
} from '@/components/archive/wallchart';

/**
 * The locker room.
 *
 * ── Why this one is lit, when nothing else on the site is ──
 *
 * The main journey — the dust, the Chladni cage, the knight — is drawn in
 * unlit points and thin marks on paper, and everything about that is on
 * purpose. The first pass at this room followed the same rule: flat fills, ink
 * edges, no lights, no normals, so it would belong to the same site.
 *
 * It belonged to the same site and it was the wrong room. A locker room is not
 * a drawing of a place, it is a place, and the entire feeling of one comes
 * from a strip light above the doors falling down a wall of dark metal. You
 * cannot draw that with edges. Fall-off IS the subject.
 *
 * So this room breaks the house style deliberately and completely: real
 * materials, real lights, its own palette, its own dark. It is a different
 * space you walk into, not another view of the same one — which is also why
 * it ignores the site's light/dark theme entirely and has its own switch, on
 * the wall, where a light switch goes.
 *
 * ── The light rig follows you ──
 *
 * A forty-metre room lit by static lamps needs a lamp every few metres and
 * pays for all of them on every fragment, most of them lighting corridor
 * nobody is looking at. Instead there are three point lights that ride along
 * with the camera. The strips overhead are emissive geometry — they are what
 * you *see* — and the rig is what actually does the lighting, always where the
 * viewer is. The room can be any length for the price of three lights.
 *
 * ── Doors are the exception to the merge ──
 *
 * Everything static is merged by material into a handful of draws. Doors are
 * not: each is its own pivot group, because a hinge is a rotation about an
 * edge and there is no way to express that in a shared vertex buffer without
 * re-transforming the slice by hand every frame. Twenty-odd extra draws for
 * doors that genuinely swing is a trade worth making.
 */

/* ── the room's own palette. Nothing here comes from the site theme. ────── */
export const ROOM = {
  metal: '#43474e', //      locker bodies
  metalDark: '#33363c', //  doors, a shade deeper so they read as separate
  recess: '#15161a', //     the inside of an open locker
  ceiling: '#0e0f12',
  bench: '#2a2d33',
  trim: '#5a6068',
  lamp: '#ffd9a0', //       the strip itself, and the light it casts
  cold: '#5d6b86', //       what is left when the lights are off
  fogOn: '#191b1f',
  fogOff: '#07080a',
} as const;
const FLOOR = '#c8b394'; // pale board, the one warm surface when lit

/* ── dimensions, in metres ──────────────────────────────────────────────── */
const W = 0.44; //        one locker across
const GAP = 0.02;
const PITCH = W + GAP;
const H = 1.86; //        door height
const D = 0.5; //         locker depth
const PLINTH = 0.11;
const TOP = PLINTH + H; //  1.97 — the fascia starts here
const AISLE_HALF = 1.28; //  from centreline to door face
const EYE = 1.5;
const CEIL = 2.86;
/** How far a door swings, in radians. Just past square, so you see inside. */
const SWING = 1.85;
/**
 * One ceiling fixture every four bays.
 *
 * This is a rhythm decision, not a lighting one — the travelling rig does the
 * actual work. Closer together and the pools of light merge into an even wash
 * and the room stops having a length; further apart and you walk through dark
 * gaps that read as the renderer failing rather than as an unlit stretch.
 * Four bays is roughly 1.8m, which is about where a real corridor puts them.
 */
const LAMP_PITCH = PITCH * 4;
/** Where the doorway header sits. The camera starts outside it and walks in. */
const ENTRY_Z = 0.75;
/** The serving hatch at the far end: counter height, opening size. */
const HATCH_SILL = 0.96;
const HATCH_W = 1.72;
const HATCH_H = 1.02;
/** The paper chit in the door's card holder. */
const CARD_W = 0.3;
const CARD_H = 0.072;
/** Chest height — where a locker's name card actually goes. */
const CARD_Y = PLINTH + H * 0.56;
/** Past this many metres a chit is unreadable, so it is not drawn at all. */
const LABEL_REACH = 9;
/** Floorboard width, and the shadow gap between boards. */
const PLANK_W = 0.185;
const PLANK_GAP = 0.008;

export type Locker = {
  id: number;
  slug: string;
  label: string;
  /** Stencilled unit number, e.g. "07". */
  number: string;
};

/**
 * Where a chit's text should be drawn this frame, and how.
 *
 * Computed in here rather than in the component, because every term in it
 * needs the camera: the screen position, the distance the type has to shrink
 * by, and the angle the door is turned away at. The component used to project
 * a static world anchor itself and draw every label at a flat 11px, which is
 * how eight project names ended up stacked on top of each other at the
 * vanishing point — the far end of a forty-metre corridor was shouting at the
 * same size as the locker you were standing next to.
 */
export type LabelMark = {
  id: number;
  /** Normalised device coords, -1..1. */
  ndcX: number;
  ndcY: number;
  /**
   * Pixels per metre at this chit's distance, for a viewport one unit tall —
   * multiply by the canvas height to size the type so it sits on the card.
   */
  perMetre: number;
  /** 0 when the chit is too far, too oblique or behind you. */
  alpha: number;
  /** Distance, so nearer chits paint over farther ones. */
  depth: number;
};

export type LockerRoomOptions = {
  entries: { slug: string; label: string }[];
  /** The name on the sign over the door. */
  title: string;
  /** The knowledge graph, laid out flat for the panel on the lobby wall. */
  chart: Chart;
  /** Contact rows for the notice board at the far end. */
  board: { label: string; value: string; href: string }[];
  /**
   * The renderer's max anisotropy. Chits are read almost edge-on for most of
   * the walk, which is precisely the case bilinear filtering handles worst —
   * without this the names smear into grey the moment you are past them.
   */
  anisotropy?: number;
};

export type LockerRoom = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lockers: Locker[];
  /** Refreshed every tick. Read it after tick(), draw the text at these spots. */
  labels: LabelMark[];
  /** World position of the notice board, for anchoring its DOM panel. */
  boardAnchor: THREE.Vector3;
  /** World position of the sign over the entrance, for anchoring the title. */
  titleAnchor: THREE.Vector3;
  /** The serving hatch at the far end — gate 2 hangs the terminal on this. */
  hatchAnchor: THREE.Vector3;
  setProgress: (t: number) => void;
  setLook: (x: number, y: number) => void;
  setOpen: (id: number | null) => void;
  setHover: (id: number | null) => void;
  /** Lights on or off. The pull cord drives this. */
  setLit: (on: boolean) => void;
  pick: (ndcX: number, ndcY: number) => number | null;
  /** Same ray, against the notice board. Returns the note's href. */
  pickNote: (ndcX: number, ndcY: number) => string | null;
  progressFor: (id: number) => number;
  /** 0..1 — how close the viewer is to the notice board. */
  boardProximity: () => number;
  /** 1 at the threshold, falling to 0 once the viewer is properly inside. */
  titleProximity: () => number;
  /** 0 walking, 1 turned to face the notice board at the end. */
  facingBoard: () => number;
  /** Is the pointer over the terminal on the counter? */
  pickTerminal: (ndcX: number, ndcY: number) => boolean;
  /** Which node on the wall chart is under the pointer. */
  pickChart: (ndcX: number, ndcY: number) => ChartNode | null;
  /** Highlight a node and its neighbours; null clears. */
  setChartHover: (id: string | null) => void;
  /** Ring the nodes an answer cited, and open the lockers among them. */
  setCited: (ids: Set<string>) => void;
  /** Push the camera in to the terminal, or let it back out. */
  setTerminal: (on: boolean) => void;
  /** 0 away, 1 fully seated at the counter. */
  terminalBlend: () => number;
  resize: (w: number, h: number) => void;
  tick: (dt: number) => void;
  dispose: () => void;
};

/**
 * The label, painted onto the card itself.
 *
 * This started as HTML positioned over each door by projecting a world anchor,
 * on the reasoning that DOM type inherits the site's fonts, stays crisp at any
 * pixel ratio and can be read aloud. All true, and all beside the point, which
 * is that **a screen-parallel element cannot sit on a surface that is not.**
 *
 * You walk down a corridor looking at cards mounted on walls either side of
 * you, so every one of them is steeply foreshortened — a card thirty degrees
 * off is a thin parallelogram, and the flat horizontal words laid over it
 * float in front of the door rather than adhering to it. No amount of scaling
 * or fading fixes that, because the fault is the plane, not the size. The
 * previous version's own screenshot showed names sliding off their cards and
 * landing on their neighbours'.
 *
 * A texture is on the card because it *is* the card. It foreshortens with the
 * surface, it is lit by the same light, it goes dim when the room goes dark,
 * and it swings when the door swings — none of which needed a line of code.
 * The DOM copy of every name still exists, in the screen-reader list on the
 * route, which is where it was always doing the accessibility work anyway.
 *
 * Handwriting, because a locker label is written by hand. It is set in whatever
 * of the stack the device actually has; self-host Caveat as a woff2 next to
 * Inter and Fraunces and every card in the room picks it up on the next redraw
 * (see `refreshChits`).
 */
const HAND = "'Caveat', 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive";

function paintChit(
  canvas: HTMLCanvasElement,
  number: string,
  label: string,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Paper. Two washes rather than one flat fill, so the card has a little
  // life in it under a raking light instead of reading as a printed swatch.
  ctx.fillStyle = '#ece5d4';
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, 'rgba(255,255,255,0.5)');
  wash.addColorStop(0.55, 'rgba(228,218,198,0.25)');
  wash.addColorStop(1, 'rgba(198,186,163,0.4)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // The unit number, stamped small in the corner the way a real one is.
  ctx.fillStyle = 'rgba(90,80,62,0.55)';
  ctx.font = `600 ${Math.round(h * 0.19)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(number, w * 0.045, h * 0.11);

  /*
   * The name, shrunk to fit rather than truncated.
   *
   * Card width is fixed and project names are not, so something has to give.
   * An ellipsis is the wrong thing to give: "ASC-CADENCE …" tells a reader
   * there is a locker and refuses to tell them whose, which is the one job
   * the card has. Stepping the size down until it fits keeps every name whole,
   * and the variation in size between cards reads as handwriting rather than
   * as a bug — because that is exactly what happens when a person writes a
   * long word on a small label.
   */
  const text = label.toUpperCase();
  let size = Math.round(h * 0.52);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = w * 0.88;
  for (; size > 8; size -= 1) {
    ctx.font = `600 ${size}px ${HAND}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  // A hair of ink bleed under the stroke, so it looks absorbed into the paper
  // rather than laid on top of it.
  ctx.fillStyle = 'rgba(40,32,20,0.16)';
  ctx.fillText(text, w / 2 + 1.5, h * 0.58 + 1.5);
  ctx.fillStyle = '#2b2418';
  ctx.fillText(text, w / 2, h * 0.58);
}

/**
 * A pinned note on the corkboard.
 *
 * Wider than a locker chit and set differently: the heading stays in the
 * typed face because EMAIL and GITHUB are labels rather than words anyone
 * wrote, and the value goes in handwriting because a phone number on a
 * noticeboard always is. The value also has to survive being long — an
 * eighty-character LinkedIn URL on a 68cm slip — so it wraps to two lines and
 * then shrinks, in that order, which is what a person does with a pen.
 */
function paintNote(canvas: HTMLCanvasElement, label: string, value: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#f0ead9';
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(255,255,255,0.55)');
  wash.addColorStop(1, 'rgba(206,194,170,0.4)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(96,84,62,0.72)';
  ctx.font = `600 ${Math.round(h * 0.11)}px ui-monospace, monospace`;
  ctx.fillText(label.toUpperCase(), w * 0.07, h * 0.14);

  // Wrap first, shrink second.
  const maxW = w * 0.86;
  let size = Math.round(h * 0.28);
  let lines: string[] = [value];
  for (; size > 10; size -= 1) {
    ctx.font = `600 ${size}px ${HAND}`;
    if (ctx.measureText(value).width <= maxW) { lines = [value]; break; }
    const cut = Math.ceil(value.length * (maxW / ctx.measureText(value).width));
    const a = value.slice(0, cut);
    const b = value.slice(cut);
    if (
      ctx.measureText(a).width <= maxW &&
      ctx.measureText(b).width <= maxW &&
      size <= h * 0.2
    ) { lines = [a, b]; break; }
  }
  ctx.fillStyle = '#2b2418';
  ctx.textBaseline = 'middle';
  const top = h * 0.62 - ((lines.length - 1) * size * 0.6) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, w * 0.07, top + i * size * 1.15));
}

/**
 * The name, printed on the sign over the doorway.
 *
 * It was HTML anchored to the plate, which was the last survivor of an
 * approach this file has now abandoned twice — once for the locker chits and
 * once for the pinned notes. It half worked here because you approach the
 * doorway square on, so the plane very nearly matches the screen. Very nearly
 * is the problem: the word ARCHIVE underneath was clipping through the header
 * beam, because an HTML element has no depth and cannot be occluded by
 * geometry in front of it. It floated, and the one thing a sign must do is be
 * *on* something.
 *
 * Painted into the plate, it is lit by the room, occluded by the beam, and
 * dims when the lights go out — none of which needed a line of code.
 *
 * The face is the site's display serif, so the room is introduced in the same
 * voice as the homepage even though nothing else about it matches.
 */
const SIGN_FACE = "'Fraunces Variable', 'Iowan Old Style', Georgia, serif";

function paintSign(canvas: HTMLCanvasElement, name: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Brushed dark plate, lighter along the bottom where the strip under it
  // throws light back up.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#15171b');
  g.addColorStop(0.72, '#1d2026');
  g.addColorStop(1, '#2c3038');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Shrink to fit, same reasoning as the chits: a long name is a long name,
  // and a plate that truncates it is worse than a plate with smaller type.
  const maxW = w * 0.86;
  let size = Math.round(h * 0.45);
  for (; size > 12; size -= 1) {
    ctx.font = `500 ${size}px ${SIGN_FACE}`;
    if (ctx.measureText(name).width <= maxW) break;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f6ecdb';
  ctx.fillText(name, w / 2, h * 0.55);

  ctx.font = `600 ${Math.round(h * 0.13)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(217,160,74,0.9)';
  const sub = 'A R C H I V E';
  ctx.fillText(sub, w / 2, h * 0.82);

  // A hairline along the bottom edge, catching the strip below.
  ctx.fillStyle = 'rgba(255,217,160,0.35)';
  ctx.fillRect(0, h - 3, w, 3);
}

/**
 * What is on the monitor before anyone touches it.
 *
 * The DOM terminal takes over the whole viewport once you click, so this is
 * only ever seen from across the lobby — which is exactly why it matters. A
 * dark rectangle on a desk is furniture; a rectangle with a prompt glowing on
 * it is a machine that is already running and waiting for you, and that is
 * the difference between walking past the counter and walking up to it.
 *
 * Deliberately illegible at its actual size: a few dim rows of plausible
 * output and one bright prompt line. Trying to put real text here would be
 * unreadable at two metres and wrong the moment the content changed.
 */
function paintScreen(canvas: HTMLCanvasElement, subject: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#06130b';
  ctx.fillRect(0, 0, w, h);
  // Phosphor pools toward the middle of a tube.
  const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.72);
  g.addColorStop(0, 'rgba(60,140,95,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.font = '600 21px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  const rows = [
    'ARCHIVE KIT ROOM — TERMINAL 2.6',
    'MEMORY ............ 640K OK',
    'LINK /api/chat .... ESTABLISHED',
    '',
    `READY. ASK ABOUT ${subject.toUpperCase()}.`,
  ];
  rows.forEach((line, i) => {
    ctx.fillStyle = i === rows.length - 1 ? '#9dffbe' : 'rgba(95,224,141,0.5)';
    ctx.fillText(line, 26, 28 + i * 30);
  });
  ctx.fillStyle = '#c9ffd9';
  ctx.fillRect(26, 28 + rows.length * 30 + 4, 13, 22);

  // Scanlines, over everything.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

/** A box, positioned. Merged later, so this is only ever a builder. */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function buildRoom({
  entries,
  board,
  title,
  chart,
  anisotropy = 4,
}: LockerRoomOptions): LockerRoom {
  /*
   * One locker per project, both banks, and a few spare at the end so the
   * room never terminates the instant the projects run out — a locker room
   * with exactly as many lockers as you have projects looks like a set.
   */
  const perSide = Math.max(7, Math.ceil(entries.length / 2) + 3);
  /*
   * The banks stop, and then there is somewhere.
   *
   * This used to be -1.9: just enough clearance to hang a notice board on the
   * end wall and no more, so the corridor simply terminated. A corridor that
   * terminates has no destination in it — you get to the end and the reward
   * is that there is no more corridor. Pushing the wall back by another metre
   * leaves a small lobby past the last locker, which is what turns the walk
   * into an arrival: the room opens out, and there is a counter in it.
   */
  const roomEnd = -(perSide * PITCH) - 3.1;
  /** Where the lockers actually stop, and the lobby begins. */
  const lobbyZ0 = -(perSide - 1) * PITCH - 0.5 - PITCH / 2;
  const lobbyMid = (lobbyZ0 + roomEnd) / 2;
  const startZ = 3.5; // outside the doorway, so entering is a moment
  const walkEnd = roomEnd + 1.6; // into the lobby, a step short of the counter

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(ROOM.fogOn, 4, 17);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 70);
  camera.position.set(0, EYE, startZ);

  /* ── static geometry, merged by material ──────────────────────────────── */
  const metal: THREE.BufferGeometry[] = [];
  const recess: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];

  const lockers: Locker[] = [];
  const labels: LabelMark[] = [];
  const noteCanvases: {
    canvas: HTMLCanvasElement; tex: THREE.Texture; label: string; value: string;
  }[] = [];
  /*
   * Chits can no longer share a material, because each one carries a different
   * name and the name is now in the texture. One canvas, one texture and one
   * material per filed locker — about eighteen of each, which is nothing, and
   * they are only made for lockers that actually hold something.
   *
   * Blank lockers get the shared `blankChit` instead: same paper, no writing.
   * A room where only the used lockers have cards in the holders looks broken;
   * a room where the spare ones have empty cards looks like a room.
   */
  const chitCanvases: { canvas: HTMLCanvasElement; tex: THREE.Texture; number: string; label: string }[] = [];
  const blankChit = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ded6c3'),
    roughness: 0.9,
  });
  const makeChit = (number: string, label: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    paintChit(canvas, number, label);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    chitCanvases.push({ canvas, tex, number, label });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88 });
  };
  type Pivot = {
    group: THREE.Group;
    dir: number;
    open: number;
    target: number;
    hot: number;
    z: number;
    box: THREE.Box3;
    mat: THREE.MeshStandardMaterial;
    /** The chit's position in the door's own frame, so it swings with it. */
    cardLocal: THREE.Vector3;
  };
  const pivots: Pivot[] = [];
  let filed = 0;

  for (let i = 0; i < perSide; i++) {
    const z = -i * PITCH - 0.5;
    for (const side of [0, 1]) {
      const dir = side === 0 ? -1 : 1; // -1 = left bank
      const faceX = dir * AISLE_HALF; // the plane the doors sit in
      const backX = dir * (AISLE_HALF + D);

      // Carcass: an open-fronted box. Five slabs, not a solid — the inside
      // has to be a real cavity or an open door reveals nothing.
      const t = 0.02;
      recess.push(box(D, H, W, dir * (AISLE_HALF + D / 2), PLINTH + H / 2, z)); // cavity fill
      metal.push(box(t, H, W, backX, PLINTH + H / 2, z)); //                      back
      metal.push(box(D, t, W, dir * (AISLE_HALF + D / 2), PLINTH + H, z)); //     top
      metal.push(box(D, t, W, dir * (AISLE_HALF + D / 2), PLINTH, z)); //         bottom
      metal.push(box(D, H, GAP, dir * (AISLE_HALF + D / 2), PLINTH + H / 2, z + W / 2 + GAP / 2));
      // A shelf, because every locker has one and it is visible the moment a
      // door opens.
      metal.push(box(D * 0.92, 0.014, W - 0.03, dir * (AISLE_HALF + D / 2), PLINTH + H * 0.72, z));

      /* ── the door ──────────────────────────────────────────────────────
       * Built around its hinge rather than its centre: the group sits on the
       * hinge edge and the geometry is offset half a width into the aisle, so
       * rotating the group about Y is exactly a door swinging.
       */
      const hingeZ = z - W / 2;
      const g = new THREE.Group();
      g.position.set(faceX, 0, hingeZ);

      const parts: THREE.BufferGeometry[] = [];
      const cx = W / 2; // local +z is along the door leaf
      parts.push(box(0.026, H, W - 0.006, 0, PLINTH + H / 2, cx));
      // Louvres: the detail that makes a metal box read as a locker. Six
      // slots, upper third, cut as recessed dark bars.
      for (let v = 0; v < 6; v++) {
        parts.push(
          box(0.03, 0.012, W * 0.62, dir * 0.004, PLINTH + H * 0.80 + v * 0.035, cx),
        );
      }
      // Latch: a vertical bar on the free edge.
      parts.push(box(0.022, 0.26, 0.026, dir * -0.022, PLINTH + H * 0.47, cx + W * 0.36));

      /*
       * The card holder: a shallow chrome frame screwed to the door, with a
       * paper chit slipped into it.
       *
       * Floating type in mid-air has nothing to belong to, so it reads as an
       * overlay on a game rather than as something in the room, and — worse —
       * it has no reason to obey perspective, which is exactly how the far
       * end of the corridor ended up illegible. A physical card fixes both at
       * once: it is a real object at a real distance, so the text on it can
       * be sized off its projected width and simply *is* correct at every
       * range, and it gives the name a lit surface to sit on so it reads
       * against dark metal.
       */
      parts.push(box(0.03, CARD_H + 0.018, CARD_W + 0.018, dir * -0.004, CARD_Y, cx));

      const doorGeo = mergeGeometries(parts, false)!;
      const doorMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ROOM.metalDark),
        roughness: 0.72,
        metalness: 0.22,
      });
      g.add(new THREE.Mesh(doorGeo, doorMat));
      /*
       * The chit itself. A thin slab rather than a plane, because it sits in a
       * holder and you see its edge from an angle — a zero-thickness quad
       * vanishes exactly when the door is most foreshortened, which is most of
       * the walk.
       *
       * BoxGeometry's default UVs put the full texture on every face, so the
       * name appears correctly on the outward face and is hidden on the other
       * five by the holder around it. That is the whole reason a box works
       * here without any UV surgery.
       */
      const chitFace = filed < entries.length
        ? makeChit(String(filed + 1).padStart(2, '0'), entries[filed].label)
        : blankChit;
      g.add(new THREE.Mesh(box(0.012, CARD_H, CARD_W, dir * -0.021, CARD_Y, cx), chitFace));
      scene.add(g);

      const cardLocal = new THREE.Vector3(dir * -0.03, CARD_Y, cx);
      const hit = new THREE.Box3(
        new THREE.Vector3(
          Math.min(faceX, faceX - dir * 0.14),
          PLINTH,
          z - W / 2,
        ),
        new THREE.Vector3(
          Math.max(faceX, faceX - dir * 0.14),
          PLINTH + H,
          z + W / 2,
        ),
      );

      const id = pivots.length;
      pivots.push({
        group: g, dir, open: 0, target: 0, hot: 0, z, box: hit, mat: doorMat, cardLocal,
      });
      if (filed < entries.length) {
        lockers.push({
          id,
          slug: entries[filed].slug,
          label: entries[filed].label,
          number: String(filed + 1).padStart(2, '0'),
        });
        labels.push({ id, ndcX: 0, ndcY: 0, perMetre: 0, alpha: 0, depth: 0 });
        filed++;
      }
    }

    // Plinth and fascia run continuously, so they are built per bay and
    // merged into one strip rather than existing as separate objects.
    for (const dir of [-1, 1]) {
      trim.push(box(D + 0.02, PLINTH, PITCH, dir * (AISLE_HALF + D / 2), PLINTH / 2, z));
      trim.push(box(D + 0.02, 0.14, PITCH, dir * (AISLE_HALF + D / 2), TOP + 0.07, z));
    }
  }

  /* ── room shell ─────────────────────────────────────────────────────── */
  const len = -roomEnd + 3;
  const midZ = (startZ + roomEnd) / 2;

  /*
   * The floor, as actual boards.
   *
   * It was one flat slab in a single colour, and a flat slab is the fastest
   * way to make a 3D room look like a 3D room and nothing else — there is no
   * scale in it, so the corridor could be two metres long or forty and the
   * eye cannot tell. Boards fix that for free: a run of parallel seams
   * converging toward the vanishing point is the strongest depth cue in the
   * whole scene, stronger than the fog and stronger than the lockers, because
   * the viewer already knows how wide a floorboard is.
   *
   * Three things make it read as a floor rather than as stripes. The boards
   * are laid in staggered lengths with butt joints, so the cross-seams never
   * line up into a grid. Each board carries its own tone in a vertex colour —
   * a few percent either side of the base — because real timber is never one
   * colour and a uniform floor looks printed. And the material is far
   * glossier than anything else in here, so the strip lights streak down it.
   * That sheen is most of the reason the room feels like a place with a
   * ceiling: you see the lights twice, once overhead and once underfoot.
   */
  const base = new THREE.Color(FLOOR);
  const plankGeos: THREE.BufferGeometry[] = [];
  const HALF_W = 2.6;
  const cols = Math.ceil((HALF_W * 2) / (PLANK_W + PLANK_GAP));
  let seed = 1337;
  const rnd = () => {
    // Small deterministic PRNG. The floor must be identical between renders,
    // or a re-mount reshuffles every board and the room flickers.
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let c = 0; c < cols; c++) {
    const x = -HALF_W + c * (PLANK_W + PLANK_GAP) + PLANK_W / 2;
    // Stagger: each run starts at a different offset so joints never align.
    let z = startZ + 1 - rnd() * 1.6;
    while (z > roomEnd - 1) {
      const boardLen = 0.9 + rnd() * 1.5;
      const zc = z - boardLen / 2;
      const g = box(PLANK_W, 0.04, boardLen - 0.006, x, -0.02, zc);
      const tone = 0.88 + rnd() * 0.24;
      const col = base.clone().multiplyScalar(tone);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      plankGeos.push(g);
      z -= boardLen;
    }
  }
  const floorMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.34, //  glossy enough to catch the strips
    metalness: 0.06,
  });
  scene.add(new THREE.Mesh(mergeGeometries(plankGeos, false)!, floorMat));
  // A dark sub-floor under the boards, so the gaps between them read as
  // shadow rather than as holes onto the fog.
  scene.add(
    new THREE.Mesh(
      box(9, 0.04, len, 0, -0.055, midZ),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#0a0b0d'), roughness: 1 }),
    ),
  );

  const shellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ROOM.ceiling),
    roughness: 0.95,
  });
  scene.add(
    new THREE.Mesh(
      mergeGeometries(
        [
          box(9, 0.05, len, 0, CEIL, midZ), //                     ceiling
          box(0.06, CEIL, len, -(AISLE_HALF + D + 0.03), CEIL / 2, midZ),
          box(0.06, CEIL, len, AISLE_HALF + D + 0.03, CEIL / 2, midZ),
          /*
           * The end wall, in four pieces around a serving hatch.
           *
           * A hole in a wall cannot be subtracted from a box without CSG, and
           * CSG for one rectangular opening is a library and a build step to
           * avoid drawing four slabs. So: four slabs. Sill below, header
           * above, and a return either side.
           */
          box(4.2, HATCH_SILL, 0.08, 0, HATCH_SILL / 2, roomEnd),
          box(
            4.2, CEIL - (HATCH_SILL + HATCH_H), 0.08,
            0, (HATCH_SILL + HATCH_H + CEIL) / 2, roomEnd,
          ),
          box(
            (4.2 - HATCH_W) / 2, HATCH_H, 0.08,
            -(HATCH_W + (4.2 - HATCH_W) / 2) / 2, HATCH_SILL + HATCH_H / 2, roomEnd,
          ),
          box(
            (4.2 - HATCH_W) / 2, HATCH_H, 0.08,
            (HATCH_W + (4.2 - HATCH_W) / 2) / 2, HATCH_SILL + HATCH_H / 2, roomEnd,
          ),
        ],
        false,
      )!,
      shellMat,
    ),
  );

  /*
   * There is no bench any more, and it is worth saying why rather than just
   * deleting it.
   *
   * A 42cm seat, 5cm thick, in the same dark grey as the lockers, with a pair
   * of thin legs every other bay, does not read as a bench from standing eye
   * height at the mouth of a corridor. It reads as a dark stripe painted down
   * the middle of the floor — you are looking along its length, so its whole
   * silhouette is a line, and the legs are too sparse and too thin to say
   * "this is furniture at knee height". It was also the one thing interrupting
   * the floorboards, which are doing the heavy lifting on depth.
   *
   * It could come back as an actual bench: thicker seat, pale timber to match
   * the floor rather than the lockers, and a leg frame every bay so the eye
   * gets the horizontal rhythm that says seat. That is a different object,
   * not a tweak to this one, so it is out until it is worth building properly.
   */

  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ROOM.metal),
    roughness: 0.78,
    metalness: 0.18,
  });
  const recessMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ROOM.recess),
    roughness: 1,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ROOM.bench),
    roughness: 0.7,
    metalness: 0.25,
  });
  scene.add(new THREE.Mesh(mergeGeometries(metal, false)!, metalMat));
  scene.add(new THREE.Mesh(mergeGeometries(recess, false)!, recessMat));
  scene.add(new THREE.Mesh(mergeGeometries(trim, false)!, trimMat));

  /* ── the strips ──────────────────────────────────────────────────────
   * Emissive geometry, not lights. These are what the eye reads as the
   * source — a warm line above each bank, tucked under the fascia so you see
   * the glow and its spill, never the bulb.
   */
  /*
   * The strips.
   *
   * A flat emissive bar is not what a light looks like. What sells a real
   * luminaire in a dark corridor is not the tube — it is the *spill*: the
   * gradient bleeding onto the metal above and below it, brightest at the
   * fitting and gone within a hand's width. Without it you get a painted
   * stripe on the ceiling line, which is exactly what the first pass drew.
   *
   * There is no bloom pass here and there should not be — a postprocessing
   * chain would cost more than this whole room does. So the spill is
   * geometry: a wider panel either side of the strip carrying a vertical
   * alpha gradient, blended additively so it adds light to whatever is behind
   * it rather than painting over it. Two extra quads per bank, no shaders, and
   * it is the difference between a lit corridor and a diagram of one.
   */
  const stripMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(ROOM.lamp),
    /*
     * Fogged, which it was not.
     *
     * `fog: false` seemed reasonable — a light is a light, why would distance
     * dim it — and it is the reason the strips looked like they were floating
     * in front of the room rather than fixed to it. Everything else in the
     * corridor fades with depth; a fitting thirty metres away rendering at
     * exactly the brightness of the one over your head has no place in that
     * space, so the eye puts it at zero distance and it reads as a bar laid
     * over the picture. Real luminaires do dim down a corridor, because the
     * air between you and them is not empty.
     */
    fog: true,
    transparent: true,
    opacity: 1,
  });

  /** A vertical gradient, opaque at the middle and gone at both edges. */
  const spillTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,217,160,0)');
    grad.addColorStop(0.5, 'rgba(255,217,160,0.85)');
    grad.addColorStop(1, 'rgba(255,217,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const spillMat = new THREE.MeshBasicMaterial({
    map: spillTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    opacity: 0.5,
  });
  /*
   * Sunk under the fascia and proud of it, not flush with it.
   *
   * The first version put a 2cm-tall strip at exactly the height the fascia
   * starts, which buried it inside that geometry — the room was being lit by
   * a source nobody could see, so the strip light read as a general grey
   * wash and the whole reason for the room went missing. It now hangs a few
   * centimetres below the fascia and pokes into the aisle, so from standing
   * height you catch its underside and its front edge: a hot line running the
   * length of each bank, which is exactly the thing the reference photograph
   * is actually of.
   */
  /*
   * Sized to the banks, not to the room.
   *
   * These ran `len * 0.94` centred on `midZ` — the whole room including the
   * approach outside the doorway — so each strip carried on straight through
   * the portal and hung in the air over the entrance, lighting nothing and
   * attached to nothing. A strip light is mounted on top of a run of lockers,
   * so it is exactly as long as that run and stops where it stops.
   */
  const bankLen = perSide * PITCH;
  const bankMid = -((perSide - 1) * PITCH) / 2 - 0.5;
  const strips = new THREE.Mesh(
    mergeGeometries(
      [
        box(0.16, 0.05, bankLen, -(AISLE_HALF - 0.05), TOP - 0.05, bankMid),
        box(0.16, 0.05, bankLen, AISLE_HALF - 0.05, TOP - 0.05, bankMid),
      ],
      false,
    )!,
    stripMat,
  );
  scene.add(strips);

  // The spill: a tall thin panel over each strip, facing the aisle.
  const spill = new THREE.Mesh(
    mergeGeometries(
      [
        (() => {
          const g = new THREE.PlaneGeometry(bankLen, 0.44);
          g.rotateY(Math.PI / 2);
          g.translate(-(AISLE_HALF - 0.005), TOP - 0.1, bankMid);
          return g;
        })(),
        (() => {
          const g = new THREE.PlaneGeometry(bankLen, 0.44);
          g.rotateY(-Math.PI / 2);
          g.translate(AISLE_HALF - 0.005, TOP - 0.1, bankMid);
          return g;
        })(),
      ],
      false,
    )!,
    spillMat,
  );
  scene.add(spill);

  /* ── the notice board ────────────────────────────────────────────────── */
  /* ── ceiling fixtures ─────────────────────────────────────────────────
   * Housings in the shell material, diffusers in the lamp material. These are
   * the lamps you *see*; the rig below is what actually lights, and it snaps
   * to these positions so the two never disagree about where the light is
   * coming from. A visible fixture with no light under it, or a pool of light
   * with no fixture over it, is the single most common tell that a 3D room
   * was lit by someone dragging lamps around rather than wiring them.
   */
  const lampCount = Math.ceil((startZ - roomEnd) / LAMP_PITCH);
  const lampZ0 = ENTRY_Z - 0.9;
  const housings: THREE.BufferGeometry[] = [];
  const diffusers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lampCount; i++) {
    const z = lampZ0 - i * LAMP_PITCH;
    if (z < roomEnd + 0.4) break;
    housings.push(box(1.5, 0.09, 0.17, 0, CEIL - 0.06, z));
    housings.push(box(0.05, 0.14, 0.05, -0.6, CEIL - 0.14, z));
    housings.push(box(0.05, 0.14, 0.05, 0.6, CEIL - 0.14, z));
    diffusers.push(box(1.42, 0.03, 0.12, 0, CEIL - 0.11, z));
  }
  scene.add(new THREE.Mesh(mergeGeometries(housings, false)!, trimMat));
  const diffuserMesh = new THREE.Mesh(mergeGeometries(diffusers, false)!, stripMat);
  scene.add(diffuserMesh);

  /* ── the doorway ──────────────────────────────────────────────────────
   * A header beam on two pillars, with a sign panel on it. The camera starts
   * outside and walks under it, which is worth the six boxes it costs: a room
   * you enter reads completely differently from a room you are simply already
   * in, and the threshold is where the title belongs.
   */
  const portal: THREE.BufferGeometry[] = [];
  portal.push(box(0.26, CEIL, 0.3, -(AISLE_HALF + 0.14), CEIL / 2, ENTRY_Z));
  portal.push(box(0.26, CEIL, 0.3, AISLE_HALF + 0.14, CEIL / 2, ENTRY_Z));
  portal.push(box(2 * (AISLE_HALF + 0.27), 0.62, 0.3, 0, CEIL - 0.31, ENTRY_Z));
  scene.add(new THREE.Mesh(mergeGeometries(portal, false)!, trimMat));
  // The sign plate the title is printed on, and a hot line under it so the
  // name is lit from below like a fascia sign.
  /*
   * The sign, on the *front* of the header beam.
   *
   * It was at ENTRY_Z - 0.17 — z = 0.58 — and the beam it is supposed to hang
   * on spans z 0.60 to 0.90. So the plate was mounted a couple of centimetres
   * behind the beam, and from the approach the beam hid it completely. The
   * name was being rendered, lit and repainted on every font load, and was
   * never once visible. A sign inside the doorway it is announcing is no sign
   * at all.
   *
   * It is now on the face the visitor actually walks toward, and bigger: 2.6m
   * across the 3.1m beam, which is the proportion a fascia sign over a door
   * actually has. The strip below it washes up the plate.
   */
  const signY = CEIL - 0.34;
  const signZ = ENTRY_Z + 0.17;
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024;
  signCanvas.height = 197; // 2.6 × 0.5m — same aspect as the plate
  paintSign(signCanvas, title);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  signTex.anisotropy = anisotropy;
  /*
   * Faintly self-lit, and it keeps a floor when the room goes dark.
   *
   * Everything else in here should disappear when you pull the cord — that is
   * the point of the cord. The sign is the exception, because a name plate
   * over a door is the one fitting in a real building that stays readable
   * when the lights are off, and because a pitch-black room with no landmark
   * at all is disorienting rather than atmospheric. It drops to a dim ember
   * and holds there.
   */
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: signTex,
    emissiveIntensity: 0.5,
    roughness: 0.55,
    metalness: 0.25,
  });
  scene.add(new THREE.Mesh(box(2.6, 0.5, 0.03, 0, signY, signZ), signMat));
  scene.add(new THREE.Mesh(box(2.6, 0.02, 0.07, 0, signY - 0.26, signZ + 0.02), stripMat));
  const titleAnchor = new THREE.Vector3(0, signY, signZ);

  /* ── the kit room hatch ───────────────────────────────────────────────
   * A counter, a lit room behind it, a shutter half up, a desk lamp and a
   * terminal that does not do anything yet.
   *
   * This is the destination, and the thing that makes it one is that it is
   * *lit from inside*. Every other light in the corridor is overhead and
   * general; this is a warm box at the end of a dark walk, which the eye
   * heads for without being told to. It is also the only light that does not
   * go out with the cord — pull it and the corridor goes dark and the hatch
   * stays on, because somebody is in there.
   *
   * Nothing here is interactive in this pass. The question gate 1 answers is
   * whether the end of the aisle feels like somewhere you have arrived; if it
   * does not, a working terminal in it will not help.
   */
  const hatchZ = roomEnd;

  // The room behind: an open-fronted cavity, so the opening reveals depth
  // rather than a painted panel.
  const cavity: THREE.BufferGeometry[] = [];
  const CAV_D = 1.05;
  cavity.push(box(2.3, 2.0, 0.06, 0, 1.2, hatchZ - CAV_D));
  cavity.push(box(0.06, 2.0, CAV_D, -1.15, 1.2, hatchZ - CAV_D / 2));
  cavity.push(box(0.06, 2.0, CAV_D, 1.15, 1.2, hatchZ - CAV_D / 2));
  cavity.push(box(2.3, 0.06, CAV_D, 0, 2.2, hatchZ - CAV_D / 2));
  cavity.push(box(2.3, 0.06, CAV_D, 0, 0.2, hatchZ - CAV_D / 2));
  scene.add(
    new THREE.Mesh(
      mergeGeometries(cavity, false)!,
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a4034'), roughness: 0.95 }),
    ),
  );
  // Shelving in the back, half-seen. Detail you never look at directly is
  // most of what stops a recess reading as a cardboard box.
  const shelves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    shelves.push(box(2.0, 0.03, 0.3, 0, 1.42 + i * 0.42, hatchZ - CAV_D + 0.2));
  }
  for (let i = 0; i < 7; i++) {
    shelves.push(box(0.1, 0.24, 0.16, -0.82 + i * 0.27, 1.57 + (i % 2) * 0.42, hatchZ - CAV_D + 0.22));
  }
  scene.add(new THREE.Mesh(mergeGeometries(shelves, false)!, trimMat));

  // The counter, protruding into the lobby so you can lean on it.
  const counter: THREE.BufferGeometry[] = [];
  counter.push(box(2.05, 0.075, 0.56, 0, HATCH_SILL, hatchZ + 0.2));
  counter.push(box(2.0, 0.5, 0.04, 0, HATCH_SILL - 0.28, hatchZ + 0.46));
  scene.add(
    new THREE.Mesh(
      mergeGeometries(counter, false)!,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#6b5b45'), roughness: 0.5, metalness: 0.1,
      }),
    ),
  );

  // Shutter: housing above the opening, and the slatted curtain part-rolled.
  const shutter: THREE.BufferGeometry[] = [];
  shutter.push(box(2.0, 0.16, 0.16, 0, HATCH_SILL + HATCH_H + 0.07, hatchZ + 0.06));
  for (let i = 0; i < 3; i++) {
    shutter.push(box(HATCH_W, 0.045, 0.03, 0, HATCH_SILL + HATCH_H - 0.04 - i * 0.055, hatchZ + 0.045));
  }
  scene.add(new THREE.Mesh(mergeGeometries(shutter, false)!, trimMat));

  // Desk lamp. A cone is the one shape in this room that is not a box, and it
  // earns the exception: the underside of a shade is where the light in a
  // small room like this visibly comes from.
  const lampX = 0.66;
  const lampY = HATCH_SILL + 0.04;
  scene.add(
    new THREE.Mesh(
      mergeGeometries(
        [
          box(0.16, 0.022, 0.16, lampX, lampY, hatchZ + 0.06),
          box(0.02, 0.36, 0.02, lampX, lampY + 0.19, hatchZ + 0.06),
        ],
        false,
      )!,
      trimMat,
    ),
  );
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.15, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2f333a'), roughness: 0.6, side: THREE.DoubleSide,
    }),
  );
  shade.position.set(lampX, lampY + 0.4, hatchZ + 0.06);
  scene.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.CircleGeometry(0.115, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6bd') }),
  );
  bulb.rotation.x = Math.PI / 2;
  bulb.position.set(lampX, lampY + 0.335, hatchZ + 0.06);
  scene.add(bulb);

  // Terminal: a screen on a wedge, tilted back. Dark for now — gate 2 puts
  // the conversation on it.
  /* ── the monitor ──────────────────────────────────────────────────────
   * A CRT, not a panel.
   *
   * This was a 2cm slab tilted back on a wedge — which is a flat-screen, and a
   * flat screen in a room with a roller shutter and a pull cord is an
   * anachronism the eye catches before it catches anything else. The whole
   * terminal reads as a period machine on the inside; the outside has to
   * agree.
   *
   * What makes a tube read as a tube is the depth behind it and the curve on
   * the front, in that order. The case tapers from a 44cm bezel to a 24cm
   * rear over 34cm — built as a four-sided CylinderGeometry, which is a square
   * frustum, and far cheaper than lofting one by hand. The glass is a patch of
   * a sphere with an 80cm radius: at this size that is an 18mm bulge, which is
   * almost nothing measured and unmistakable seen, because straight highlights
   * bend across it.
   */
  const MON_X = -0.44;
  const MON_Z = hatchZ + 0.26;
  const caseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#cfc4a8'), // yellowed beige, as they all went
    roughness: 0.72,
    metalness: 0.04,
  });

  // Rear shell: square frustum, narrow end away from the viewer.
  const shell = new THREE.CylinderGeometry(0.17, 0.31, 0.34, 4, 1, false);
  shell.rotateY(Math.PI / 4); // square faces square to the axes
  shell.rotateX(-Math.PI / 2); // stand the axis along z, narrow end at -z
  shell.translate(MON_X, HATCH_SILL + 0.24, MON_Z - 0.2);
  scene.add(new THREE.Mesh(shell, caseMat));

  /*
   * The bezel is a frame, not a slab.
   *
   * The first version was one solid box with the glass stuck on its front
   * face, five millimetres proud. That reads as a screen glued to a beige
   * brick: there is no aperture, so there is nothing for the tube to sit
   * behind and the surround has no thickness. Four pieces around an opening
   * cost three extra boxes and give the one thing a CRT front is made of — a
   * deep rim you look *into*, with the glass set back inside it and its own
   * curve catching the light at a different angle from the plastic.
   *
   * It also removes a z-fighting risk: coplanar-ish glass and bezel at 5mm
   * apart shimmer at glancing angles, and a glancing angle is how this is
   * seen for most of the walk.
   */
  const APERTURE_W = 0.35;
  const APERTURE_H = 0.27;
  const RIM_X = (0.46 - APERTURE_W) / 2;
  const RIM_Y = (0.4 - APERTURE_H) / 2;
  const bezel: THREE.BufferGeometry[] = [];
  const eyeY = HATCH_SILL + 0.24;
  bezel.push(box(0.46, RIM_Y, 0.075, MON_X, eyeY + (APERTURE_H + RIM_Y) / 2, MON_Z));
  bezel.push(box(0.46, RIM_Y, 0.075, MON_X, eyeY - (APERTURE_H + RIM_Y) / 2, MON_Z));
  bezel.push(box(RIM_X, APERTURE_H, 0.075, MON_X - (APERTURE_W + RIM_X) / 2, eyeY, MON_Z));
  bezel.push(box(RIM_X, APERTURE_H, 0.075, MON_X + (APERTURE_W + RIM_X) / 2, eyeY, MON_Z));
  bezel.push(box(0.3, 0.04, 0.24, MON_X, HATCH_SILL + 0.02, MON_Z - 0.04)); // foot
  bezel.push(box(0.34, 0.03, 0.2, MON_X, HATCH_SILL + 0.045, MON_Z - 0.04)); // tilt collar
  // Vents across the top.
  for (let i = 0; i < 7; i++) {
    bezel.push(box(0.3, 0.012, 0.014, MON_X, HATCH_SILL + 0.437, MON_Z - 0.06 - i * 0.03));
  }
  scene.add(new THREE.Mesh(mergeGeometries(bezel, false)!, caseMat));

  // Two knobs and a badge on the lower bezel — the details that date it.
  const knobMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3a3a38'), roughness: 0.5, metalness: 0.3,
  });
  for (const kx of [-0.14, -0.09]) {
    const k = new THREE.CylinderGeometry(0.013, 0.013, 0.016, 12);
    k.rotateX(Math.PI / 2);
    k.translate(MON_X + kx, HATCH_SILL + 0.075, MON_Z + 0.042);
    scene.add(new THREE.Mesh(k, knobMat));
  }
  scene.add(new THREE.Mesh(box(0.075, 0.016, 0.008, MON_X + 0.13, HATCH_SILL + 0.075, MON_Z + 0.04), knobMat));
  // Power lamp.
  scene.add(
    new THREE.Mesh(
      box(0.012, 0.008, 0.006, MON_X + 0.185, HATCH_SILL + 0.075, MON_Z + 0.04),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#68ff9d') }),
    ),
  );

  /*
   * The glass. A patch of a large sphere rather than a plane.
   *
   * SphereGeometry maps UV 0..1 across whatever angular slice you ask for, so
   * the screen texture lands on it undistorted without any UV work — the one
   * reason this is a sphere patch and not a lathed or displaced grid.
   */
  const GLASS_R = 0.8;
  const phiLen = 2 * Math.asin(0.17 / GLASS_R);
  const thetaLen = 2 * Math.asin(0.132 / GLASS_R);
  const glass = new THREE.SphereGeometry(
    GLASS_R, 26, 18,
    Math.PI / 2 - phiLen / 2, phiLen,
    Math.PI / 2 - thetaLen / 2, thetaLen,
  );
  glass.translate(0, 0, -GLASS_R); // bring the patch to the origin, bulging +z
  // Set back inside the aperture: the crown of the bulge stops a few
  // millimetres short of the bezel's front face, so the rim always reads as
  // in front of the tube.
  glass.translate(MON_X, eyeY, MON_Z + 0.026);

  // A dark liner behind the glass, closing the aperture. Without it the
  // recess is a hole onto whatever is behind the monitor.
  scene.add(
    new THREE.Mesh(
      box(APERTURE_W, APERTURE_H, 0.02, MON_X, eyeY, MON_Z - 0.03),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#0a120d'), roughness: 1 }),
    ),
  );

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 400;
  paintScreen(screenCanvas, title.split(' ')[0]);
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = anisotropy;
  const screenMat = new THREE.MeshStandardMaterial({
    map: screenTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: screenTex,
    emissiveIntensity: 0.7,
    roughness: 0.12, //  glass, so it catches the hatch lamp as a hard smear
    metalness: 0,
  });
  scene.add(new THREE.Mesh(glass, screenMat));

  const hatchAnchor = new THREE.Vector3(0, HATCH_SILL + HATCH_H / 2, hatchZ + 0.2);
  /*
   * The terminal's hit box, padded generously.
   *
   * A 46×30cm screen tilted back on a counter, seen from a metre and a half
   * away, is a small target — and unlike a locker door there is only one of
   * it, so a near miss costs the visitor the entire feature rather than
   * opening the wrong thing. The box takes in the wedge under it and a
   * handspan of counter either side: everything a person would reasonably
   * consider "the computer".
   */
  const termBox = new THREE.Box3(
    new THREE.Vector3(MON_X - 0.3, HATCH_SILL - 0.02, hatchZ - 0.12),
    new THREE.Vector3(MON_X + 0.3, HATCH_SILL + 0.5, hatchZ + 0.44),
  );

  // The light in there. Static, unlike the corridor rig, and it barely dips
  // when the cord is pulled.
  const hatchLight = new THREE.PointLight(new THREE.Color('#ffdcae'), 7, 5.5, 2);
  hatchLight.position.set(lampX * 0.4, HATCH_SILL + 0.72, hatchZ - 0.2);
  scene.add(hatchLight);

  /*
   * The notice board moved to the lobby's left wall.
   *
   * It was centred on the end wall, which is now where the hatch is, and
   * there is no sharing that space — two destinations dead ahead is no
   * destination. On the side wall it is better placed anyway: you read it in
   * passing as you walk the last few metres toward the counter, which is
   * exactly when someone actually looks at a notice board.
   *
   * Everything is built in the board's own frame and hung on a group that is
   * rotated a quarter turn. Building it rotated in world coordinates would
   * mean every note, pin and offset carrying the rotation by hand, and the
   * first person to nudge one would have to redo the trigonometry.
   */
  const boardY = 1.36;
  const boardWall = new THREE.Group();
  boardWall.position.set(-(AISLE_HALF + D + 0.02), 0, lobbyMid);
  boardWall.rotation.y = Math.PI / 2; // local +z now points into the lobby
  scene.add(boardWall);

  const boardMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7a6448'),
    roughness: 0.95,
  });
  boardWall.add(new THREE.Mesh(box(1.5, 1.05, 0.04, 0, boardY, 0.04), boardMat));
  boardWall.add(new THREE.Mesh(box(1.6, 1.15, 0.02, 0, boardY, 0.01), trimMat));
  // Pinned cards — one per contact row, in a slightly untidy grid.
  /*
   * The pinned notes.
   *
   * These were cork-coloured blanks with an HTML panel floating in front of
   * them, and the HTML won every time — four rounded cards with hover states,
   * hanging in mid-air over a board that had its own cards behind them. Two
   * sets of the same thing in the same place, one of them a web widget in a
   * room that is not a web page.
   *
   * Same fix as the locker chits: the writing goes onto the paper. Each note
   * is a real slip with the contact painted into its texture, pinned at a
   * slightly different angle, and the pin is a real pin. They are picked by
   * ray like the doors are, so clicking one opens the mail client or the
   * profile — a note you can take off the board rather than a button.
   */
  const notes: { box: THREE.Box3; href: string }[] = [];
  const noteMeshes: THREE.Mesh[] = [];
  const pinGeos: THREE.BufferGeometry[] = [];
  board.forEach((row, i) => {
    const col = i % 2;
    const rw = Math.floor(i / 2);
    const nx = -0.33 + col * 0.66;
    const ny = boardY + 0.24 - rw * 0.34;
    const tilt = (((i * 37) % 11) - 5) * 0.006;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 226;
    paintNote(canvas, row.label, row.value);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    noteCanvases.push({ canvas, tex, label: row.label, value: row.value });

    const g = box(0.6, 0.26, 0.006, nx, ny, 0.065);
    g.rotateZ(tilt);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
    boardWall.add(mesh);
    noteMeshes.push(mesh);

    pinGeos.push(box(0.02, 0.02, 0.028, nx, ny + 0.1, 0.082));
    notes.push({ box: new THREE.Box3(), href: row.href });
  });
  if (pinGeos.length) {
    boardWall.add(
      new THREE.Mesh(
        mergeGeometries(pinGeos, false)!,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color('#c0533a'),
          roughness: 0.35,
          metalness: 0.2,
        }),
      ),
    );
  }
  /*
   * Pick boxes, solved from the meshes rather than written out.
   *
   * The notes are tilted a couple of degrees each and the whole board is
   * rotated ninety, so hand-writing world-space AABBs for them would mean
   * doing that transform twice in two places and keeping the two in step
   * forever. setFromObject walks the actual geometry through the actual
   * matrices, so the hit box is whatever the note really is, padded enough
   * that a click near the edge of a slip still counts.
   */
  boardWall.updateMatrixWorld(true);
  noteMeshes.forEach((m, i) => {
    notes[i].box.setFromObject(m).expandByScalar(0.02);
  });
  const boardAnchor = new THREE.Vector3();
  boardWall.getWorldPosition(boardAnchor);
  boardAnchor.y = boardY;

  /* ── the system map, on the opposite wall ─────────────────────────────
   * A backlit panel facing the notice board across the lobby. The pairing is
   * deliberate: paper and cork on the left, lit glass on the right, so the
   * lobby has two walls that each do one thing rather than one wall doing
   * both badly.
   *
   * It emits, like the sign and the hatch, which gives the lobby a third
   * source and stops the far end of the room going flat when the corridor
   * strips are off.
   */
  const CHART_M_W = 1.62;
  const CHART_M_H = CHART_M_W * (CHART_H / CHART_W);
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = CHART_W;
  chartCanvas.height = CHART_H;
  paintChart(chartCanvas, chart, null, new Set());
  const chartTex = new THREE.CanvasTexture(chartCanvas);
  chartTex.colorSpace = THREE.SRGBColorSpace;
  chartTex.anisotropy = anisotropy;
  const chartMat = new THREE.MeshStandardMaterial({
    map: chartTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: chartTex,
    emissiveIntensity: 0.85,
    roughness: 0.3,
    metalness: 0.1,
  });

  const chartWall = new THREE.Group();
  chartWall.position.set(AISLE_HALF + D + 0.02, 0, lobbyMid);
  chartWall.rotation.y = -Math.PI / 2; // local +z points into the lobby
  scene.add(chartWall);
  const chartY = 1.42;
  chartWall.add(
    new THREE.Mesh(box(CHART_M_W + 0.1, CHART_M_H + 0.1, 0.05, 0, chartY, 0.02), trimMat),
  );
  const chartPanel = new THREE.Mesh(
    box(CHART_M_W, CHART_M_H, 0.02, 0, chartY, 0.05),
    chartMat,
  );
  chartWall.add(chartPanel);
  chartWall.updateMatrixWorld(true);

  const chartBox = new THREE.Box3().setFromObject(chartPanel);
  const chartAnchor = new THREE.Vector3();
  chartPanel.getWorldPosition(chartAnchor);

  /*
   * Screen space to chart pixels, in one hop.
   *
   * The ray hits the panel in world coordinates; worldToLocal puts that back
   * in the group's frame, where the panel is axis-aligned and centred on
   * (0, chartY), so the conversion to texture pixels is two divisions. Doing
   * it the other way — unprojecting per node, or keeping a parallel list of
   * world-space node positions — would mean the layout existed twice and the
   * two copies could disagree. The texture is the only source of truth for
   * where anything is.
   */
  const localHit = new THREE.Vector3();
  const chartAt = (ndcX: number, ndcY: number): ChartNode | null => {
    ndc.set(ndcX, ndcY);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectBox(chartBox, hitPoint)) return null;
    localHit.copy(hitPoint);
    chartWall.worldToLocal(localHit);
    const u = (localHit.x / CHART_M_W + 0.5) * CHART_W;
    const v = (0.5 - (localHit.y - chartY) / CHART_M_H) * CHART_H;
    return hitChart(chart, u, v);
  };

  let chartHover: string | null = null;
  let chartCited = new Set<string>();
  const repaintChart = () => {
    const near = new Set<string>();
    if (chartHover) {
      near.add(chartHover);
      for (const [a, b] of chart.links) {
        const na = chart.nodes[a].id;
        const nb = chart.nodes[b].id;
        if (na === chartHover) near.add(nb);
        if (nb === chartHover) near.add(na);
      }
    }
    paintChart(chartCanvas, chart, chartHover, near, chartCited);
    chartTex.needsUpdate = true;
  };
  const setChartHover = (id: string | null) => {
    if (id === chartHover) return;
    chartHover = id;
    repaintChart();
  };

  /* ── lights ──────────────────────────────────────────────────────────── */
  const ambient = new THREE.AmbientLight(new THREE.Color(ROOM.lamp), 0.42);
  scene.add(ambient);
  const fill = new THREE.HemisphereLight(
    new THREE.Color(ROOM.lamp),
    new THREE.Color(FLOOR),
    0.35,
  );
  scene.add(fill);

  // The travelling rig. Three warm points at strip height, riding the camera.
  const rig: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(new THREE.Color(ROOM.lamp), 15, 10, 2);
    scene.add(l);
    rig.push(l);
  }
  // A cold wash for when the strips are off, so the room goes dark without
  // going blind — silhouettes and the floor stay just readable.
  const moon = new THREE.DirectionalLight(new THREE.Color(ROOM.cold), 0);
  moon.position.set(0.4, 1, 0.6);
  scene.add(moon);

  /* ── state ───────────────────────────────────────────────────────────── */
  let lookX = 0, lookY = 0, curLookX = 0, curLookY = 0;
  let targetZ = startZ, curZ = startZ;
  let targetTurn = 0, curTurn = 0;
  let targetTerm = 0, curTerm = 0;
  let openId: number | null = null;
  let hoverId: number | null = null;
  let litTarget = 1, lit = 1;
  const filedIds = new Set(lockers.map((l) => l.id));
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const hotC = new THREE.Color(ROOM.trim);
  const baseC = new THREE.Color(ROOM.metalDark);

  /*
   * The walk is two moves, not one.
   *
   * Scrolling to the end used to leave you facing the hatch with the notice
   * board somewhere off to your left, edge-on and unreadable — which is a
   * poor reward for having walked the length of the room, and it wastes the
   * one wall the contact details are on. So the last stretch of the scroll
   * stops moving you forward and starts turning you: position lands at the
   * counter by WALK_END_T, and the remainder rotates to put the board square
   * in front of you.
   *
   * Both phases stay pure functions of scroll position. Scrub backwards and
   * you turn back and walk out, which is the property that makes a scrubbed
   * space feel like a space rather than a sequence of triggers.
   */
  const WALK_END_T = 0.86;
  const setProgress = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    targetZ = startZ + (walkEnd - startZ) * Math.min(1, c / WALK_END_T);
    targetTurn = Math.max(0, (c - WALK_END_T) / (1 - WALK_END_T));
  };
  /*
   * Scaled by WALK_END_T, because "walk to locker 7" means a position in the
   * corridor, and the corridor now occupies the first 86% of the scroll. Left
   * unscaled, clicking a locker near the end would overshoot into the turn
   * and spin the camera to the wall.
   */
  const progressFor = (id: number) =>
    Math.max(0, Math.min(1, (pivots[id].z - startZ) / (walkEnd - startZ))) * WALK_END_T;
  const setLook = (x: number, y: number) => { lookX = x; lookY = y; };
  /*
   * Door targets are recomputed from scratch rather than nudged.
   *
   * There are now two independent reasons a door can be open — the reader
   * clicked it, or the terminal cited it — and they overlap: an answer can
   * cite the very locker you already have open, and closing the pad must not
   * then slam a door the answer is still pointing at. Tracking that with
   * incremental set/clear means every new reason needs to know about every
   * old one. Deriving all of them from the two sets each time is a loop over
   * eighteen numbers and cannot get out of step.
   */
  const citedIds = new Set<number>();
  const applyDoors = () => {
    for (const l of lockers) {
      pivots[l.id].target = l.id === openId || citedIds.has(l.id) ? 1 : 0;
    }
  };
  const setOpen = (id: number | null) => {
    openId = id !== null && filedIds.has(id) ? id : null;
    applyDoors();
  };
  /**
   * What the current answer talked about: node ids for the wall chart, and
   * whichever of those are projects get their lockers opened.
   */
  const setCited = (ids: Set<string>) => {
    chartCited = ids;
    citedIds.clear();
    for (const l of lockers) {
      if (ids.has(`project:${l.slug}`)) citedIds.add(l.id);
    }
    applyDoors();
    repaintChart();
  };
  const setHover = (id: number | null) => {
    hoverId = id !== null && filedIds.has(id) ? id : null;
  };
  const setLit = (on: boolean) => { litTarget = on ? 1 : 0; };
  const boardProximity = () =>
    Math.max(0, Math.min(1, 1 - (curZ - walkEnd) / 3.5));
  /*
   * The title holds while you are at or outside the threshold and is gone a
   * couple of metres in. Tied to position rather than to a timer, so backing
   * out brings it back — in a scrubbed space every piece of state should be a
   * function of where you are, never of how long you have been there.
   */
  const facingBoard = () => curTurn;
  const setTerminal = (on: boolean) => { targetTerm = on ? 1 : 0; };
  const terminalBlend = () => curTerm;
  const pickTerminal = (ndcX: number, ndcY: number) => {
    ndc.set(ndcX, ndcY);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectBox(termBox, hitPoint) !== null;
  };
  const titleProximity = () =>
    Math.max(0, Math.min(1, (curZ - (ENTRY_Z - 2.2)) / 1.8));

  /** Which pinned note is under the pointer, if any. Returns its href. */
  const pickNote = (ndcX: number, ndcY: number) => {
    ndc.set(ndcX, ndcY);
    raycaster.setFromCamera(ndc, camera);
    for (const n of notes) {
      if (raycaster.ray.intersectBox(n.box, hitPoint)) return n.href;
    }
    return null;
  };

  const pick = (ndcX: number, ndcY: number) => {
    ndc.set(ndcX, ndcY);
    raycaster.setFromCamera(ndc, camera);
    let best: number | null = null;
    let bestD = Infinity;
    for (const l of lockers) {
      if (!raycaster.ray.intersectBox(pivots[l.id].box, hitPoint)) continue;
      const d = hitPoint.distanceToSquared(camera.position);
      if (d < bestD) { bestD = d; best = l.id; }
    }
    return best;
  };

  const fogOn = new THREE.Color(ROOM.fogOn);
  const fogOff = new THREE.Color(ROOM.fogOff);

  const tick = (dt: number) => {
    // Frame-rate independent smoothing: the same glide at 60Hz and 144Hz.
    const k = 1 - Math.pow(0.0006, dt);
    curZ += (targetZ - curZ) * k;
    curLookX += (lookX - curLookX) * k;
    curLookY += (lookY - curLookY) * k;

    curTurn += (targetTurn - curTurn) * k;
    curTerm += (targetTerm - curTerm) * k;
    screenMat.emissiveIntensity = 0.7 + 0.5 * curTerm;

    /*
     * Facing, as a blend between "down the corridor" and "at the board".
     *
     * Interpolating the look-at *point* rather than an angle: with the target
     * four metres ahead and the board two metres to the side, the swing this
     * produces is smooth and slightly eased-out at the end, which is how a
     * head actually turns. Rotating by angle instead would need the pivot
     * handled separately and buys nothing at this scale.
     *
     * The camera also steps away from the board as it turns — you cannot read
     * something you are standing against — and settles level with it.
     */
    const e = curTurn * curTurn * (3 - 2 * curTurn);
    const ax = curLookX * 0.62;
    const ay = EYE + curLookY * 0.34;
    const az = curZ - 4;
    camera.position.set(
      curLookX * 0.2 + (0.42 - curLookX * 0.2) * e,
      EYE + curLookY * 0.08,
      curZ + (lobbyMid - curZ) * e,
    );
    const lx = ax + (boardAnchor.x - ax) * e;
    const ly = ay + (boardAnchor.y - ay) * e;
    const lz = az + (boardAnchor.z - az) * e;

    /*
     * Sitting down at the counter.
     *
     * Applied last, over whatever the walk and the turn produced, because it
     * has to win from any starting pose — you can open the terminal while
     * mid-turn toward the notice board, and the result should be that you end
     * up at the screen, not somewhere between two intentions.
     *
     * The camera drops to just above counter height and closes to a bit over
     * a metre. It is not trying to fill the frame with the monitor; the chat
     * panel does that. What this buys is the *surround* — the hatch, the
     * shutter, the lamp and the shelves crowding in at the edges of the
     * screen, so reading the answer still happens in the room rather than in
     * a dialog box that opened over it.
     */
    if (curTerm > 0.001) {
      const te = curTerm * curTerm * (3 - 2 * curTerm);
      const px = camera.position.x;
      const py = camera.position.y;
      const pz = camera.position.z;
      camera.position.set(
        px + (-0.34 - px) * te,
        py + (HATCH_SILL + 0.48 - py) * te,
        pz + (hatchZ + 1.28 - pz) * te,
      );
      camera.lookAt(
        lx + (-0.4 - lx) * te,
        ly + (HATCH_SILL + 0.24 - ly) * te,
        lz + (hatchZ - 0.1 - lz) * te,
      );
    } else {
      camera.lookAt(lx, ly, lz);
    }

    /*
     * Park the rig on the three fixtures nearest the viewer rather than at
     * fixed offsets from the camera. Lights that slide along with you light
     * the room evenly and give away instantly that the fixtures overhead are
     * decoration — you walk and the bright patch walks with you, which never
     * happens under real lamps. Snapped to the lamp pitch, the pools sit
     * still and you move between them.
     */
    const nearest = Math.round((lampZ0 - curZ) / LAMP_PITCH);
    for (let i = 0; i < rig.length; i++) {
      rig[i].position.set(0, CEIL - 0.2, lampZ0 - (nearest + i - 1) * LAMP_PITCH);
    }

    // Lights, eased rather than switched — a strip light does not snap, it
    // takes a beat to come up, and that beat is most of why pulling the cord
    // feels like anything at all.
    const kl = 1 - Math.pow(0.02, dt);
    lit += (litTarget - lit) * kl;
    const l2 = lit * lit; // squared: the fade reads as light, not as opacity
    ambient.intensity = 0.05 + 0.42 * l2;
    fill.intensity = 0.06 + 0.4 * l2;
    for (const r of rig) r.intensity = 15 * l2;
    moon.intensity = 0.5 * (1 - l2);
    // The hatch keeps its lamp on. Somebody is in there.
    hatchLight.intensity = 4.4 + 2.6 * l2;
    stripMat.opacity = 0.08 + 0.92 * l2;
    signMat.emissiveIntensity = 0.16 + 0.44 * l2;
    // Backlit, so it stays readable in the dark — like every real one.
    chartMat.emissiveIntensity = 0.55 + 0.3 * l2;
    // The spill goes out completely — a dark corridor has no glow on the
    // walls, and leaving a residue there is the giveaway that it was painted.
    spillMat.opacity = 0.5 * l2;
    (scene.fog as THREE.Fog).color.copy(fogOff).lerp(fogOn, l2);

    // Doors.
    const kd = 1 - Math.pow(0.0009, dt);
    for (const l of lockers) {
      const p = pivots[l.id];
      if (Math.abs(p.open - p.target) > 0.0005) {
        p.open += (p.target - p.open) * kd;
        /*
         * Negated. Rotation about Y sends the leaf to x = z·sin(θ), so a
         * positive angle swings it toward +x — which is into the aisle for
         * the LEFT bank and into the wall for the right. Signing it off the
         * bank direction directly opened every door backwards, straight
         * through the carcass it was hinged to, and since the leaf ends up
         * inside a box the same colour as itself it looked like the doors
         * simply were not moving.
         */
        p.group.rotation.y = -p.dir * SWING * p.open;
      }
      const want = hoverId === l.id ? 1 : 0;
      if (Math.abs(p.hot - want) > 0.005) {
        p.hot += (want - p.hot) * kd;
        p.mat.color.copy(baseC).lerp(hotC, p.hot * 0.55);
      }
    }

    // Last in the frame, because it depends on both the doors and the camera
    // having already moved. Solved any earlier and every chit sits one frame
    // behind its own door, which on a fast scroll is plainly visible.
    solveLabels();
  };

  /*
   * Where each chit's text goes this frame.
   *
   * Runs after the doors have moved and the camera has settled, because the
   * card rides the door — a swinging locker carries its name with it, and
   * solving this from a static world position would leave the label hanging
   * in the air where the door used to be.
   *
   * Three things put a chit out of play, and all three matter:
   *
   *   behind you   — `ndc.z > 1`, or the label wraps round and prints itself
   *                  mirrored at the far end of the room.
   *   too far      — past LABEL_REACH. This is the one that was missing, and
   *                  it is why the vanishing point turned into a pile-up: at
   *                  a fixed type size every locker in the corridor competes
   *                  equally for the same handful of pixels.
   *   too oblique  — once you are past a door, its card is edge-on. Real type
   *                  on a real card would foreshorten to nothing, so anything
   *                  under about 25° off the face fades out rather than
   *                  floating free of the surface it is supposed to be on.
   */
  const camWorld = new THREE.Vector3();
  const cardWorld = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  const solveLabels = () => {
    camera.getWorldPosition(camWorld);
    for (let i = 0; i < labels.length; i++) {
      const m = labels[i];
      const p = pivots[m.id];
      cardWorld.copy(p.cardLocal);
      p.group.updateMatrixWorld();
      p.group.localToWorld(cardWorld);

      const dist = cardWorld.distanceTo(camWorld);
      m.depth = dist;

      // Door face normal, swung with the door.
      const th = p.group.rotation.y;
      const nx = -p.dir * Math.cos(th);
      const nz = p.dir * Math.sin(th);
      toCam.copy(camWorld).sub(cardWorld).normalize();
      const facing = nx * toCam.x + nz * toCam.z;

      cardWorld.project(camera);
      m.ndcX = cardWorld.x;
      m.ndcY = cardWorld.y;
      m.perMetre = 1 / (2 * dist * halfFov);

      const near = 1 - Math.max(0, (dist - LABEL_REACH * 0.62) / (LABEL_REACH * 0.38));
      const angle = Math.max(0, Math.min(1, (facing - 0.18) / 0.3));
      const onScreen =
        cardWorld.z < 1 && Math.abs(cardWorld.x) < 1.25 && Math.abs(cardWorld.y) < 1.25;
      m.alpha = onScreen ? Math.max(0, Math.min(1, near)) * angle : 0;
    }
  };

  /*
   * Repaint every card once the browser has the fonts.
   *
   * Canvas takes whatever is loaded at the moment you call fillText, and at
   * scene-build time a self-hosted handwriting face usually is not — so the
   * first paint silently falls back to a system cursive and stays there
   * forever, because a CanvasTexture is a snapshot, not a binding. One redraw
   * after `document.fonts.ready` costs eighteen fillText calls and is the
   * difference between the font you chose and whatever the OS had lying
   * around.
   */
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      for (const c of chitCanvases) {
        paintChit(c.canvas, c.number, c.label);
        c.tex.needsUpdate = true;
      }
      for (const n of noteCanvases) {
        paintNote(n.canvas, n.label, n.value);
        n.tex.needsUpdate = true;
      }
      paintSign(signCanvas, title);
      signTex.needsUpdate = true;
      paintScreen(screenCanvas, title.split(' ')[0]);
      screenTex.needsUpdate = true;
    });
  }

  const resize = (w: number, h: number) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
  };

  return {
    scene, camera, lockers, labels, boardAnchor, titleAnchor, hatchAnchor,
    setProgress, setLook,
    setOpen, setHover, setLit, pick, pickNote, progressFor, boardProximity,
    titleProximity, facingBoard, pickTerminal, setTerminal, terminalBlend,
    pickChart: chartAt, setChartHover, setCited, resize, tick, dispose,
  };
}