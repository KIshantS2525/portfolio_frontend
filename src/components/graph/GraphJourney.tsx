// src/components/graph/GraphJourney.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { buildGraph, type GraphNode, type NodeKind } from '@/lib/graph';
import { usePalette } from '@/lib/useTheme';
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
 * Sequence, in order (unchanged from the first version):
 *   heroRight    — assembled sphere, panned right. Hero's copy sits in the
 *                  first block on the left, and nodes are clickable (tap a
 *                  node → primes Ask AI).
 *   heroLeft     — same sphere, panned left, turned partway, as the page
 *                  scrolls Hero's block away and Ask AI's block in.
 *   scatterWide → scatterWide2 → scatterWide3
 *                — one real scatter transition, then two "hold" keyframes
 *                  where the point cloud is identical — the graph reads as a
 *                  constant, fully-populated backdrop while Metrics' and then
 *                  Proof's blocks scroll past beside it, rather than
 *                  something that empties and refills between sections.
 *   sphere       — reassembles, centred. "Everything, connected."
 *   near / far / brain / alt / far2
 *                — a tighter scatter, a wider one, a two-lobed "brain", a
 *                  half-turn into a ring, then one final scatter. No left-
 *                  column content here beyond the headings already in the
 *                  .shell blocks below — the shape itself is the moment.
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

type Vec3 = [number, number, number];
type PNode = { id: string; kind: NodeKind; dot: number; color: string };

/** One shell radius for the whole sequence — every shape is built to roughly this scale. */
const OUTER = 260;

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

const KEYS = [
  'heroRight',
  'heroLeft',
  'scatterWide',
  'scatterWide2',
  'scatterWide3',
  'sphere',
  'near',
  'far',
  'brain',
  'alt',
  'far2',
] as const;
type Key = (typeof KEYS)[number];
const SEG_COUNT = KEYS.length - 1;

/** How far each keyframe pans the whole cloud sideways, in multiples of OUTER. Everything else is 0. */
const PAN: Partial<Record<Key, number>> = {
  heroRight: 1.15,
  heroLeft: -1.15,
};

/** Cumulative yaw added per segment (radians). Index i = the segment from KEYS[i] to KEYS[i+1]. */
const YAW_DELTA: number[] = new Array(SEG_COUNT).fill(0);
YAW_DELTA[0] = Math.PI * 0.4; // heroRight → heroLeft: "rotates a bit" while it moves
YAW_DELTA[8] = Math.PI; // brain → alt: the direction change, held afterward

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

