// src/components/graph/GraphJourney.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { buildGraph, type GraphNode, type NodeKind } from '@/lib/graph';
import { usePalette, useTheme } from '@/lib/useTheme';
import { DustCloud } from '@/components/graph/DustCloud';
import {
  OUTER,
  SHAPE_DEPTH,
  brainShape,
  knightShape,
  scatterShape,
  sphereShape,
  type Vec3,
} from '@/components/graph/shapes';
import { useVisible } from '@/components/core/WhenVisible';
import { GraphReadout } from '@/components/graph/GraphReadout';
import { AskAI } from '@/components/chat/AskAI';
import { BorderGlow } from '@/components/studio/BorderGlow';
import { Compare } from '@/components/studio/Compare';
import { SplitFlap } from '@/components/studio/SplitFlap';
import { prefillAsk } from '@/lib/ask';
import { profile, metrics } from '@/lib/content';
import type { Project } from '@/lib/content';

/**
 * The whole opening act, one graph.
 *
 * Second version. The first version got the basic idea right — one graph,
 * mounted once, pinned and morphing through a shape sequence while Hero / Ask
 * AI / Metrics / Proof took turns being shown beside it — but got the
 * mechanism wrong. It made all four of those absolutely positioned on top of
 * each other in the same box and crossfaded between them by hand. Two
 * problems followed directly from that: content that should scroll past just
 * faded in place instead, and — because "faded out" still means "in the DOM,
 * stacked on top of the next thing" for a brief window — Hero's name bled
 * through onto the Ask AI card while they crossed over.
 *
 * This version is the standard pinned-sidebar layout instead: a two-column
 * grid, the graph alone in a `position: sticky` right column, and Hero / Ask
 * AI / Metrics / Proof as ordinary, separate, normal-flow blocks in the left
 * column, stacked one after another. They scroll like any other page content
 * — because they *are* any other page content now, nothing fades, and by the
 * time one is centred in the viewport the previous one has already scrolled
 * fully past, so there's nothing to bleed through. The only actor with
 * anything special going on is the graph.
 *
 * Sequence, in order. One keyframe per screenful of scroll, so each shape is
 * fully formed exactly when its own block is centred — see the KEYS comment
 * for why that alignment is deliberate rather than incidental:
 *   heroRight    — assembled sphere, panned right. Hero's copy sits in the
 *                  first block on the left, and nodes are clickable (tap a
 *                  node → primes Ask AI).
 *   heroLeft     — same sphere, panned left, turned partway, as the page
 *                  scrolls Hero's block away and Ask AI's block in.
 *   scatterWide → scatterHold
 *                — one real scatter transition, then a "hold" keyframe where
 *                  the point cloud is identical — the graph reads as a
 *                  constant, fully-populated backdrop while Metrics' and then
 *                  Proof's blocks scroll past beside it, rather than
 *                  something that empties and refills between sections.
 *   sphere       — reassembles, centred. "Everything, connected."
 *   brain        — the two-lobed shape. "One mind behind all of it."
 *   brainTurn    — the same points, half a turn around. "Same mind, different
 *                  lens", meant literally.
 *   knight → knightHold
 *                — resolves into a chess knight as "Ishant Shrivastava"
 *                  appears beside it, then holds for one screen.
 *
 * Node count is never touched by any of this — every keyframe is a
 * repositioning of the same fixed set of points, which is what keeps the
 * on-screen density roughly constant instead of dipping to near-empty
 * between beats.
 *
 * ForceGraph3D is used purely as a sprite renderer — every node pinned every
 * frame, physics fully disabled, and d3AlphaDecay / d3AlphaMin /
 * d3VelocityDecay set as props rather than instance methods (calling them on
 * the ref throws on this project's resolved three-forcegraph version).
 *
 * Below `lg`: none of the pinning. A two-column layout doesn't mean anything
 * on a phone-width screen, so it's Hero, then a plain non-scroll-driven
 * sphere, then Ask AI, Metrics and Proof, stacked and scrolled normally.
 */

type PNode = {
  id: string;
  kind: NodeKind;
  /** Sprite diameter while the field is still a readable graph. */
  dot: number;
  /** Sprite diameter once it is a sculpture — one of the dust sizes. See DUST_MATCH. */
  sculptDot: number;
  color: string;
};

/** Unit vector from the origin toward the fixed camera — see the camera effect below. */
const CAM = new THREE.Vector3(0.18, 0.1, 1).normalize();

const DOT: Record<NodeKind, number> = {
  person: 20, // deliberately larger than everything — queen-bee node.
  role: 9,
  project: 6.6,
  domain: 4.8,
  achievement: 4.6,
  tech: 3.2,
};
const DEGREE_BONUS: Record<NodeKind, number> = {
  person: 0,
  role: 0.04,
  project: 0.28,
  domain: 0.16,
  achievement: 0,
  tech: 0.34,
};

/*
 * One keyframe per screenful, and that is load-bearing.
 *
 * The sequence used to run eleven keyframes across ten screens of scroll, so
 * nothing landed anywhere in particular: shapes finished forming partway
 * through whichever block happened to be passing, and the last three
 * transitions played out over two empty screenfuls at the end with no content
 * beside them. Making KEYS.length − 1 equal the number of scrollable screens
 * (eight content blocks plus a one-screen tail, so eight segments) makes segF
 * equal the block index exactly — every shape is fully formed at the moment
 * its own heading is centred, and none of them form anywhere else.
 *
 *   heroRight   0  Hero — assembled sphere, panned right, nodes clickable.
 *   heroLeft    1  Ask AI — same sphere, panned left and turned partway.
 *   scatterWide 2  Metrics — the cloud opens out behind the numbers.
 *   scatterHold 3  Proof — identical cloud, held, so the field reads as a
 *                  constant backdrop rather than emptying and refilling.
 *   sphere      4  "Everything, connected." — reassembles, centred.
 *   brain       5  "One mind behind all of it." — the two-lobed shape.
 *   brainTurn   6  "Same mind, different lens." — the same points, half a
 *                  turn around. The line finally means what it says: it is
 *                  literally the same cloud from the other side.
 *   knight      7  "Ishant Shrivastava" — resolves into the chess piece as
 *                  the name appears.
 *   knightHold  8  One screen of the held knight before Work starts.
 */
