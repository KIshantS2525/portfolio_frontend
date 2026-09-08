/**
 * The knowledge graph.
 *
 * Topology is derived from content.ts — never authored separately. Layout is a
 * one-shot deterministic solve (seeded PRNG, fixed tick count) run once inside
 * the lazily-loaded graph chunk, after which every node is pinned forever.
 * There is no continuous simulation and no force-graph library at runtime.
 */

import { projects as staticProjects, roles, achievements, profile, type Project } from './content';

export type NodeKind = 'person' | 'role' | 'project' | 'domain' | 'tech' | 'achievement';

export type GraphNode = {
  id: string;
  label: string;
  kind: NodeKind;
  /** Slug back into content.ts, where one exists. */
  ref?: string;
  size: number;
  ring: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type GraphLink = { source: string; target: string };

export type Graph = {
  nodes: GraphNode[];
  links: GraphLink[];
  adjacency: Map<string, Set<string>>;
};


const KIND_SIZE: Record<NodeKind, number> = {
  person: 10,
  role: 7,
  project: 6,
  domain: 4.8,
  tech: 3.2,
  achievement: 3.8,
};

/** Distance from centre, in layout units, per node kind. */
const KIND_RING: Record<NodeKind, number> = {
  person: 0,
  role: 95,
  project: 205,
  domain: 320,
  achievement: 300,
  tech: 385,
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * @param dense false drops individual tech nodes — the mobile variant, ~40 nodes.
 * @param projectList defaults to content.ts; pass a merged list to include
 *        projects added through the admin panel.
 */
export function buildGraph(dense = true, projectList: Project[] = staticProjects): Graph {
  const projects = projectList;
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, kind: NodeKind, ref?: string) => {
    if (seen.has(id)) return id;
    seen.add(id);
    nodes.push({
      id,
      label,
      kind,
      ref,
      size: KIND_SIZE[kind],
      ring: KIND_RING[kind],
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    });
    return id;
  };

  const link = (source: string, target: string) => {
    if (seen.has(source) && seen.has(target)) links.push({ source, target });
  };

  const root = add('person:root', profile.name.split(' ')[0], 'person');

  for (const role of roles) {
    const id = add(`role:${role.slug}`, role.company.replace(/ (Pvt\.|Ecommerce).*$/, ''), 'role', role.slug);
    link(root, id);
  }

  // Tech frequency decides which tech nodes earn a place on the canvas.
  const techCount = new Map<string, number>();
  for (const p of projects) for (const t of p.tech) techCount.set(t, (techCount.get(t) ?? 0) + 1);
  const techAllowed = new Set(
    dense
      ? Array.from(techCount.keys())
          .sort((a, b) => (techCount.get(b)! - techCount.get(a)!) || a.localeCompare(b))
          .slice(0, 45)
      : [],
  );

  for (const p of projects) {
    const id = add(`project:${p.slug}`, p.name, 'project', p.slug);
    const owner = roles.find((r) => r.projects.includes(p.slug));
    link(owner ? `role:${owner.slug}` : root, id);

    for (const d of p.domains) {
      const did = add(`domain:${slugify(d)}`, d, 'domain');
      link(id, did);
    }
    for (const t of p.tech) {
      if (!techAllowed.has(t)) continue;
      const tid = add(`tech:${slugify(t)}`, t, 'tech');
      link(id, tid);
    }
  }

  for (const a of achievements) {
    const id = add(`achievement:${a.slug}`, a.name, 'achievement', a.slug);
    link(a.project ? `project:${a.project}` : root, id);
  }

  const adjacency = new Map<string, Set<string>>();
  for (const n of nodes) adjacency.set(n.id, new Set());
  for (const l of links) {
    adjacency.get(l.source)?.add(l.target);
    adjacency.get(l.target)?.add(l.source);
  }

  return { nodes, links, adjacency };
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

/** mulberry32 — seeded so the constellation is identical on every visit. */
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
 * One-shot solve: repulsion + link springs + a radial constraint per node kind.
 * The radial term is what stops it becoming a hairball — it forces an orbital
 * read where distance from centre encodes distance from the person.
 */
export function solveLayout(graph: Graph, ticks = 300): Graph {
  const { nodes, links } = graph;
  const rand = rng(0x15846e);
  const index = new Map(nodes.map((n, i) => [n.id, i]));

  // Seed each ring with an even angular spread. Golden-angle seeding across the
  // whole node list let the link springs drag every project to the same side as
  // the two role nodes and the constellation came out as a crescent. Spreading
  // per ring, with the rings offset against each other, fixes the distribution
  // before the solve begins.
  const rings = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const list = rings.get(node.ring) ?? [];
    list.push(node);
    rings.set(node.ring, list);
  }

  let ringIndex = 0;
  for (const [ringRadius, members] of Array.from(rings.entries()).sort((a, b) => a[0] - b[0])) {
    const offset = ringIndex * 0.7 + 0.3;
    members.forEach((node, i) => {
      const a = (i / members.length) * Math.PI * 2 + offset + (rand() - 0.5) * 0.12;
      const r = ringRadius + (rand() - 0.5) * 26;
      node.x = Math.cos(a) * r;
      node.y = Math.sin(a) * r;
      node.vx = 0;
      node.vy = 0;
    });
    ringIndex++;
  }

  const edges = links
    .map((l) => [index.get(l.source)!, index.get(l.target)!] as const)
    .filter(([a, b]) => a !== undefined && b !== undefined);

  const n = nodes.length;

  for (let tick = 0; tick < ticks; tick++) {
    const alpha = Math.max(0.02, 1 - tick / ticks);

    // Repulsion, all pairs. n ≈ 80, so this is trivial.
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (rand() - 0.5) * 2;
          dy = (rand() - 0.5) * 2;
          d2 = 1;
        }
        const strength = (900 * (a.size + b.size)) / 14 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * strength;
        const fy = (dy / d) * strength;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Link springs.
    for (const [i, j] of edges) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const rest = Math.max(46, Math.abs(b.ring - a.ring) * 0.9 + 40);
      const f = ((d - rest) / d) * 0.032;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }

    // Radial constraint + centring.
    for (const node of nodes) {
      const d = Math.hypot(node.x, node.y) || 0.01;
      const pull = ((node.ring - d) / d) * 0.16;
      node.vx += node.x * pull;
      node.vy += node.y * pull;

      node.vx *= 0.82;
      node.vy *= 0.82;
      node.x += node.vx * alpha;
      node.y += node.vy * alpha;
    }

    // Root stays put.
    const root = nodes[0];
    root.x = 0;
    root.y = 0;
    root.vx = 0;
    root.vy = 0;
  }

  return graph;
}

/** Static decorative field — Dala's ambient particles. Seeded, drawn once. */
export function ambientField(count: number, palette: string[]) {
  const rand = rng(0x8052ff);
  return Array.from({ length: count }, () => ({
    x: (rand() - 0.5) * 1500,
    y: (rand() - 0.5) * 1100,
    r: 2 + rand() * 6,
    rot: rand() * Math.PI * 2,
    color: palette[Math.floor(rand() * palette.length)],
    alpha: 0.06 + rand() * 0.3,
    phase: rand() * Math.PI * 2,
  }));
}