/** mulberry32 — seeded, so every shape is identical on every visit and every render. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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

/** Golden-angle points on a sphere — even coverage, no clustering at the poles. */
function sphereShape(nodes: PNode[]): Vec3[] {
  const ga = Math.PI * (3 - Math.sqrt(5));
  return nodes.map((_, i) => {
    const y = nodes.length === 1 ? 0 : 1 - (i / (nodes.length - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i + 0.6;
    return [Math.cos(th) * r * OUTER, y * OUTER, Math.sin(th) * r * OUTER] as Vec3;
  });
}

/** A uniform ball of debris. `spread` is the radius as a multiple of OUTER. */
function scatterShape(nodes: PNode[], spread: number, seed: number): Vec3[] {
  const rand = rng(seed);
  return nodes.map(() => {
    const u = rand();
    const v = rand();
    const w = rand();
    const r = OUTER * spread * Math.cbrt(u);
    const theta = 2 * Math.PI * v;
    const phi = Math.acos(2 * w - 1);
    return [
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    ] as Vec3;
  });
}

/**
 * Two lobes on a shared Fibonacci sphere, split by index parity and separated
 * along x, with a low-frequency sine fold so the surface reads as organic
 * rather than two perfect eggs.
 */
function brainShape(nodes: PNode[]): Vec3[] {
  const ga = Math.PI * (3 - Math.sqrt(5));
  const sep = OUTER * 0.36;
  const rx = OUTER * 0.6;
  const ry = OUTER * 0.5;
  const rz = OUTER * 0.56;
  const perLobe = Math.ceil(nodes.length / 2);
  return nodes.map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const j = Math.floor(i / 2);
    const y = perLobe === 1 ? 0 : 1 - (j / (perLobe - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    const fold = 1 + 0.1 * Math.sin(y * 6 + th * 2);
    return [
      Math.cos(th) * r * rx * fold + side * sep,
      y * ry,
      Math.sin(th) * r * rz * fold,
    ] as Vec3;
  });
}

/** A ring, wound around several times so the density matches the other shapes. */
function altShape(nodes: PNode[]): Vec3[] {
  const R = OUTER * 0.6;
  const r = OUTER * 0.24;
  const winds = 6;
  return nodes.map((_, i) => {
    const u = ((i / nodes.length) * Math.PI * 2 * winds) % (Math.PI * 2);
    const v = (i * 2.399963) % (Math.PI * 2);
    return [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)] as Vec3;
  });
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

function useNodes(projects: Project[] | undefined) {
  const palette = usePalette();
  const colors = palette.graph;
  const graph = useMemo(() => buildGraph(true, projects), [projects]);
  const nodes = useMemo<Node3D[]>(() => {
    const degree = new Map<string, number>();
    for (const n of graph.nodes) degree.set(n.id, graph.adjacency.get(n.id)?.size ?? 0);
    return graph.nodes.map((n) => ({
      id: n.id,
      name: n.label,
      label: n.label,
      kind: n.kind,
      dot: DOT[n.kind] + Math.min(3.6, (degree.get(n.id) ?? 0) * DEGREE_BONUS[n.kind]),
      color: colors[n.kind],
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
  const dots = useRef(new Map<string, THREE.Sprite>());
  const labels = useRef(new Map<string, THREE.Sprite>());

  const [size, setSize] = useState({ w: 0, h: 0 });

  const pick = (raw: Node3D) => {
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
    // the origin in every keyframe — sphere, scatter, brain, ring, all of it.
    const cp = (positions: Vec3[]) => centerPerson(nodes, positions);
    const wide = cp(scatterShape(nodes, 3.0, 44));
    return {
      heroRight: cp(sphereShape(nodes)),
      heroLeft: cp(sphereShape(nodes)),
      scatterWide: wide,
      scatterWide2: wide,
      scatterWide3: wide,
      sphere: cp(sphereShape(nodes)),
      near: cp(scatterShape(nodes, 1.3, 11)),
      far: cp(scatterShape(nodes, 2.7, 22)),
      brain: cp(brainShape(nodes)),
      alt: cp(altShape(nodes)),
      far2: cp(scatterShape(nodes, 2.7, 33)),
    };
  }, [nodes]);

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
    const fit = (OUTER * 4.4) / Math.min(1.15, Math.max(0.55, aspect));
    fg.cameraPosition({ x: fit * 0.18, y: fit * 0.1, z: fit }, { x: 0, y: 0, z: 0 }, 0);
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
          const rx = x * cosY + z * sinY;
          const rz = -x * sinY + z * cosY;
          n.fx = n.x = rx;
          n.fy = n.y = y;
          n.fz = n.z = rz;

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
            let opacityMul = 1;
            if (isPerson) {
              scaleMul *= 1.15;
            }
            if (highlightIds) {
              if (highlightIds.has(n.id)) {
                scaleMul *= n.id === activeId ? 1.55 : 1.25;
              } else if (!isPerson) {
                opacityMul = 0.18;
                scaleMul *= 0.85;
              }
            }
            dot.scale.set(base * scaleMul, base * scaleMul, 1);
            const mat = dot.material as THREE.SpriteMaterial;
            mat.opacity = 0.94 * opacityMul;
          }
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
            7 Ishant        → heading CENTER, graph fades out
            8+ trailing shape transitions on their own, graph LEFT
          The block count matches the number of min-h-screen slots rendered
          above, plus the 200vh trailing spacer at the end.
        */
        const blockIdx = Math.max(0, Math.round(-outerRef.current!.getBoundingClientRect().top / window.innerHeight));
        const DOCK: Array<'left' | 'right' | 'center' | 'fade'> = [
          'right',  // Hero
          'left',   // Ask AI
          'center', // Metrics — dead center of the viewport
          'center', // Proof — dead center of the viewport
          'left',   // Everything, connected.
          'right',  // One mind behind all of it.
          'left',   // Same mind, different lens.
          'fade',   // Ishant Shrivastava
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
          // Dim the graph when it sits centered behind Metrics/Proof, so the
          // numbers and compare cards stay readable; hard-fade for the final
          // Ishant stage; full opacity for the left/right side docks.
          slot.style.opacity =
            dock === 'fade' ? '0.15' : dock === 'center' ? '0.45' : '1';
          slot.dataset.side = dock;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, nodes, shapes, highlightIds, activeId]);

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
              nodeLabel={(n: Node3D) => n.name}
              onNodeClick={pick as never}
              onNodeHover={((n: Node3D | null) => setHovered(n?.id ?? null)) as never}
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

        {/* "Ishant Shrivastava" — CENTERED, over the triangle-mark shape. */}
        <div className="shell flex min-h-screen items-center justify-center">
          <div className="w-full text-center pointer-events-auto">
            <h2 className="t-display text-bone">Ishant Shrivastava</h2>
          </div>
        </div>

        {/*
          Two extra screenfuls of scroll to give the last few graph-shape
          transitions (near → far, brain → alt, alt → far2)
          the room they need. The captions for those in-between shape changes
          aren't overlaid — the shape itself is the moment.
        */}
        <div style={{ height: '200vh' }} aria-hidden />
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
  const shape = useMemo(() => sphereShape(nodes), [nodes]);

  for (const n of nodes) {
    const p = shape[nodes.indexOf(n)];
    n.x = n.fx = p[0];
    n.y = n.fy = p[1];
    n.z = n.fz = p[2];
  }

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