const KEYS = [
  'heroRight',
  'heroLeft',
  'scatterWide',
  'scatterHold',
  'sphere',
  'brain',
  'brainTurn',
  'knight',
  'knightHold',
] as const;
type Key = (typeof KEYS)[number];
const SEG_COUNT = KEYS.length - 1;

/** How far each keyframe pans the whole cloud sideways, in multiples of OUTER. Everything else is 0. */
const PAN: Partial<Record<Key, number>> = {
  heroRight: 1.15,
  heroLeft: -1.15,
};

/**
 * Roll about the view axis, in radians, per keyframe. Interpolated between
 * keyframes exactly like PAN.
 *
 * This exists for one moment: the knight should not simply appear upright and
 * finished. It leans out of the orbit it was part of, and straightens as it
 * resolves. So the cloud picks up a tilt across the half-turn on segment 5 —
 * "Same mind, different lens" now rolls as well as turns, which reads as the
 * shape being handled rather than played back — and then segment 6 eases that
 * tilt back to zero over the same span in which the points migrate into the
 * chess piece. The result is that the knight is visibly assembling at an angle
 * and comes to rest vertical, arriving on its feet at the exact frame the
 * shape completes.
 *
 * Roll rather than pitch: a tilt about the depth axis is the one you can
 * actually see resolve on a mostly-flat point cloud. Pitching it away from
 * camera would foreshorten the silhouette instead, which is the one thing the
 * shape cannot afford to lose.
 */
const TILT: Partial<Record<Key, number>> = {
  brainTurn: 0.5, // ~29°, leaning
  knight: 0, // upright
  knightHold: 0,
};

/**
 * Camera distance per keyframe, as a multiple of the framing solved for the
 * widest shape. Everything else is 1.
 *
 * The camera has to be pulled back far enough to hold the scatter, which is
 * six times the diameter of anything else in the sequence — so the knight,
 * framed for its neighbour, sat at about half the height of its own column.
 * A shape that is the payoff of eight screens of scroll should not be the
 * smallest thing on screen. The push-in runs across the same segment the
 * points migrate into the piece, so it reads as the camera closing on
 * something rather than as a zoom control being nudged, and it carries on a
 * little further through the hold.
 */
const ZOOM: Partial<Record<Key, number>> = {
  knight: 0.8,
  knightHold: 0.72,
};

/**
 * Which entry in SHAPE_DEPTH each keyframe uses for its depth cue. Both the
 * range and the strength are interpolated between keyframes exactly like PAN
 * and TILT, so the piece gains its volume on the way in rather than switching
 * it on at the last frame.
 */
const DEPTH_OF: Record<Key, keyof typeof SHAPE_DEPTH> = {
  heroRight: 'sphere',
  heroLeft: 'sphere',
  scatterWide: 'scatter',
  scatterHold: 'scatter',
  sphere: 'sphere',
  brain: 'brain',
  brainTurn: 'brain',
  knight: 'knight',
  knightHold: 'knight',
};

/**
 * Cumulative yaw added per segment (radians). Index i = the segment from
 * KEYS[i] to KEYS[i+1].
 *
 * The two turns are doing real work. The half-turn on segment 5 is what makes
 * "Same mind, different lens" true rather than decorative — brain and
 * brainTurn are the identical point cloud, and the only thing that changes is
 * which side of it you are standing on.
 *
 * Segment 6 lands a touch *short* of 2π and segment 7 carries it 0.77 past —
 * so the piece finishes forming just before dead profile, swings through it,
 * and comes to rest at about 35° of three-quarter. Both ends of that are
 * chosen rather than convenient.
 *
 * Dead profile is where a knight is most recognisable and least believable: it
 * is the view every chess set is photographed from, and it is also the one
 * view in which a carved piece is indistinguishable from a flat cut-out
 * however solid the geometry underneath actually is. So it is passed through
 * rather than parked at — the shape resolves at the moment it is easiest to
 * read, and then turns, and the turning is what tells you it was never flat.
 *
 * Past about 45° it stops being worth it: the muzzle foreshortens into the
 * cheek, the mane swings across the neck, and the silhouette that did all the
 * work goes with them. 35° is the far end of the useful range, which is where
 * it stops.
 *
 * All of that happens over the same screen in which the piece slides out of
 * its side dock and settles in the middle of the frame. Turning and travelling
 * together is the point: it arrives centred, still, and having shown you every
 * side of itself on the way.
 */
const YAW_DELTA: number[] = new Array(SEG_COUNT).fill(0);
YAW_DELTA[0] = Math.PI * 0.4; // heroRight → heroLeft: "rotates a bit" while it moves
YAW_DELTA[5] = Math.PI; // brain → brainTurn: the other side of the same mind
YAW_DELTA[6] = Math.PI * 0.6 - 0.15; // brainTurn → knight: lands it a hair short of square
YAW_DELTA[7] = 0.77; // knight → knightHold: swings through profile into three-quarter as it centres

/*
 * Per-shape captions used to be rendered by <GraphJourney> itself, as a
 * floating <p> centred over the sticky graph column. They're now real
 * headings in real content blocks in the .shell layout above, so this table
 * lives here only for reference — the same strings, in the same shape order.
 */
// const CAPTIONS: Partial<Record<Key, string>> = {
//   sphere: 'Everything, connected.',
//   brain: 'One mind behind all of it.',
//   alt: 'Same mind, different lens.',
//   icon: 'Ishant Shrivastava',
// };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/**
 * Every shape function returns positions in node-index order. But one node
 * *always* belongs at the origin — the person node (Ishant) — regardless of
 * shape, because that's the "queen bee" the rest of the graph orbits.
 * Rather than special-casing it inside every generator, we post-process:
 * find the person node's index and force its position to [0,0,0] here.
 */
function centerPerson(nodes: PNode[], positions: Vec3[]): Vec3[] {
  const i = nodes.findIndex((n) => n.kind === 'person');
  if (i < 0) return positions;
  const out = positions.slice();
  out[i] = [0, 0, 0];
  return out;
}

