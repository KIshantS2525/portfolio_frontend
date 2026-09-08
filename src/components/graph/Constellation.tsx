import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { useVisible } from '@/components/core/WhenVisible';
import { buildGraph, type GraphNode, type NodeKind } from '@/lib/graph';
import { usePalette } from '@/lib/useTheme';
import type { Project } from '@/lib/content';

/**
 * The constellation: a sphere of dots that assembles itself on arrival and
 * comes apart again as you scroll past it.
 *
 * There is no force simulation here. The layout is a closed-form solve —
 * golden-angle points on concentric shells, with each leaf placed in a rosette
 * slot around its parent — so every node's final position is known before the
 * first frame. That is what makes the animation possible: with a fixed target
 * per node, assembling is just a tween from a scattered position to it, and
 * scattering is the same tween run backwards off the scroll offset.
 *
 * (This was measured, not assumed. Running the same graph through d3's solver
 * for 515 ticks moved the nodes by an amount invisible at render scale — the
 * seeding was already doing all the work, and the simulation was burning a
 * frame budget to reproduce its own starting conditions.)
 *
 * ForceGraph3D is therefore used as a renderer only: every node is pinned, the
 * charge and centring forces are removed, and the link force is kept at zero
 * strength purely because it is what resolves link source/target ids into node
 * references for the line geometry.
 *
 * Nodes are draggable and stay where you drop them — a drop rewrites that
 * node's home position, so it keeps taking part in the assembly rather than
 * being frozen out of it. Right-click, or the reset button, sends it back.
 */

/**
 * Distance from centre per kind. The three leaf kinds share one radius on
 * purpose — they form the outer skin of the sphere, and splitting them into
 * separate shells is what made an earlier version read as flat rings.
 */
const SHELL: Record<NodeKind, number> = {
  person: 0,
  role: 108,
  project: 192,
  achievement: 252,
  domain: 252,
  tech: 252,
};

const OUTER = SHELL.tech;

/** Base dot radius before the degree bonus. */
const DOT: Record<NodeKind, number> = {
  person: 11,
  role: 8.5,
  project: 6.4,
  domain: 4.6,
  achievement: 4.4,
  tech: 3.1,
};

/** How much a node's connection count adds to its dot. Hubs read as hubs. */
const DEGREE_BONUS: Record<NodeKind, number> = {
  person: 0,
  role: 0.04,
  project: 0.28,
  domain: 0.16,
  achievement: 0,
  tech: 0.34,
};

/** Seconds for the full assembly, last node included. */
const ASSEMBLE_SECONDS = 2.4;
/** The spread of per-node start delays, as a fraction of the assembly. */
const MAX_STAGGER = 0.45;

type Vec3 = [number, number, number];

type Node3D = {
  id: string;
  name: string;
  kind: NodeKind;
  /** Dot radius in world units. */
  dot: number;
  color: string;
  /** Where this node belongs when fully assembled. A drop rewrites it. */
  home: Vec3;
  /** The solved position, kept so a drop can be undone. */
  origin: Vec3;
  /** Where it flies from, and back out to. */
  scatter: Vec3;
  /** 0…MAX_STAGGER — inner nodes arrive first and leave last. */
  stagger: number;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};

type Link3D = {
  source: string | Node3D;
  target: string | Node3D;
  /** Attached by three-forcegraph. Used to fade the lines with the assembly. */
  __lineObj?: THREE.Object3D;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInQuad = (t: number) => t * t;

/** mulberry32 — seeded, so the scatter is identical on every visit. */
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
 * One soft white disc, tinted per node by the sprite material. Generated once
 * and shared by every dot — a texture per colour would be dozens of canvases.
 */
function makeDotTexture() {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    // Hard-ish core with a short falloff: a crisp dot, not a blurry bokeh blob.
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

/** Golden-angle points on a sphere — even coverage, no clustering at the poles. */
function fibonacciSphere(count: number, radius: number, offset: number): Vec3[] {
  const ga = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i + offset;
    return [Math.cos(th) * r * radius, y * radius, Math.sin(th) * r * radius] as Vec3;
  });
}

