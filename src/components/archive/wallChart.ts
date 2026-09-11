// src/components/archive/wallChart.ts
import type { Graph, GraphNode, NodeKind } from '@/lib/graph';

/**
 * The knowledge graph, as a chart on a wall.
 *
 * The homepage already draws this graph, in three dimensions, made of dust,
 * and it is the best-looking thing on the site. It is also close to unreadable
 * as a *graph*: you cannot follow an edge through a rotating point cloud, you
 * cannot tell which of two overlapping nodes a line lands on, and depth makes
 * every distance a lie. That is a fine trade there, because upstairs the graph
 * is atmosphere and the readout panel does the explaining.
 *
 * Down here it has a different job. This is the thing screwed to the wall that
 * tells you how the work fits together, so legibility wins outright — which
 * means flat, fixed, and laid out on rings rather than relaxed by a force
 * simulation. A force layout is the obvious choice and the wrong one: it is
 * non-deterministic, it drifts every mount, and it optimises for even spacing
 * rather than for the one relationship a viewer actually wants, which is "how
 * far is this from the middle".
 *
 * Rings give that for free, because `ring` is already in the graph data. The
 * person is the hub, roles orbit, projects orbit those, and the technologies
 * form the outer belt. The distance from the centre means something, and it
 * means the same thing every time the page loads.
 *
 * Everything is in canvas pixels rather than normalised units — the texture is
 * the source of truth for both painting and hit-testing, so keeping one
 * coordinate system removes a whole class of "the click is thirty pixels off"
 * bug.
 */

export const CHART_W = 1200;
export const CHART_H = 800;

export type ChartNode = {
  id: string;
  label: string;
  kind: NodeKind;
  /** Project slug, where one exists — this is what makes a node walkable. */
  ref?: string;
  x: number;
  y: number;
  r: number;
};

export type Chart = {
  nodes: ChartNode[];
  /** Index pairs rather than ids, so painting does not hash a map per edge. */
  links: [number, number][];
};

const RADIUS: Record<NodeKind, number> = {
  person: 26,
  role: 17,
  project: 14,
  achievement: 9,
  domain: 7,
  tech: 5,
};

/** Which kinds get their name written next to them. */
const LABELLED: NodeKind[] = ['person', 'role', 'project'];

export function buildChart(graph: Graph): Chart {
  const cx = CHART_W / 2;
  const cy = CHART_H / 2;

  const byRing = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    const list = byRing.get(n.ring) ?? [];
    list.push(n);
    byRing.set(n.ring, list);
  }
  const rings = [...byRing.keys()].sort((a, b) => a - b);
  const maxRing = Math.max(1, rings[rings.length - 1]);

  const nodes: ChartNode[] = [];
  const index = new Map<string, number>();

  for (const ring of rings) {
    // Sorted by id, not by insertion: the content tree's order changes every
    // time a project is added in the admin panel, and the chart should not
    // reshuffle itself because something was filed.
    const list = byRing.get(ring)!.slice().sort((a, b) => a.id.localeCompare(b.id));
    const radius = ring === 0 ? 0 : (ring / maxRing) * 330;
    list.forEach((n, i) => {
      /*
       * A half-step offset per ring, so nodes on adjacent rings never line up
       * radially. When they do, the spokes between them stack into what looks
       * like one thick line and the chart reads as a starburst instead of a
       * network — the same trap the dendrite shape fell into upstairs.
       */
      const a = (i / list.length) * Math.PI * 2 + ring * 0.37;
      index.set(n.id, nodes.length);
      nodes.push({
        id: n.id,
        label: n.label,
        kind: n.kind,
        ref: n.ref,
        // Squashed vertically: the panel is landscape, and a circular layout
        // in a landscape frame wastes the sides and crowds top and bottom.
        x: cx + Math.cos(a) * radius * 1.32,
        y: cy + Math.sin(a) * radius * 0.92,
        r: RADIUS[n.kind],
      });
    });
  }

  const links: [number, number][] = [];
  for (const l of graph.links) {
    const a = index.get(l.source);
    const b = index.get(l.target);
    if (a !== undefined && b !== undefined) links.push([a, b]);
  }

  return { nodes, links };
}

