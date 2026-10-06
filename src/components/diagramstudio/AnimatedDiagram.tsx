// frontend/src/components/diagramstudio/AnimatedDiagram.tsx
import { useLayoutEffect, useMemo, useRef } from 'react';

/**
 * Renders a real DiagramStudio SVG export and builds it up the way the
 * generator thinks about it: groups first, then nodes, then edges drawing
 * themselves from source to target, with their labels arriving once the line
 * has. Sequence diagrams get their own order: participants, lifelines
 * dropping down, activation bars, then each message in turn.
 *
 * The export is used as-is — nothing is redrawn. On the way in it is cleaned:
 *   · the baked-in white artboard, grid pattern and watermark are removed (the
 *     panel draws its own dotted canvas behind it);
 *   · every id is prefixed per instance, because all exports share ids like
 *     "dropshadow" and "arr-…-fwd" and would otherwise clash;
 *   · it is made non-interactive (the export carries editor cursors/handles).
 *
 * Edges are revealed through a per-edge mask whose stroke is dash-animated
 * (pathLength=1), so dashed edges keep their dashes and arrowheads appear
 * only when the line reaches them. Node motion is applied to an inner wrapper
 * <g>, because the node groups position themselves with an SVG transform
 * attribute that a CSS transform would overwrite.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_DRAW = 'cubic-bezier(0.4, 0, 0.2, 1)';

let instance = 0;

function prepare(svg: string, uid: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') return '';

  for (const sel of ['rect.bg-base', 'rect.bg-pattern', 'rect.bg-rect', '[data-watermark]', 'g.ghost', 'g.ports']) {
    root.querySelectorAll(sel).forEach((e) => e.remove());
  }
  // The opaque white artboard is the first direct-child rect.
  Array.from(root.children).forEach((c) => {
    if (c.nodeName === 'rect' && /^#fff(fff)?$/i.test(c.getAttribute('fill') ?? '')) c.remove();
  });

  root.removeAttribute('style');
  root.setAttribute('width', '100%');
  root.setAttribute('height', '100%');
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.setAttribute('aria-hidden', 'true');

  const ids = new Set<string>();
  root.querySelectorAll('[id]').forEach((e) => {
    ids.add(e.id);
    e.id = uid + e.id;
  });

  let out = new XMLSerializer().serializeToString(root);
  out = out.replace(/url\(#([^)]+)\)/g, (m, id) => (ids.has(id) ? `url(#${uid}${id})` : m));
  out = out.replace(/href="#([^"]+)"/g, (m, id) => (ids.has(id) ? `href="#${uid}${id}"` : m));
  return out;
}

/**
 * Exports carry the generous artboard they were drawn on; crop the viewBox to
 * what is actually drawn so the diagram fills the canvas.
 */