/** One soft white disc, tinted per node by the sprite material. Shared by every dot. */
function makeDotTexture() {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,1)');
    g.addColorStop(0.52, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

type Node3D = PNode & {
  name: string;
  label: string;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};

/**
 * How many particles the sculpture is made of.
 *
 * The knowledge graph has around a hundred nodes, which is plenty for a
 * sphere — a sphere is legible from a dozen points because the brain fills in
 * a shape it already expects. It is nowhere near enough for the knight. A
 * silhouette with real features (a stepped pedestal, a throat, a jaw, a
 * muzzle, two ears, a scalloped mane) needs enough points that each feature
 * gets a crowd, and at a hundred nodes the ears were getting two or three
 * each — so the piece came out as a wire outline with gaps rather than an
 * object with a surface.
 *
 * This was 190, and 190 was a ceiling imposed by the wrong mechanism rather
 * than by the design: the dust used to be extra nodes in ForceGraph3D's list,
 * one sprite and one draw call each. It is now a `THREE.Points` field in the
 * same scene, which costs three draw calls in total however many particles
 * are in it, so the number can be what the shape actually needs. See
 * DustCloud.
 *
 * What the shape needs turns out to be a lot. Seven thousand sounds generous
 * until it is spread over the whole surface of a real model — a knight has
 * some five hundred square millimetres of skin per particle at that count, and
 * the piece reads as a sketch of itself. Twenty thousand is where the surface
 * stops looking sampled and starts looking continuous. The GPU does not care
 * (it is still three draw calls); what does care is the frame loop, which is
 * why the keyframes below are flat `Float32Array`s rather than arrays of
 * triples — the per-frame work is then a straight walk through typed memory
 * with no per-particle object to index into.
 *
 * They stay inert: no id in the graph, no label, no hover, no click, and no
 * existence at all until the graph has stopped being a graph. They take their
 * colours from the theme's ambient array — the same palette as the page's own
 * background particle field — so they read as the dust the real nodes are
 * suspended in rather than as data being invented.
 */
const DUST_COUNT = 20000;

const SCULPT_FROM = 1.25;
const SCULPT_TO = 2.0;

/**
 * Sprite scales that land a real node at exactly the on-screen size of the
 * three dust buckets, so that once the field is a sculpture there is no such
 * thing as "a node" and "a mote" — there is one material.
 *
 * The 2.15 is not a fudge. A sprite is measured in world units and covers
 * `s / (2 · distance · tan(fov/2))` of the frame; a `THREE.Points` particle
 * goes through three's own attenuation, `size · (height/2) / distance`, and
 * with the renderer's default 50° field of view those two differ by a factor
 * of 1 / (2 · tan 25°) ≈ 2.15. Which is why the previous pass looked wrong
 * even though the numbers on both sides were the same: dust buckets of
 * 3.6 / 5.6 / 8.6 draw at the size of sprites 1.7 / 2.6 / 4.0, and the nodes —
 * a project hub reaching 10 units after its degree bonus — were landing at
 * three or four times that. Hence the two visible populations.
 *
 * They are also *assigned* rather than scaled. Multiplying each node's own
 * diameter by a constant preserves the whole spread of node sizes, degree
 * bonus and all, so a hub stays a hub and stays conspicuous; handing every
 * node one of three fixed sizes is what actually dissolves them into the
 * field.
 */
const DUST_MATCH = [1.68, 2.61, 4.01];
/**
 * The person node keeps a little of its status — half again the largest mote,
 * no more. It is still the origin every shape is built around, but in the
 * knight it sits inside the turned pedestal, and at its old size it read as a
 * lamp buried in the base rather than as the brightest thing in a field.
 */
const PERSON_SCULPT_SIZE = DUST_MATCH[2] * 1.5;


function useNodes(projects: Project[] | undefined) {
  const palette = usePalette();
  const colors = palette.graph;
  const graph = useMemo(() => buildGraph(true, projects), [projects]);
  const nodes = useMemo<Node3D[]>(() => {
    const degree = new Map<string, number>();
    for (const n of graph.nodes) degree.set(n.id, graph.adjacency.get(n.id)?.size ?? 0);
    return graph.nodes.map((n, i) => ({
      id: n.id,
      name: n.label,
      label: n.label,
      kind: n.kind,
      dot: DOT[n.kind] + Math.min(3.6, (degree.get(n.id) ?? 0) * DEGREE_BONUS[n.kind]),
      color: colors[n.kind],
      sculptDot: n.kind === 'person' ? PERSON_SCULPT_SIZE : DUST_MATCH[i % 3],
    }));
  }, [graph, colors]);
  return { graph, nodes };
}

export function GraphJourney({
  className = '',
  projects,
}: {
  className?: string;
  projects?: Project[];
}) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 64rem)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return isDesktop ? (
    <DesktopJourney className={className} projects={projects} />
  ) : (
    <MobileJourney projects={projects} />
  );
}

/* ── Desktop: pinned graph column, scrolling content column ─────────────── */