/**
 * What is under a point, in chart pixels. Returns the topmost hit, which for
 * overlapping nodes means the smaller one — a tech dot sitting on top of a
 * project circle should be the thing you picked, because it is the thing you
 * can see and aim at.
 */
export function hitChart(chart: Chart, x: number, y: number): ChartNode | null {
  let best: ChartNode | null = null;
  let bestR = Infinity;
  for (const n of chart.nodes) {
    // Generous: a 5px dot on a wall two metres away is not a click target, so
    // every node is pickable from at least 16px out.
    const reach = Math.max(n.r + 9, 16);
    const dx = x - n.x;
    const dy = y - n.y;
    if (dx * dx + dy * dy <= reach * reach && n.r < bestR) {
      best = n;
      bestR = n.r;
    }
  }
  return best;
}

const KIND_INK: Record<NodeKind, string> = {
  person: '#ffd9a0',
  role: '#e79a5a',
  project: '#7fd6a8',
  achievement: '#d2c07a',
  domain: '#9d8fd0',
  tech: '#6f8ba8',
};

/**
 * Paint the chart. Called once at build and again on every hover change —
 * roughly a hundred circles and three hundred lines, which is well under a
 * millisecond and far simpler than maintaining a second highlight layer.
 */
export function paintChart(
  canvas: HTMLCanvasElement,
  chart: Chart,
  hover: string | null,
  connected: Set<string>,
  cited: Set<string> = new Set(),
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  /*
   * Two independent emphases, and they must not be the same emphasis.
   *
   * Hover is transient and pointer-driven: it dims everything unrelated so
   * you can trace one node's neighbourhood. Citation is a statement about
   * what was just said, it persists after the pointer has moved on, and it
   * must survive a hover happening on top of it. So hover controls the
   * dimming and citation adds a ring — different channels, readable at once.
   */
  const dim = hover !== null;

  // Backlit panel: dark glass with a faint vignette, so the lines read as lit
  // from behind rather than printed on.
  ctx.fillStyle = '#0b1016';
  ctx.fillRect(0, 0, CHART_W, CHART_H);
  const glow = ctx.createRadialGradient(
    CHART_W / 2, CHART_H / 2, 40,
    CHART_W / 2, CHART_H / 2, CHART_W * 0.62,
  );
  glow.addColorStop(0, 'rgba(60,96,84,0.30)');
  glow.addColorStop(1, 'rgba(8,12,16,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CHART_W, CHART_H);

  ctx.strokeStyle = 'rgba(120,150,140,0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, CHART_W - 28, CHART_H - 28);

  // Edges first, under everything.
  ctx.lineWidth = 1.1;
  for (const [a, b] of chart.links) {
    const na = chart.nodes[a];
    const nb = chart.nodes[b];
    const on = !dim || connected.has(na.id) || connected.has(nb.id);
    ctx.strokeStyle = on ? 'rgba(150,196,178,0.46)' : 'rgba(120,150,140,0.07)';
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of chart.nodes) {
    const on = !dim || connected.has(n.id);
    const ink = KIND_INK[n.kind];
    ctx.globalAlpha = on ? 1 : 0.18;

    if (n.id === hover) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(127,214,168,0.18)';
      ctx.fill();
    }

    if (cited.has(n.id)) {
      ctx.globalAlpha = 1; // a citation is never dimmed by someone else's hover
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,217,160,0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();

    if (LABELLED.includes(n.kind) && on) {
      ctx.fillStyle = 'rgba(230,240,235,0.9)';
      ctx.font = `600 ${n.kind === 'person' ? 22 : 15}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(n.label, n.x, n.y + n.r + 15);
    }
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(180,205,195,0.55)';
  ctx.font = '600 17px ui-monospace, monospace';
  ctx.fillText('SYSTEM MAP', 34, 40);
}