function fitToContent(root: SVGSVGElement) {
  const parts = ['g.groups', 'g.nodes', 'g.edges', 'g.seq-labels']
    .map((s) => root.querySelector(s) as SVGGraphicsElement | null)
    .filter((g): g is SVGGraphicsElement => !!g);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of parts) {
    const b = g.getBBox();
    if (!b.width && !b.height) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  if (!isFinite(x0)) return;
  const pad = Math.max(16, (x1 - x0) * 0.02);
  root.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`);
}

/** Moves an element's children into a fresh inner <g> and returns it. */
function wrap(el: Element): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  while (el.firstChild) g.appendChild(el.firstChild);
  el.appendChild(g);
  return g;
}

type Anim = Animation;

export function AnimatedDiagram({
  svg,
  play,
  label,
}: {
  svg: string;
  /** False: everything held at its hidden start. True: the build runs once. */
  play: boolean;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const animsRef = useRef<Anim[]>([]);
  const uid = useMemo(() => `ds${++instance}-`, []);
  const markup = useMemo(() => prepare(svg, uid), [svg, uid]);

  // Build the (paused) timeline once the markup is in the DOM.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The markup is written here rather than through dangerouslySetInnerHTML:
    // React 19 re-sets innerHTML whenever that prop's object changes, which
    // would wipe the wrappers and masks built below on any parent re-render.
    host.innerHTML = markup;
    const root = host.querySelector('svg');
    if (!root) return;
    fitToContent(root);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const anims: Anim[] = [];
    const add = (el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions) => {
      const a = (el as SVGElement).animate(keyframes, { fill: 'both', ...opts });
      a.pause();
      a.currentTime = 0;
      anims.push(a);
    };
    const fadeIn = (el: Element, delay: number, duration = 260) =>
      add(el, [{ opacity: 0 }, { opacity: 1 }], { delay, duration, easing: 'ease-out' });

    let defs = root.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      root.prepend(defs);
    }
    let maskN = 0;
    /*
     * The edge-draw masks need a region that covers the diagram. This used to
     * be a fixed 100,000 x 100,000 square, and once the draw animations had
     * played, Chrome composited layers of that size and kept them — enough to
     * exhaust its tile memory, so sections further down (the doors) painted
     * blank or flickered. The viewBox (set by fitToContent above) bounds
     * everything that can ever be on screen, so the mask covers that plus a
     * full diagram's width and height of margin on every side.
     */
    const vbox = root.viewBox.baseVal;
    const maskRegion =
      vbox && vbox.width > 0 && vbox.height > 0
        ? {
            x: vbox.x - vbox.width,
            y: vbox.y - vbox.height,
            w: vbox.width * 3,
            h: vbox.height * 3,
          }
        : { x: -50000, y: -50000, w: 100000, h: 100000 };

    /** Wrap an edge's visible strokes in a mask that draws itself; returns end time. */
    const drawEdge = (strokes: Element[], delay: number, duration: number) => {
      const container = strokes[0]?.parentNode;
      if (!container) return delay;
      const mask = document.createElementNS(SVG_NS, 'mask');
      const id = `${uid}m${maskN++}`;
      mask.setAttribute('id', id);
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('x', String(maskRegion.x));
      mask.setAttribute('y', String(maskRegion.y));
      mask.setAttribute('width', String(maskRegion.w));
      mask.setAttribute('height', String(maskRegion.h));
      const holder = document.createElementNS(SVG_NS, 'g');
      holder.setAttribute('class', 'ds-holder');
      container.insertBefore(holder, strokes[0]);
      for (const s of strokes) {
        const d =
          s.nodeName === 'line'
            ? `M${s.getAttribute('x1')},${s.getAttribute('y1')} L${s.getAttribute('x2')},${s.getAttribute('y2')}`
            : s.getAttribute('d');
        if (!d) continue;
        const mp = document.createElementNS(SVG_NS, 'path');
        mp.setAttribute('d', d);
        mp.setAttribute('fill', 'none');
        mp.setAttribute('stroke', '#fff');
        mp.setAttribute('stroke-width', '26');
        mp.setAttribute('stroke-linecap', 'round');
        mp.setAttribute('stroke-linejoin', 'round');
        mp.setAttribute('pathLength', '1');
        mp.style.strokeDasharray = '1 1';
        mask.appendChild(mp);
        add(mp, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { delay, duration, easing: EASE_DRAW });
        holder.appendChild(s);
      }
      defs!.appendChild(mask);
      holder.setAttribute('mask', `url(#${id})`);
      return delay + duration;
    };

    const popIn = (node: Element, delay: number, origin = 'center') => {
      const w = wrap(node);
      w.style.transformBox = 'fill-box';
      w.style.transformOrigin = origin;
      add(
        w,
        [
          { opacity: 0, transform: 'scale(0.72)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { delay, duration: 420, easing: EASE_POP },
      );
    };

    const box = (el: Element) => el.getBoundingClientRect();
    const isSequence = !!root.querySelector('.seq-node');
    let t = 0;

    if (isSequence) {
      const all = Array.from(root.querySelectorAll('g.nodes > g'));
      const kind = (n: Element) => n.getAttribute('data-seq-kind');
      const isFooter = (n: Element) => (n.getAttribute('data-id') ?? '').endsWith('__footer');
      const heads = all.filter((n) => kind(n) !== 'activation' && !isFooter(n)).sort((a, b) => box(a).left - box(b).left);
      const feet = all.filter(isFooter).sort((a, b) => box(a).left - box(b).left);
      const acts = all.filter((n) => kind(n) === 'activation');

      heads.forEach((n, i) => popIn(n, i * 110));
      t = heads.length * 110 + 260;

      const lifelines = Array.from(root.querySelectorAll('g.edges > line'));
      lifelines.forEach((l) => drawEdge([l], t, 700));
      acts.forEach((a, i) => {
        const w = wrap(a);
        w.style.transformBox = 'fill-box';
        w.style.transformOrigin = 'center top';
        add(
          w,
          [
            { opacity: 0, transform: 'scaleY(0)' },
            { opacity: 1, transform: 'scaleY(1)' },
          ],
          { delay: t + 300 + i * 60, duration: 620, easing: EASE_OUT },
        );
      });
      t += 760;

      const labelsById = new Map<string, Element>();
      root.querySelectorAll('g.seq-labels > g').forEach((g) => labelsById.set(g.getAttribute('data-id') ?? '', g));
      const msgs = Array.from(root.querySelectorAll('g.edges > g:not(.ds-holder)'));
      msgs.forEach((g, i) => {
        const start = t + i * 240;
        const strokes = Array.from(g.querySelectorAll('path')).filter((p) => p.getAttribute('stroke') !== 'transparent');
        const end = drawEdge(strokes, start, 420);
        const lbl = labelsById.get(g.getAttribute('data-id') ?? '');
        if (lbl) fadeIn(lbl, end - 120, 260);
      });
      t += msgs.length * 240 + 420;
      feet.forEach((n, i) => fadeIn(n, t + i * 80, 380));
    } else {
      // Groups (layers, lanes, regions, the HLA frame).
      const groups = Array.from(root.querySelectorAll('g.groups > g'));
      const lanes = !!root.querySelector('[clip-path*="clip-swim"]');
      groups.forEach((g, i) => {
        const w = wrap(g);
        add(
          w,
          [
            { opacity: 0, transform: lanes ? 'translateX(-14px)' : 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
          { delay: i * 140, duration: 560, easing: EASE_OUT },
        );
      });
      t = groups.length ? groups.length * 140 + 300 : 0;

      // Nodes, in reading order for the layout's direction.
      const vb = root.viewBox.baseVal;
      const tall = vb && vb.height > vb.width;
      const nodes = Array.from(root.querySelectorAll('g.nodes > g')).sort((a, b) => {
        const A = box(a);
        const B = box(b);
        return tall ? A.top - B.top || A.left - B.left : A.left - B.left || A.top - B.top;
      });
      nodes.forEach((n, i) => popIn(n, t + i * 90));
      t += nodes.length * 90 + 320;

      // Edges, drawing from source to target; labels once the line arrives.
      const edges = Array.from(root.querySelectorAll('g.edges > g'));
      edges.forEach((g, i) => {
        const start = t + i * 170;
        const strokes = Array.from(g.children).filter(
          (c) =>
            (c.nodeName === 'path' || c.nodeName === 'line' || c.nodeName === 'polyline') &&
            c.getAttribute('stroke') !== 'transparent' &&
            !c.classList.contains('edge-hit-target'),
        );
        const end = drawEdge(strokes, start, 540);
        g.querySelectorAll('.edge-label-bg, .edge-label, .edge-badge').forEach((l) => fadeIn(l, end - 80, 240));
      });
    }

    animsRef.current = anims;
    return () => {
      anims.forEach((a) => a.cancel());
      animsRef.current = [];
    };
  }, [markup, uid]);

  useLayoutEffect(() => {
    for (const a of animsRef.current) {
      if (play) a.play();
      else {
        a.pause();
        a.currentTime = 0;
      }
    }
  }, [play, markup]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className="ds-diagram"
    />
  );
}