/** Latitude rings + meridians. Cheaper and far cleaner than a wireframe mesh. */
function sphereArmature(radius: number, lats = 5, longs = 9, seg = 96) {
  const pts: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);

  for (let i = 1; i <= lats; i++) {
    const phi = (i / (lats + 1)) * Math.PI;
    const r = Math.sin(phi) * radius;
    const y = Math.cos(phi) * radius;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2;
      const a1 = ((s + 1) / seg) * Math.PI * 2;
      push(
        new THREE.Vector3(Math.cos(a0) * r, y, Math.sin(a0) * r),
        new THREE.Vector3(Math.cos(a1) * r, y, Math.sin(a1) * r),
      );
    }
  }

  for (let i = 0; i < longs; i++) {
    const th = (i / longs) * Math.PI;
    for (let s = 0; s < seg; s++) {
      const p0 = (s / seg) * Math.PI * 2;
      const p1 = ((s + 1) / seg) * Math.PI * 2;
      push(
        new THREE.Vector3(
          Math.sin(p0) * Math.cos(th) * radius,
          Math.cos(p0) * radius,
          Math.sin(p0) * Math.sin(th) * radius,
        ),
        new THREE.Vector3(
          Math.sin(p1) * Math.cos(th) * radius,
          Math.cos(p1) * radius,
          Math.sin(p1) * Math.sin(th) * radius,
        ),
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

export function Constellation({
  className = '',
  intensity = 1,
  zoom = 1,
  projects,
  onSelect,
  selectedId,
  /** Set false for a sphere that simply sits there. */
  assemble = true,
}: {
  className?: string;
  intensity?: number;
  zoom?: number;
  projects?: Project[];
  onSelect?: (node: GraphNode | null) => void;
  selectedId?: string | null;
  assemble?: boolean;
}) {
  const visible = useVisible();
  const palette = usePalette();
  const colors = palette.graph;

  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  /** Per node: the dot sprite and its label, so hover applies without a rebuild. */
  const objects = useRef(
    new Map<string, { dot: THREE.Sprite; label: THREE.Sprite | null; kind: NodeKind }>(),
  );
  const texture = useRef<THREE.Texture | null>(null);
  /** The node currently under the pointer mid-drag. Left alone by the tween. */
  const draggingId = useRef<string | null>(null);
  const dragging = useRef(false);
  const progress = useRef(0);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dense, setDense] = useState(true);
  const [touch, setTouch] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);

  /* ── layout ─────────────────────────────────────────────────────────── */

  const data = useMemo(() => {
    const g = buildGraph(dense, projects);
    const rand = rng(0x15846e);

    const degree = new Map<string, number>();
    for (const n of g.nodes) degree.set(n.id, g.adjacency.get(n.id)?.size ?? 0);

    const nodes: Node3D[] = g.nodes.map((n) => ({
      id: n.id,
      name: n.label,
      kind: n.kind,
      dot: DOT[n.kind] + Math.min(3.4, (degree.get(n.id) ?? 0) * DEGREE_BONUS[n.kind]),
      color: colors[n.kind],
      home: [0, 0, 0],
      origin: [0, 0, 0],
      scatter: [0, 0, 0],
      stagger: 0,
    }));

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const placed = new Set<string>();
    const place = (n: Node3D, p: Vec3) => {
      n.home = p;
      placed.add(n.id);
    };

    // Hubs first: an even Fibonacci spread per shell, each shell rotated
    // against the last so they don't line up into visible spokes.
    const roles = nodes.filter((n) => n.kind === 'role');
    const projs = nodes.filter((n) => n.kind === 'project');
    fibonacciSphere(roles.length, SHELL.role, 0.4).forEach((p, i) => place(roles[i], p));
    fibonacciSphere(projs.length, SHELL.project, 1.9).forEach((p, i) => place(projs[i], p));

    // Each leaf belongs to the first hub that claims it.
    const parentOf = new Map<string, Node3D>();
    for (const l of g.links) {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      if (!s || !t) continue;
      const leaf = t.kind === 'domain' || t.kind === 'tech' || t.kind === 'achievement' ? t : null;
      if (leaf && !parentOf.has(leaf.id)) parentOf.set(leaf.id, s);
    }

    /**
     * Leaves go into a golden-angle ring around their parent's direction.
     * Anchoring them at the parent's *point* instead was tried first and every
     * child of a project stacked into one fat dot.
     */
    const spun = new Map<string, number>();
    for (const n of nodes) {
      if (placed.has(n.id) || n.kind === 'person') continue;
      const parent = parentOf.get(n.id);
      const dir = new THREE.Vector3(...(parent?.home ?? [0.001, 0.001, 0.001]));
      if (dir.lengthSq() < 1e-9) dir.set(0.001, 0.001, 0.001);
      dir.normalize();

      const key = parent?.id ?? 'root';
      const i = (spun.get(key) ?? 0) + 1;
      spun.set(key, i);

      const tangent = new THREE.Vector3(0, 1, 0).cross(dir);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
      tangent.normalize();
      const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();

      // Three concentric sub-rings, so a big cluster reads as a rosette rather
      // than a single circle of evenly spaced beads.
      const spread = 0.15 + (i % 3) * 0.075;
      const angle = i * 2.399;
      const out = dir
        .clone()
        .addScaledVector(tangent, Math.cos(angle) * spread)
        .addScaledVector(bitangent, Math.sin(angle) * spread)
        .normalize()
        .multiplyScalar(SHELL[n.kind]);

      place(n, [out.x, out.y, out.z]);
    }

    /**
     * Scatter targets. Each node is thrown outward along its own direction and
     * then knocked off that line by a seeded random vector, so the cloud comes
     * apart unevenly instead of breathing in and out as one shell.
     */
    for (const n of nodes) {
      const [hx, hy, hz] = n.home;
      const len = Math.hypot(hx, hy, hz) || 1;
      // Capped deliberately. The camera sits at ~2.95x OUTER, and a throw that
      // clears it sends the furthest debris behind the lens, where it pops out
      // of frame instead of drifting.
      const throwOut = 1.4 + rand() * 0.7;
      const jitter = OUTER * 0.85;
      n.scatter = [
        hx * throwOut + (rand() - 0.5) * jitter,
        hy * throwOut + (rand() - 0.5) * jitter,
        hz * throwOut + (rand() - 0.5) * jitter,
      ];
      // The root has no direction of its own, so give it one.
      if (len < 1) {
        n.scatter = [(rand() - 0.5) * jitter * 2, (rand() - 0.5) * jitter * 2, (rand() - 0.5) * jitter * 2];
      }
      // Inner shells land first and leave last — it forms from the middle out.
      const depth = len / OUTER;
      n.stagger = MAX_STAGGER * clamp01(depth * 0.75 + rand() * 0.25);
      n.origin = n.home;
      [n.x, n.y, n.z] = n.scatter;
      [n.fx, n.fy, n.fz] = n.scatter;
    }

    return {
      nodes,
      links: g.links.map((l) => ({ ...l })) as Link3D[],
      adjacency: g.adjacency,
      raw: g.nodes,
    };
  }, [dense, projects, colors]);

  const neighbours = useMemo(() => {
    const active = hovered ?? selectedId;
    if (!active) return null;
    const set = new Set<string>([active]);
    data.adjacency.get(active)?.forEach((id) => set.add(id));
    return set;
  }, [hovered, selectedId, data]);

  /* Restart the assembly whenever the graph itself changes. */
  useEffect(() => {
    progress.current = 0;
  }, [data]);

  /* ── sizing ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setDense(window.innerWidth >= 768);
    setTouch(window.matchMedia('(hover: none)').matches);
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    const onResize = () => setDense(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    texture.current = makeDotTexture();
    const tex = texture.current;
    return () => tex?.dispose();
  }, []);

  /* ── the renderer, stripped of its physics ──────────────────────────── */

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    fg.d3Force('charge', null);
    fg.d3Force('center', null);
    // The link force stays, at zero strength. It contributes nothing to the
    // layout, but removing it also removes the thing that resolves link
    // source/target ids into node references, and the lines stop drawing.
    fg.d3Force('link')?.strength(0).distance(0);

    // d3AlphaDecay/d3AlphaMin/d3VelocityDecay are props on this version of the
    // library, not imperative methods on the instance — calling them here
    // throws "fg.d3AlphaDecay is not a function". They're set as props below
    // instead. Every node is pinned, so a tick is just a copy of fx/fy/fz into
    // x/y/z; it has to keep running because three-forcegraph only syncs object
    // positions from inside its tick, so a stopped engine is a frozen picture.
  }, [data, size.w]);

  /* ── the armature ───────────────────────────────────────────────────── */

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w) return;
    const scene = fg.scene?.();
    if (!scene) return;

    const geo = sphereArmature(OUTER + 34);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colors.link),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = -1;
    lines.userData.armature = true;
    scene.add(lines);

    return () => {
      scene.remove(lines);
      geo.dispose();
      mat.dispose();
    };
  }, [size.w, colors]);

  /* ── node sprites ───────────────────────────────────────────────────── */

  const nodeObject = useCallback(
    (raw: Node3D) => {
      const group = new THREE.Group();

      const dot = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture.current ?? undefined,
          color: new THREE.Color(raw.color),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      const diameter = raw.dot * 3;
      dot.scale.set(diameter, diameter, 1);
      dot.userData.baseScale = diameter;
      dot.userData.activeScale = 1;
      dot.userData.targetOpacity = Math.min(1, 0.92 * intensity);
      dot.userData.phase = (raw.dot * 1.7 + raw.stagger * 11) % (Math.PI * 2);
      group.add(dot);

      let label: THREE.Sprite | null = null;
      if (dense && raw.kind !== 'tech') {
        // SpriteText extends THREE.Sprite but its typings don't surface the
        // inherited members, so it is narrowed here rather than cast at each use.
        const text = new SpriteText(raw.name) as unknown as THREE.Sprite & {
          color: string;
          textHeight: number;
        };
        text.color = raw.kind === 'person' ? palette.text : palette.textBody;
        text.textHeight = raw.kind === 'person' ? 11 : 7;
        text.position.set(0, raw.dot + 9, 0);
        (text.material as THREE.SpriteMaterial).depthWrite = false;
        text.material.transparent = true;
        text.userData.always =
          raw.kind === 'person' || raw.kind === 'role' || raw.kind === 'project';
        text.visible = false;
        group.add(text);
        label = text;
      }

      objects.current.set(raw.id, { dot, label, kind: raw.kind });
      return group;
    },
    [intensity, dense, palette],
  );

  useEffect(() => {
    objects.current.clear();
  }, [data, nodeObject]);

  /**
   * Hover and selection write a *target*, which the frame loop then multiplies
   * by the assembly factor. Writing the material directly here would fight the
   * tween, and rebuilding the meshes — the original approach — is what caused
   * the flicker.
   */
  useEffect(() => {
    const active = hovered ?? selectedId;
    for (const [id, o] of objects.current) {
      const dim = neighbours ? !neighbours.has(id) : false;
      const isActive = id === active;
      o.dot.userData.targetOpacity = dim
        ? colors.dimAlpha * 2
        : Math.min(1, (isActive ? 1 : 0.92) * intensity);
      o.dot.userData.activeScale = isActive ? 1.7 : 1;
      if (o.label) {
        o.label.userData.shown = isActive || (o.label.userData.always && !dim);
        (o.label.material as THREE.SpriteMaterial).opacity = isActive ? 1 : 0.8;
      }
    }
  }, [hovered, selectedId, neighbours, intensity, colors, data]);

  /* ── assembly, scatter, pulse and orbit ─────────────────────────────── */

  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !assemble) progress.current = 1;

    let raf = 0;
    let last = performance.now();
    const start = last;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const clock = (now - start) / 1000;

      if (!reduced && assemble) {
        progress.current = Math.min(1, progress.current + dt / ASSEMBLE_SECONDS);
      }
      const p = progress.current;

      /**
       * How far the graph has scrolled past the top of the viewport, 0…1. This
       * is the disassembly: the sphere comes apart as it leaves, and puts
       * itself back together if you scroll back up.
       */
      let out = 0;
      if (!reduced && assemble) {
        const r = wrapRef.current?.getBoundingClientRect();
        if (r) out = clamp01(-r.top / Math.max(1, r.height * 0.9));
      }

      let mean = 0;
      for (const n of data.nodes) {
        // Outer nodes shed first, inner ones hold on — the reverse of the way
        // it assembled.
        const delay = 0.22 * (1 - n.stagger / MAX_STAGGER);
        const outT = easeInQuad(clamp01((out - delay) / Math.max(0.01, 1 - delay)));
        const inT = easeOutCubic(clamp01((p - n.stagger) / (1 - MAX_STAGGER)));
        const a = inT * (1 - outT);
        mean += a;

        const o = objects.current.get(n.id);
        if (o) {
          const base = (o.dot.userData.baseScale as number) ?? 1;
          const active = (o.dot.userData.activeScale as number) ?? 1;
          const phase = (o.dot.userData.phase as number) ?? 0;
          const s = base * active * (0.45 + 0.55 * a) * (1 + 0.07 * Math.sin(clock * 1.3 + phase));
          o.dot.scale.set(s, s, 1);
          (o.dot.material as THREE.SpriteMaterial).opacity =
            ((o.dot.userData.targetOpacity as number) ?? 1) * (0.05 + 0.95 * a ** 0.7);
          // Text flying around the screen is noise, so it only exists once the
          // node it belongs to has arrived.
          if (o.label) o.label.visible = Boolean(o.label.userData.shown) && a > 0.85;
        }

        if (n.id === draggingId.current) continue;

        // Debris keeps moving. Without this the scattered state looks paused.
        const drift = (1 - a) * 14;
        const [sx, sy, sz] = n.scatter;
        const [hx, hy, hz] = n.home;
        n.fx = n.x = sx + (hx - sx) * a + Math.sin(clock * 0.6 + n.stagger * 21) * drift;
        n.fy = n.y = sy + (hy - sy) * a + Math.cos(clock * 0.5 + n.stagger * 17) * drift;
        n.fz = n.z = sz + (hz - sz) * a + Math.sin(clock * 0.45 + n.stagger * 13) * drift;
      }

      mean /= Math.max(1, data.nodes.length);

      // Lines and armature ride the same factor. Links between a landed node
      // and one still in flight would otherwise sweep across the whole frame.
      const linkAlpha = Math.min(0.09, colors.linkAlpha * 0.7) * mean ** 2.2;
      for (const l of data.links) {
        const obj = l.__lineObj as (THREE.Object3D & { material?: THREE.Material }) | undefined;
        if (!obj) continue;
        const line = (obj.children.length ? obj.children[0] : obj) as THREE.Object3D & {
          material?: THREE.Material & { opacity?: number };
        };
        if (line.material) line.material.opacity = linkAlpha;
      }

      const scene = fgRef.current?.scene?.();
      const armature = scene?.children.find(
        (c: THREE.Object3D) => c.userData.armature,
      ) as THREE.LineSegments | undefined;
      if (armature) {
        (armature.material as THREE.LineBasicMaterial).opacity =
          Math.min(0.055, colors.linkAlpha * 0.45) * mean ** 2;
      }

      // Auto-orbit, paused whenever the visitor is actually doing something.
      const controls = fgRef.current?.controls?.();
      if (controls) controls.autoRotate = !reduced && !hovered && !dragging.current && !selectedId;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, hovered, selectedId, data, colors, assemble]);

  /* Pause the renderer entirely when off screen. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    if (visible) fg.resumeAnimation?.();
    else fg.pauseAnimation?.();
  }, [visible, size.w]);

  /* Camera. The sphere has a known radius, so this is arithmetic rather than a
     guess — no zoomToFit hunting around while the layout is still expanding. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !size.w) return;

    const controls = fg.controls?.();
    if (controls) {
      controls.autoRotateSpeed = 0.42;
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.minDistance = OUTER * 1.15;
      controls.maxDistance = OUTER * 6;
    }

    const aspect = size.w / Math.max(1, size.h);
    const fit = (OUTER * (dense ? 2.95 : 3.5)) / Math.min(1.25, Math.max(0.72, aspect)) / zoom;
    fg.cameraPosition({ x: fit * 0.26, y: fit * 0.16, z: fit }, { x: 0, y: 0, z: 0 }, 0);
  }, [size.w, size.h, dense, zoom]);

  /* ── interaction ────────────────────────────────────────────────────── */

  const handleClick = (node: Node3D) => {
    const raw = data.raw.find((n) => n.id === node.id) ?? null;
    onSelect?.(raw && raw.id === selectedId ? null : raw);
  };

  /**
   * A drop rewrites the node's home rather than pinning it outright, so it
   * still assembles and scatters with everything else.
   */
  const handleDragEnd = (node: Node3D) => {
    dragging.current = false;
    draggingId.current = null;
    node.home = [node.x ?? 0, node.y ?? 0, node.z ?? 0];
    setMoved((c) => c + 1);
  };

  /** Put every dragged node back on its solved point and replay the assembly. */
  const resetLayout = () => {
    for (const n of data.nodes) n.home = n.origin;
    progress.current = 0;
    setMoved(0);
  };

  const controlsEnabled = !touch || exploring;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {size.w > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={{ nodes: data.nodes, links: data.links }}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          controlType="orbit"
          numDimensions={3}
          nodeThreeObject={nodeObject as never}
          nodeLabel={(n: Node3D) => n.name}
          linkColor={() => colors.link}
          linkOpacity={Math.min(0.09, colors.linkAlpha * 0.7)}
          linkWidth={colors.linkWidth}
          enableNodeDrag={controlsEnabled}
          enableNavigationControls={controlsEnabled}
          onNodeHover={(n: Node3D | null) => setHovered(n?.id ?? null)}
          onNodeClick={handleClick as never}
          onNodeDrag={((n: Node3D) => {
            dragging.current = true;
            draggingId.current = n.id;
          }) as never}
          onNodeDragEnd={handleDragEnd as never}
          onBackgroundClick={() => onSelect?.(null)}
          warmupTicks={0}
          cooldownTicks={Infinity}
          cooldownTime={Infinity}
          d3AlphaDecay={0}
          d3AlphaMin={0}
          d3VelocityDecay={1}
        />
      )}

      {moved > 0 && controlsEnabled && (
        <button
          type="button"
          onClick={resetLayout}
          className="absolute right-[10px] top-[10px] rounded-full border border-ash/30 px-[12px] py-[6px] t-caption text-mist"
        >
          Reassemble
        </button>
      )}

      {/*
        The mobile scroll trap: a full-width WebGL canvas that captures a
        single-finger drag means the page cannot be scrolled past it. Controls
        stay off on touch until the visitor opts in, and they get a way out.
      */}
      {touch && !exploring && (
        <button
          type="button"
          onClick={() => setExploring(true)}
          className="absolute inset-0 flex items-end justify-center pb-[10px]"
          aria-label="Explore the knowledge graph"
        >
          <span className="rounded-full border border-ash/30 px-[16px] py-[8px] t-caption text-mist">
            Tap to explore
          </span>
        </button>
      )}

      {touch && exploring && (
        <button
          type="button"
          onClick={() => setExploring(false)}
          className="absolute bottom-[10px] left-1/2 -translate-x-1/2 rounded-full border border-ash/30 px-[16px] py-[8px] t-caption text-mist"
        >
          Done — let the page scroll
        </button>
      )}
    </div>
  );
}