function DesktopJourney({ className, projects }: { className?: string; projects?: Project[] }) {
  const palette = usePalette();
  const colors = palette.graph;
  const [theme] = useTheme();
  const visible = useVisible();
  const { graph, nodes } = useNodes(projects);

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const outerRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const askBlockRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const texture = useRef<THREE.Texture | null>(null);
  /*
   * Whether the graph is still a thing you can interrogate. True for the two
   * screens where the copy says "tap a node" and every dot is a labelled
   * project; false from the crossover onward, where the nodes have shrunk into
   * a uniform field and there is nothing left to reveal — a readout popping
   * out of an anonymous 6px speck in the middle of the knight is noise, not
   * information. Read inside the rAF loop and the ForceGraph callbacks, so it
   * is a ref rather than state: flipping it must not re-render.
   */
  const interactive = useRef(true);
  const dots = useRef(new Map<string, THREE.Sprite>());
  const labels = useRef(new Map<string, THREE.Sprite>());
  const dust = useRef<DustCloud | null>(null);
  /** The distance the camera would sit at with no push-in. Solved once, in the camera effect. */
  const fit = useRef(0);
  /** The distance it is actually at, so the dolly only writes when it moves. */
  const camDist = useRef(0);

  const [size, setSize] = useState({ w: 0, h: 0 });

  const pick = (raw: Node3D) => {
    if (!interactive.current) return;
    const node = graph.nodes.find((n) => n.id === raw.id) ?? null;
    setSelected((prev) => (prev?.id === node?.id ? null : node));
    if (node) prefillAsk(`Tell me about ${node.label}`);
  };

  /**
   * "Blast radius" — the active node plus its direct neighbours. When
   * anything is active every other node gets dimmed and every node in this
   * set stays lit. Hover wins over selection if both are present.
   */
  const activeId = hovered ?? selected?.id ?? null;
  const highlightIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    graph.adjacency.get(activeId)?.forEach((id) => set.add(id));
    return set;
  }, [activeId, graph]);

  /** Every keyframe's point cloud, indexed by node position — computed once per node set. */
  const shapes = useMemo<Record<Key, Vec3[]>>(() => {
    // Every shape passes through centerPerson so the queen-bee node sits at
    // the origin in every keyframe — sphere, scatter, brain, knight, all of
    // it. In the knight the origin lands in the upper base, just below the
    // plinth the carved head sits on.
    const cp = (positions: Vec3[]) => centerPerson(nodes, positions);
    // Shared references, not copies: a held keyframe must be the *same*
    // numbers as the one before it, or the interpolator spends a screenful
    // easing between two indistinguishable clouds and the field shimmers.
    const ball = cp(sphereShape(nodes.length));
    const wide = cp(scatterShape(nodes.length, 3.0, 44));
    const mind = cp(brainShape(nodes.length));
    const piece = cp(knightShape(nodes.length));
    return {
      heroRight: ball,
      heroLeft: ball,
      scatterWide: wide,
      scatterHold: wide,
      sphere: ball,
      brain: mind,
      brainTurn: mind,
      knight: piece,
      knightHold: piece,
    };
  }, [nodes]);

  /**
   * The same nine keyframes for the dust, at its own far higher count. It is a
   * separate index space from the graph's, which is the point: the shapes are
   * generated from a count rather than from a node list precisely so that a
   * hundred real nodes and seven thousand motes can each be spread properly
   * over the whole of every shape, instead of the smaller set being handed one
   * contiguous slice of it.
   */
  const dustShapes = useMemo<Record<Key, Float32Array>>(() => {
    const flatten = (points: Vec3[]) => {
      const out = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        out[i * 3] = points[i][0];
        out[i * 3 + 1] = points[i][1];
        out[i * 3 + 2] = points[i][2];
      }
      return out;
    };
    const ball = flatten(sphereShape(DUST_COUNT));
    const wide = flatten(scatterShape(DUST_COUNT, 3.0, 71));
    const mind = flatten(brainShape(DUST_COUNT));
    const piece = flatten(knightShape(DUST_COUNT));
    return {
      heroRight: ball,
      heroLeft: ball,
      scatterWide: wide,
      scatterHold: wide,
      sphere: ball,
      brain: mind,
      brainTurn: mind,
      knight: piece,
      knightHold: piece,
    };
  }, []);

  const [first, ...rest] = profile.name.split(' ');

  /**
   * Sized to the slot itself — not the outer full-viewport sticky wrapper.
   * ForceGraph3D's canvas renders at exactly the width/height it's given and
   * doesn't shrink to fit a smaller parent on its own; measuring off the
   * wrong (larger) element is what let the canvas balloon past its box.
   */
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    texture.current = makeDotTexture();
    const tex = texture.current;
    return () => tex?.dispose();
  }, []);

  /** Renderer-only setup. See the file header for why these are props, not methods. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge', null);
    fg.d3Force('center', null);
    fg.d3Force('link', null);
  }, [nodes, size.w]);

  /**
   * The dust field, added straight into the graph's own scene rather than
   * handed to it as nodes. Rebuilt when the canvas or the palette changes,
   * because both the colours and the blend mode are baked in at construction.
   */
  useEffect(() => {
    const fg = fgRef.current;
    const map = texture.current;
    if (!fg || !size.w || !map) return;
    const scene = fg.scene?.();
    if (!scene) return;
    const cloud = new DustCloud(DUST_COUNT, colors.ambient, map, theme !== 'light');
    for (const points of cloud.objects) scene.add(points);
    dust.current = cloud;
    return () => {
      for (const points of cloud.objects) scene.remove(points);
      cloud.dispose();
      dust.current = null;
    };
  }, [size.w, size.h, colors, theme]);

  const nodeObject = (raw: Node3D) => {
    const group = new THREE.Group();
    const dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture.current ?? undefined,
        color: new THREE.Color(raw.color),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      }),
    );
    const diameter = raw.dot * 3;
    dot.scale.set(diameter, diameter, 1);
    dot.userData.phase = raw.dot * 1.7;
    group.add(dot);
    dots.current.set(raw.id, dot);

    if (raw.kind === 'person' || raw.kind === 'role' || raw.kind === 'project') {
      const text = new SpriteText(raw.name) as unknown as THREE.Sprite & {
        color: string;
        textHeight: number;
      };
      text.color = raw.kind === 'person' ? palette.text : palette.textBody;
      text.textHeight = raw.kind === 'person' ? 12 : 7.5;
      text.position.set(0, raw.dot + 9, 0);
      (text.material as THREE.SpriteMaterial).depthWrite = false;
      text.material.transparent = true;
      text.visible = false;
      group.add(text);
      labels.current.set(raw.id, text);
    }

    return group;
  };

  useEffect(() => {
    dots.current.clear();
    labels.current.clear();
  }, [nodes]);

  /** Fixed cinematic camera, framed to hold the widest shape (the far scatter) within this column's own aspect ratio. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w || !size.h) return;
    const controls = fg.controls?.();
    if (controls) controls.enabled = false;
    const aspect = size.w / size.h;
    const solved = (OUTER * 4.4) / Math.min(1.15, Math.max(0.55, aspect));
    fit.current = solved;
    camDist.current = solved;
    fg.cameraPosition(
      { x: solved * 0.18, y: solved * 0.1, z: solved },
      { x: 0, y: 0, z: 0 },
      0,
    );
  }, [size.w, size.h]);

  /** The scroll-to-shape mapping. Progress is measured across the whole outer section. */
  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    const tick = () => {
      const el = outerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const scrollable = Math.max(1, rect.height - window.innerHeight);
        const progress = reduced ? 0 : clamp01(-rect.top / scrollable);

        const segF = progress * SEG_COUNT;
        const segIdx = Math.min(SEG_COUNT - 1, Math.floor(segF));
        const localT = easeInOut(clamp01(segF - segIdx));
        const fromKey = KEYS[segIdx];
        const toKey = KEYS[segIdx + 1];
        const from = shapes[fromKey];
        const to = shapes[toKey];

        const panFrom = PAN[fromKey] ?? 0;
        const panTo = PAN[toKey] ?? 0;
        const panX = (panFrom + (panTo - panFrom) * localT) * OUTER;

        // Roll, interpolated the same way. Zero everywhere except across the
        // lean into the knight — see TILT.
        const tiltFrom = TILT[fromKey] ?? 0;
        const tiltTo = TILT[toKey] ?? 0;
        const tilt = tiltFrom + (tiltTo - tiltFrom) * localT;
        const cosT = Math.cos(tilt);
        const sinT = Math.sin(tilt);

        // 0 while the graph is still a graph, 1 once it is a sculpture. Drives
        // the dust fade-in and the real nodes' shrink — see SCULPT_FROM.
        const sculpt = easeInOut(clamp01((segF - SCULPT_FROM) / (SCULPT_TO - SCULPT_FROM)));

        /*
         * Depth cue. `half` is roughly how far the current shape reaches along
         * the view axis and `back` is what a particle at the far end of that
         * range is dimmed to, both eased between keyframes. Everything the
         * piece has in the way of volume comes from these two numbers: without
         * them a point cloud is exactly as flat as it looks, because a
         * perspective camera 1,300 units away cannot tell you anything useful
         * about 200 units of depth on its own.
         */
        const depthFrom = SHAPE_DEPTH[DEPTH_OF[fromKey]];
        const depthTo = SHAPE_DEPTH[DEPTH_OF[toKey]];
        const half = depthFrom.half + (depthTo.half - depthFrom.half) * localT;
        const back = depthFrom.back + (depthTo.back - depthFrom.back) * localT;

        // Push-in. Only written when it actually moves, so a segment with no
        // zoom change costs nothing.
        const zoomFrom = ZOOM[fromKey] ?? 1;
        const zoomTo = ZOOM[toKey] ?? 1;
        const wanted = fit.current * (zoomFrom + (zoomTo - zoomFrom) * localT);
        if (fit.current && Math.abs(wanted - camDist.current) > 0.4) {
          camDist.current = wanted;
          fgRef.current?.cameraPosition(
            { x: wanted * 0.18, y: wanted * 0.1, z: wanted },
            { x: 0, y: 0, z: 0 },
            0,
          );
        }

        /*
         * Cross the same boundary the dust does, once, in either direction.
         * Anything open at the moment interaction closes is dismissed —
         * otherwise a readout card opened during Ask AI would hang around over
         * the metrics with no node under it any more — and the slot stops
         * taking pointer events entirely, so the canvas is not silently
         * swallowing clicks and hovers over the content beside it.
         */
        const nowInteractive = segF < SCULPT_FROM;
        if (interactive.current !== nowInteractive) {
          interactive.current = nowInteractive;
          if (!nowInteractive) {
            setHovered(null);
            setSelected(null);
          }
          const el = slotRef.current;
          if (el) el.style.pointerEvents = nowInteractive ? 'auto' : 'none';
        }

        // Cumulative yaw: every completed segment's full delta, plus the
        // current segment's partial delta — so a turn that already happened
        // stays turned instead of resetting each segment.
        let yaw = 0;
        for (let s = 0; s < segIdx; s++) yaw += YAW_DELTA[s];
        yaw += YAW_DELTA[segIdx] * localT;
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const [x0, y0, z0] = from[i];
          const [x1, y1, z1] = to[i];
          const x = x0 + (x1 - x0) * localT + panX;
          const y = y0 + (y1 - y0) * localT;
          const z = z0 + (z1 - z0) * localT;
          // Yaw about the vertical axis first, then roll about the depth
          // axis. Order matters: rolling first would tip the axis that the
          // yaw then spins around, and the piece would wobble instead of
          // turning cleanly and then righting itself.
          const rx = x * cosY + z * sinY;
          const rz = -x * sinY + z * cosY;
          n.fx = n.x = rx * cosT - y * sinT;
          n.fy = n.y = rx * sinT + y * cosT;
          n.fz = n.z = rz;

          // Real nodes are shaded by depth too, once the field is a sculpture.
          // Leaving them at flat opacity put a hundred evenly-bright dots in
          // front of a cloud that had a front and a back, and they read as
          // stuck to the lens rather than as embedded in the piece.
          const cue = clamp01(
            0.5 + (n.fx * CAM.x + n.fy * CAM.y + n.fz * CAM.z) / (2 * half),
          );
          const shade = 1 - sculpt * (1 - (back + (1 - back) * cue));

          const dot = dots.current.get(n.id);
          if (dot) {
            const phase = (dot.userData.phase as number) ?? 0;
            const pulse = 1 + 0.05 * Math.sin(performance.now() * 0.0011 + phase);
            const base = n.dot * 3;

            // Blast-radius: dim non-neighbours, enlarge active + neighbours.
            // The person node stays bright regardless — it's the queen bee,
            // it never dims. Also enlarges by ~15% permanently so it reads
            // as the centre of the graph even before anything's hovered.
            const isPerson = n.kind === 'person';
            let scaleMul = pulse;
            let opacityMul = shade;
            if (isPerson) {
              scaleMul *= 1.15;
            }

            /*
             * The hand-off from graph to sculpture.
             *
             * For the first two screens this has to be a knowledge graph and
             * nothing else: the copy says "tap a node", every dot is a real
             * project or tool with a label and a readout behind it, and
             * padding that out with thousands of decorative motes would be
             * inventing data in the one place the visitor is being invited to
             * inspect it. So the dust does not exist at all through Hero and
             * Ask AI — not merely hidden, not scaled to zero and lurking in
             * the raycast, but a `THREE.Points` with `visible = false` that
             * is not in the graph's node list to begin with.
             *
             * After that the graph stops being a thing you read and starts
             * being a thing you watch — it has no labels, nothing is
             * clickable in practice, and its whole job is to hold a legible
             * silhouette. Two changes cross over together across that
             * boundary: the dust fades up, and the real nodes come down to
             * meet it. A project node is 20 units across against dust at
             * 3–8, so leaving them alone gives a band of fat coloured blobs
             * sitting on top of a fine mist, reading as two unrelated layers
             * rather than one field. Scaled to ~a third they land in the same
             * size band as the dust and the cloud reads as a single material.
             *
             * The person node shrinks by less than the rest: it is still the
             * origin every shape is built around, and in the knight it sits
             * at the heart of the turned pedestal, so it stays the one dot
             * that is obviously larger than everything else.
             */
            scaleMul *= 1 - sculpt * (1 - n.sculptDot / base);
            if (!isPerson) opacityMul *= 1 - sculpt * 0.1;

            if (highlightIds) {
              if (highlightIds.has(n.id)) {
                scaleMul *= n.id === activeId ? 1.55 : 1.25;
              } else if (!isPerson) {
                opacityMul *= 0.18;
                scaleMul *= 0.85;
              }
            }
            dot.scale.set(base * scaleMul, base * scaleMul, 1);
            const mat = dot.material as THREE.SpriteMaterial;
            mat.opacity = 0.94 * opacityMul;
          }
        }

        /*
         * The dust, through the same interpolation, the same pan, the same
         * yaw and the same roll — one field, one set of rules, two index
         * spaces. Skipped entirely while sculpt is zero, which is both free
         * and the thing that keeps the promise made two screens earlier: while
         * the copy says "tap a node", every point on screen is a node.
         */
        const cloud = dust.current;
        if (cloud) {
          cloud.begin(sculpt, back);
          if (sculpt > 0.002) {
            const dFrom = dustShapes[fromKey];
            const dTo = dustShapes[toKey];
            for (let i = 0; i < cloud.count; i++) {
              const j = i * 3;
              const x0 = dFrom[j];
              const y0 = dFrom[j + 1];
              const z0 = dFrom[j + 2];
              const x = x0 + (dTo[j] - x0) * localT + panX;
              const y = y0 + (dTo[j + 1] - y0) * localT;
              const z = z0 + (dTo[j + 2] - z0) * localT;
              const rx = x * cosY + z * sinY;
              const rz = -x * sinY + z * cosY;
              const fx = rx * cosT - y * sinT;
              const fy = rx * sinT + y * cosT;
              const cue = clamp01(0.5 + (fx * CAM.x + fy * CAM.y + rz * CAM.z) / (2 * half));
              cloud.set(i, fx, fy, rz, cue);
            }
          }
          cloud.end();
        }

        /*
          Labels: shown for a few different situations.
          - Always for person/role/project at the very start of scroll (hero
            state), same as before.
          - Any time a node is hovered or selected, its own label plus every
            neighbour's label — that's the "blast radius" callout.
        */
        const heroLabels = segIdx === 0 && localT < 0.1;
        for (const [id, label] of labels.current) {
          if (highlightIds?.has(id)) {
            label.visible = true;
          } else {
            label.visible = heroLabels && !highlightIds;
          }
        }

        /*
          Graph horizontal dock, per stage. Each content block above is one
          "screenful" tall (min-h-screen), and the stage index below is the
          block currently centred in view:
            0 Hero          → block LEFT, graph RIGHT
            1 Ask AI        → block RIGHT, graph LEFT
            2 Metrics       → numbers span the full row above; graph CENTERED behind
            3 Proof         → compares span the full row above; graph CENTERED behind
            4 Everything    → heading RIGHT, graph LEFT
            5 One mind      → heading LEFT, graph RIGHT
            6 Same mind     → heading RIGHT, graph LEFT
            7 Ishant        → heading LEFT, graph RIGHT — mirrors Hero, and
                              this is where the knight lands, so it gets a side
                              dock at full strength rather than the old
                              fade-to-0.15. The piece is the point of that
                              screen; burying it at 15% behind 113px type was
                              the previous version throwing away its own
                              ending. Text and graph no longer overlap, so
                              neither has to be dimmed for the other.
            8 tail          → CENTER. The knight leaves its dock and settles
                              in the middle of the frame while it finishes
                              turning. Nothing is beside it by then — the name
                              has scrolled past and Work has not arrived — so
                              the last thing the opening act does is put the
                              piece alone, centred and still.
          The block count matches the number of min-h-screen slots rendered
          above, plus the 100vh trailing spacer at the end.
        */
        const blockIdx = Math.max(0, Math.round(-outerRef.current!.getBoundingClientRect().top / window.innerHeight));
        const DOCK: Array<'left' | 'right' | 'center'> = [
          'right',  // Hero
          'left',   // Ask AI
          'center', // Metrics — dead center of the viewport
          'center', // Proof — dead center of the viewport
          'left',   // Everything, connected.
          'right',  // One mind behind all of it.
          'left',   // Same mind, different lens.
          'right',  // Ishant Shrivastava — the knight
          'center', // the tail — the knight comes to rest in the middle
        ];
        const dock = DOCK[Math.min(DOCK.length - 1, blockIdx)] ?? 'left';
        const slot = slotRef.current;
        if (slot && slot.dataset.side !== dock) {
          // Slot is 46vw wide inside a full-100vw wrapper (flex, default
          // flex-start). translateX is relative to the slot's OWN width, so
          // these percentages were solved for that: ~9% parks its left edge
          // ~4vw off the true left edge of the screen, ~109% parks its right
          // edge ~4vw off the true right edge, and ~59% centers it.
          if (dock === 'left') slot.style.transform = 'translateX(9%)';
          else if (dock === 'right') slot.style.transform = 'translateX(109%)';
          else slot.style.transform = 'translateX(59%)'; // centered
          // Dim the graph only where it sits centered *behind* content —
          // Metrics and Proof, whose numbers and compare cards have to stay
          // readable through it. Side docks clear the text column entirely,
          // and the centred tail has nothing beside it at all, so both run at
          // full opacity.
          slot.style.opacity = dock === 'center' && blockIdx < 4 ? '0.45' : '1';
          slot.dataset.side = dock;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, nodes, shapes, dustShapes, highlightIds, activeId]);

  return (
    <section ref={outerRef} id="graph" className={`relative scroll-mt-[24px] ${className}`}>
      {/*
        The graph, sticky. Its horizontal position is scroll-driven — it starts
        on the right (Hero on the left), slides left (Ask AI on the right),
        then continues swapping sides for each captioned stage.

        This wrapper spans the FULL viewport width, not the `.shell`-capped
        content column the text blocks live in — the graph is meant to swing
        out toward the actual screen edges the way it does on wide monitors,
        clear of the narrower text column, not just hop between the two
        halves of an already-centred 1280px block.

        The slot itself has `overflow-hidden` and its size is measured from
        itself, not this outer wrapper — ForceGraph3D's canvas renders at
        exactly the `width`/`height` props you hand it and does not shrink to
        fit a smaller parent on its own, so sizing off the wrong (larger)
        element is what let the canvas balloon past its box and hang off the
        edge of the screen.
      */}
      <div className="pointer-events-none sticky top-0 z-[5] flex h-screen w-full items-center">
        <div
          ref={slotRef}
          className="graph-slot pointer-events-auto relative h-[min(760px,82vh)] w-[46vw] overflow-hidden transition-[transform,opacity] duration-700 ease-out"
          style={{ transform: 'translateX(115%)' }}
          data-side="right"
        >
          {size.w > 0 && (
            <ForceGraph3D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={{ nodes: nodes as never, links: [] }}
              backgroundColor="rgba(0,0,0,0)"
              showNavInfo={false}
              numDimensions={3}
              nodeThreeObject={nodeObject as never}
              nodeLabel={(n: Node3D) => (interactive.current ? n.name : '')}
              onNodeClick={pick as never}
              onNodeHover={
                ((n: Node3D | null) => {
                  const id = interactive.current && n ? n.id : null;
                  // Functional form so re-hovering dead space while already
                  // null bails out instead of re-rendering on every frame the
                  // pointer moves across the canvas.
                  setHovered((prev) => (prev === id ? prev : id));
                }) as never
              }
              enableNodeDrag={false}
              enableNavigationControls={false}
              warmupTicks={0}
              cooldownTicks={Infinity}
              cooldownTime={Infinity}
              d3AlphaDecay={0}
              d3AlphaMin={0}
              d3VelocityDecay={1}
            />
          )}
        </div>
      </div>

      {/*
        Sits ON TOP of the sticky graph layer via a negative margin: each block
        gets one screenful of scroll distance and picks its own side/alignment
        within the .shell gutter. No column grid — that's what forced Metrics
        into 2×2 and Proof into a narrow left column in the earlier version.

        `pointer-events-none` on this whole wrapper so clicks on empty regions
        fall through to the WebGL canvas beneath — otherwise the invisible
        transparent min-h-screen blocks intercepted every hover/click and
        nodes were unreachable across the whole opening scroll. Every actual
        interactive element (h1, buttons, cards, headings) re-enables events
        for itself via `pointer-events-auto` on its own inner wrapper.
      */}
      <div className="relative z-[10] pointer-events-none" style={{ marginTop: '-100vh' }}>
        {/* Hero — left, graph on the right. */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full max-w-[520px] pointer-events-auto">
            <h1 className="t-display text-bone">
              {first}
              <br />
              {rest.join(' ')}
            </h1>
            <p className="t-body mt-[24px] max-w-[480px] text-mist">{profile.positioning}</p>
            <p className="t-caption mt-[18px] text-ash">
              {profile.title}, {profile.location.split(',')[0]}. {profile.availability}
            </p>
            <div className="mt-[30px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px]">
              <button
                type="button"
                onClick={() => askBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="pill"
              >
                Ask my AI about me
              </button>
              <a href={profile.resume} download className="ghost">
                Download resume
              </a>
            </div>
            <p className="t-caption mt-[36px] text-ash">
              {selected ? 'Tap anywhere else to clear' : 'Every project, tool and domain. Tap a node.'}
            </p>
          </div>
        </div>

        {/* Ask AI — card on the RIGHT, graph on the LEFT. Full "Ask about me" title kept in. */}
        <div ref={askBlockRef} id="ask" className="shell flex min-h-screen items-center justify-end scroll-mt-[24px]">
          <div className="w-full max-w-[540px] pointer-events-auto">
            <BorderGlow>
              <div className="px-[6px] pb-[36px] pt-[6px]">
                <AskAI />
              </div>
            </BorderGlow>
          </div>
        </div>

        {/* Metrics — four across, full width, aligned to the .shell gutter (matches image 3's ask). */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full pointer-events-auto">
            <div className="grid gap-[36px] sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m, i) => (
                <div key={m.label}>
                  <p className="t-heading-lg text-bone tabular-nums">
                    <SplitFlap value={m.value} delay={i * 120} />
                  </p>
                  <p className="t-body mt-[6px] max-w-[24ch] text-ash">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Proof — centered, full column width (image 4). */}
        <div id="proof" className="shell flex min-h-screen items-center justify-center scroll-mt-[24px]">
          <div className="mx-auto w-full max-w-[1100px] pointer-events-auto">
            <div className="text-center">
              <h2 className="t-heading-lg text-bone">Proof</h2>
              <p className="t-body mx-auto mt-[12px] max-w-[52ch] text-mist">
                Two systems, each shown as the thing that went in and the thing that came out.
              </p>
            </div>
            <div className="mt-[36px] grid gap-[36px] lg:grid-cols-2">
              <Compare
                before="/compare/ppe-before.svg"
                after="/compare/ppe-after.svg"
                beforeLabel="Raw frame"
                afterLabel="YOLOv8 output"
                caption="PPE Compliance System — five specialized detectors over a live CCTV feed."
              />
              <Compare
                before="/compare/diagram-prompt.svg"
                after="/compare/diagram-output.svg"
                beforeLabel="Plain English"
                afterLabel="Rendered diagram"
                caption="DiagramStudio — English compiles to DiagramDSL, then to an ELK layout graph."
              />
            </div>
          </div>
        </div>

        {/* "Everything, connected." — heading RIGHT, graph LEFT. */}
        <div className="shell flex min-h-screen items-center justify-end">
          <div className="w-full max-w-[520px] text-right pointer-events-auto">
            <h2 className="t-display text-bone">Everything,<br />connected.</h2>
          </div>
        </div>

        {/* "One mind behind all of it." — heading LEFT, graph RIGHT (image 6 correction). */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full max-w-[560px] pointer-events-auto">
            <h2 className="t-display text-bone">One mind<br />behind all of it.</h2>
          </div>
        </div>

        {/* "Same mind, different lens." — heading RIGHT, graph LEFT. */}
        <div className="shell flex min-h-screen items-center justify-end">
          <div className="w-full max-w-[560px] text-right pointer-events-auto">
            <h2 className="t-display text-bone">Same mind,<br />different lens.</h2>
          </div>
        </div>

        {/*
          "Ishant Shrivastava" — LEFT, mirroring Hero, with the knight docked
          right. It was centred and the graph faded to 0.15 behind it, which
          made sense when the shape underneath was an anonymous scatter and
          made no sense the moment it became a recognisable object. Opening on
          the name beside a sphere and closing on the name beside the knight is
          the same composition twice, which is what makes it read as an ending
          rather than as one more screenful.
        */}
        <div className="shell flex min-h-screen items-center">
          <div className="w-full max-w-[640px] pointer-events-auto">
            <h2 className="t-display text-bone">Ishant Shrivastava</h2>
          </div>
        </div>

        {/*
          One screenful of tail, so the knight holds fully formed for a beat
          before Work scrolls up over it. This was 200vh of nothing while three
          leftover shape transitions played out unseen; the sequence now ends
          on the knight, so all the tail has to do is let it sit.
        */}
        <div style={{ height: '100vh' }} aria-hidden />
      </div>

      {/*
        Global floating card. Renders itself absolutely-positioned inside the
        viewport, so it stays put no matter which stage of the scroll the
        selection was made at (Hero, Ask AI, Metrics, Proof, or any of the
        captioned shape stages). onDismiss clears `selected` for backdrop
        clicks, the X button and Escape — see GraphReadout for the details.
      */}
      <GraphReadout node={selected} onDismiss={() => setSelected(null)} />
    </section>
  );
}



/* ── Desktop: pinned graph column, scrolling content column ─────────────── */

/* ── Mobile / tablet: plain stack, no pinning, no scroll-jacking ─────────── */

function MobileJourney({ projects }: { projects?: Project[] }) {
  const { graph, nodes } = useNodes(projects);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const shape = useMemo(() => sphereShape(nodes.length), [nodes]);

  nodes.forEach((n, i) => {
    const p = shape[i];
    n.x = n.fx = p[0];
    n.y = n.fy = p[1];
    n.z = n.fz = p[2];
  });

  const pick = (raw: Node3D) => {
    const node = graph.nodes.find((n) => n.id === raw.id) ?? null;
    setSelected((prev) => (prev?.id === node?.id ? null : node));
    if (node) prefillAsk(`Tell me about ${node.label}`);
  };

  const [first, ...rest] = profile.name.split(' ');
  const askRef = useRef<HTMLDivElement>(null);

  return (
    <section id="graph" className="shell pt-[120px] scroll-mt-[96px]">
      <h1 className="t-display text-bone">
        {first}
        <br />
        {rest.join(' ')}
      </h1>
      <p className="t-body mt-[24px] max-w-[480px] text-mist">{profile.positioning}</p>
      <p className="t-caption mt-[18px] text-ash">
        {profile.title}, {profile.location.split(',')[0]}. {profile.availability}
      </p>
      <div className="mt-[30px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px]">
        <button
          type="button"
          onClick={() => askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="pill"
        >
          Ask my AI about me
        </button>
        <a href={profile.resume} download className="ghost">
          Download resume
        </a>
      </div>

      <div className="relative mt-[48px] aspect-square w-full">
        <StaticSphere nodes={nodes} onPick={pick} />
      </div>
      <p className="t-caption mt-[6px] text-center text-ash">
        {selected ? 'Tap the × to close' : 'Every project, tool and domain. Tap a node.'}
      </p>
      <GraphReadout node={selected} onDismiss={() => setSelected(null)} />

      <div ref={askRef} id="ask" className="mt-[60px] scroll-mt-[96px]">
        <BorderGlow>
          <div className="px-[6px] pb-[60px]">
            <AskAI />
          </div>
        </BorderGlow>
      </div>

      <div className="mt-[60px] grid grid-cols-2 gap-[24px]">
        {metrics.map((m, i) => (
          <div key={m.label}>
            <p className="t-heading-lg text-bone tabular-nums">
              <SplitFlap value={m.value} delay={i * 120} />
            </p>
            <p className="t-body mt-[6px] text-ash">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-[60px]" id="proof">
        <h2 className="t-heading-lg text-bone">Proof</h2>
        <p className="t-body mt-[12px] text-mist">
          Two systems, each shown as the thing that went in and the thing that came out.
        </p>
        <div className="mt-[24px] space-y-[24px]">
          <Compare
            before="/compare/ppe-before.svg"
            after="/compare/ppe-after.svg"
            beforeLabel="Raw frame"
            afterLabel="YOLOv8 output"
            caption="PPE Compliance System — five specialized detectors over a live CCTV feed."
          />
          <Compare
            before="/compare/diagram-prompt.svg"
            after="/compare/diagram-output.svg"
            beforeLabel="Plain English"
            afterLabel="Rendered diagram"
            caption="DiagramStudio — English compiles to DiagramDSL, then to an ELK layout graph."
          />
        </div>
      </div>
    </section>
  );
}

/** A small, static, non-scroll-driven sphere for mobile — the shape sequence is a desktop-only luxury. */
function StaticSphere({ nodes, onPick }: { nodes: Node3D[]; onPick: (n: Node3D) => void }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const texture = useRef<THREE.Texture | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    texture.current = makeDotTexture();
    const tex = texture.current;
    return () => tex?.dispose();
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge', null);
    fg.d3Force('center', null);
    fg.d3Force('link', null);
    const controls = fg.controls?.();
    if (controls) {
      controls.enabled = true;
      controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      controls.autoRotateSpeed = 0.5;
    }
    if (size.w) fg.cameraPosition({ x: OUTER * 1.1, y: OUTER * 0.6, z: OUTER * 3.2 }, { x: 0, y: 0, z: 0 }, 0);
  }, [size.w]);

  const nodeObject = (raw: Node3D) => {
    const dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture.current ?? undefined,
        color: new THREE.Color(raw.color),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      }),
    );
    const d = raw.dot * 3;
    dot.scale.set(d, d, 1);
    return dot;
  };

  return (
    <div ref={outerRef} className="h-full w-full">
      {size.w > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={{ nodes: nodes as never, links: [] }}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          numDimensions={3}
          nodeThreeObject={nodeObject as never}
          nodeLabel={(n: Node3D) => n.name}
          onNodeClick={onPick as never}
          enableNodeDrag={false}
          warmupTicks={0}
          cooldownTicks={Infinity}
          cooldownTime={Infinity}
          d3AlphaDecay={0}
          d3AlphaMin={0}
          d3VelocityDecay={1}
        />
      )}
    </div>
  );
}