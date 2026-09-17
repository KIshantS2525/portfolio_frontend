// src/components/collapse/posterTexture.ts

/**
 * The poster, redrawn onto a canvas so WebGL can have it as a texture.
 *
 * ── Why not html-to-image ──
 *
 * Libraries like that serialise the DOM into an SVG <foreignObject>, and the
 * three things that make them unreliable are exactly the three things this
 * site has: custom fonts (which must be re-embedded as data URLs or they fall
 * back mid-render), backdrop-filters (unsupported), and canvas tainting rules
 * that differ between engines. It would also be this feature's first new
 * dependency.
 *
 * Instead this asks the browser where everything already IS and paints the
 * same thing:
 *
 *   measurePoster()  reads layout: every box's rect, fill, border and radius;
 *                    every word's rect and font; every SVG shape; every image.
 *                    Synchronous, because the rects are only true before the
 *                    sheet starts to move.
 *   paintPoster()    replays that list onto a 2D canvas. No layout reads, so it
 *                    runs in the background during the recede.
 *
 * Canvas `fillText` uses the document's loaded FontFaces directly, so the fonts
 * are the real fonts with no embedding step.
 *
 * ── What it reproduces, now that the poster is the real page ──
 *
 * The first poster was built to be paintable: text, boxes, borders. The replica
 * brings in the rest of what the homepage actually uses, and each needed a
 * specific answer:
 *
 *   · CLIPPING. Cards are rounded with `overflow: hidden`, and the accent cards
 *     fill a square <article> inside them. Without clipping, every accent card
 *     would have square corners poking out of its rounded border.
 *   · MASKS. The marquee rows fade out at both ends with a horizontal
 *     `mask-image` gradient. Without it the rows end in a hard cut.
 *   · OPACITY. Accumulated down the tree, so anything hidden by an ancestor's
 *     opacity stays hidden in the texture.
 *   · SVG. The marquee logos and the flat knowledge graph are SVG — paths and
 *     circles, replayed through Path2D in the SVG's own viewBox.
 *   · IMAGES. The DiagramStudio screenshot, re-decoded and drawn at its rect.
 *
 * What it deliberately does NOT reproduce: box-shadows, backdrop blur, and the
 * glass cards' ::before sheen. On a near-black page all three are a few percent
 * of brightness, the texture only replaces the sheet once it is lying far away
 * at a grazing angle under a dust cloud, and each would cost more machinery
 * than everything above combined.
 */

/**
 * Transparent margin around the poster in the texture, in poster px.
 *
 * The sheet's lit edge is a box-shadow drawn OUTSIDE its border box — the only
 * thing that makes a black sheet visible against a black sky (bug #4 in the
 * handover). A texture cropped to the border box would lose it, so the quad is
 * this much larger on every side and the edge is painted into the gap.
 * collapseWorld.ts sizes the quad from the same constant.
 */
export const POSTER_TEXTURE_PAD = 4;

/**
 * Largest texture edge requested, in device px.
 *
 * The real homepage is far taller than the old summary poster, so this binds:
 * the texture is downscaled to fit. 8192 is what every desktop GPU this feature
 * can run on accepts, and the world checks the real limit and downsamples
 * further if a machine reports less.
 */
const MAX_TEXTURE_EDGE = 8192;

/** A clipping (and optionally masking) region inherited by everything inside it. */
type Group = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** Horizontal mask: alpha stops at fractions of the width. Null for a plain clip. */
  mask: { at: number; alpha: number }[] | null;
  /** The group this one sits inside. Nested clips intersect. */
  parent: number;
};

type Base = { group: number; alpha: number };

type BoxOp = Base & {
  kind: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  fill: string | null;
  stroke: string | null;
  strokeW: number;
};

type TextOp = Base & {
  kind: 'text';
  x: number;
  /** Top of the word's content box, not its baseline — see paint. */
  y: number;
  h: number;
  text: string;
  font: string;
  color: string;
  letterSpacing: string;
};

type SvgShape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number };

type SvgOp = Base & {
  kind: 'svg';
  /** The viewBox-to-poster transform, already resolved: poster = offset + user * scale. */
  ox: number;
  oy: number;
  scale: number;
  shapes: {
    shape: SvgShape;
    fill: string | null;
    fillAlpha: number;
    stroke: string | null;
    strokeAlpha: number;
    strokeW: number;
  }[];
};

type ImageOp = Base & { kind: 'image'; src: string; x: number; y: number; w: number; h: number };

type Op = BoxOp | TextOp | SvgOp | ImageOp;

export type PosterDisplayList = {
  width: number;
  height: number;
  /** The poster's own background, read from its computed style. */
  surface: string;
  groups: Group[];
  ops: Op[];
};

/**
 * Reads the poster's layout into a display list.
 *
 * MUST run before the sheet rotates or scales: every rect read here is
 * post-transform. The conductor calls it with the stage at `near`, which is a
 * horizontal translate and scale(1) — every rect shifts by the same amount and
 * is measured relative to the poster, so that transform cancels out exactly.
 */
export function measurePoster(poster: HTMLElement): PosterDisplayList {
  const origin = poster.getBoundingClientRect();
  const ops: Op[] = [];
  const groups: Group[] = [];

  /*
   * Per-element caches. Every word in a paragraph shares a parent, and the
   * group and opacity of an element are a walk up the tree — done once per
   * element, not once per word.
   */
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const styleOf = (el: Element) => {
    let cs = styleCache.get(el);
    if (!cs) {
      cs = getComputedStyle(el);
      styleCache.set(el, cs);
    }
    return cs;
  };

  const groupCache = new Map<Element, number>([[poster, -1]]);
  const alphaCache = new Map<Element, number>([[poster, 1]]);

  /** The clip group an element's CONTENT belongs to: its own if it clips, else its parent's. */
  function contentGroupOf(el: Element): number {
    const cached = groupCache.get(el);
    if (cached !== undefined) return cached;
    const parentGroup = el.parentElement ? contentGroupOf(el.parentElement) : -1;
    const cs = styleOf(el);
    const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
    const mask = parseHorizontalMask(cs.maskImage || cs.getPropertyValue('-webkit-mask-image'));
    let g = parentGroup;
    if (clips || mask) {
      const rect = el.getBoundingClientRect();
      groups.push({
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
        r: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2),
        mask,
        parent: parentGroup,
      });
      g = groups.length - 1;
    }
    groupCache.set(el, g);
    return g;
  }

  function alphaOf(el: Element): number {
    const cached = alphaCache.get(el);
    if (cached !== undefined) return cached;
    const a = (el.parentElement ? alphaOf(el.parentElement) : 1) * (parseFloat(styleOf(el).opacity) || 0);
    alphaCache.set(el, a);
    return a;
  }

  const walker = document.createTreeWalker(poster, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
      const cs = styleOf(node as Element);
      /* Rejecting skips the whole subtree — nothing inside a hidden element paints. */
      if (cs.display === 'none' || cs.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const range = document.createRange();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const alpha = alphaOf(el);
      if (alpha <= 0.001) continue;
      const cs = styleOf(el);
      /* A box's own background is clipped by its PARENT'S clip, not its own. */
      const group = el.parentElement ? contentGroupOf(el.parentElement) : -1;
      contentGroupOf(el);

      if (el instanceof SVGSVGElement) {
        const op = measureSvg(el, origin, styleOf, group, alpha);
        if (op) ops.push(op);
        /*
         * Children are handled by measureSvg. Skipping them here is a manual
         * skip rather than a FILTER_REJECT because the walker has already
         * accepted this node.
         */
        skipSubtree(walker, el);
        continue;
      }

      if (el instanceof HTMLImageElement) {
        const rect = el.getBoundingClientRect();
        const src = el.currentSrc || el.src;
        if (src && rect.width > 0 && rect.height > 0) {
          ops.push({
            kind: 'image',
            src,
            x: rect.left - origin.left,
            y: rect.top - origin.top,
            w: rect.width,
            h: rect.height,
            group,
            alpha,
          });
        }
        continue;
      }

      const fill = visibleColor(cs.backgroundColor);
      const borderW = parseFloat(cs.borderTopWidth) || 0;
      const stroke = borderW > 0 && cs.borderTopStyle !== 'none' ? visibleColor(cs.borderTopColor) : null;
      if (!fill && !stroke) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      ops.push({
        kind: 'box',
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
        /* `9999px` pills clamp to a half-height radius, as the browser does. */
        r: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, rect.height / 2, rect.width / 2),
        fill,
        stroke,
        strokeW: borderW,
        group,
        alpha,
      });
      continue;
    }

    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || !text.data.trim()) continue;
    const alpha = alphaOf(parent);
    if (alpha <= 0.001) continue;
    const cs = styleOf(parent);
    const color = visibleColor(cs.color);
    if (!color) continue;

    /*
     * Screen-reader-only text. Tailwind's `sr-only` keeps it in layout as a 1px
     * clipped box, and without this check its words would be painted at full
     * size wherever that box sits — the marquee's hidden item names scattered
     * across the logo rows.
     */
    const parentRect = parent.getBoundingClientRect();
    if (parentRect.width <= 1 || parentRect.height <= 1) continue;

    /*
     * Built from longhands. The computed `font` shorthand is an empty string in
     * Firefox, and an empty font assignment on a canvas silently leaves it at
     * 10px sans-serif.
     */
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const upper = cs.textTransform === 'uppercase';
    const group = contentGroupOf(parent);

    /*
     * Word by word, because the browser has already solved line breaking. A
     * second line-breaker here would disagree with it in small ways — a word
     * wrapping one line earlier in the texture than on the sheet it replaces.
     */
    for (const m of text.data.matchAll(/\S+/g)) {
      const start = m.index ?? 0;
      range.setStart(text, start);
      range.setEnd(text, start + m[0].length);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) continue;
      ops.push({
        kind: 'text',
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        h: rect.height,
        text: upper ? m[0].toUpperCase() : m[0],
        font,
        color,
        letterSpacing: cs.letterSpacing,
        group,
        alpha,
      });
    }
  }

  range.detach();

  return {
    width: origin.width,
    height: origin.height,
    surface: visibleColor(styleOf(poster).backgroundColor) ?? '#000',
    groups,
    ops,
  };
}

/** Advances the walker past every descendant of `el`. */
function skipSubtree(walker: TreeWalker, el: Element) {
  let last: Node = el;
  while (last.lastChild) last = last.lastChild;
  walker.currentNode = last;
}

/**
 * An SVG's paths and circles, in poster coordinates.
 *
 * The viewBox transform is resolved here for the default
 * `preserveAspectRatio` (xMidYMid meet) — the only one this site uses — so the
 * painter needs just an offset and a uniform scale.
 */
function measureSvg(
  svg: SVGSVGElement,
  origin: DOMRect,
  styleOf: (el: Element) => CSSStyleDeclaration,
  group: number,
  alpha: number,
): SvgOp | null {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  if (!rect.width || !rect.height) return null;
  const vbw = vb && vb.width ? vb.width : rect.width;
  const vbh = vb && vb.height ? vb.height : rect.height;
  const scale = Math.min(rect.width / vbw, rect.height / vbh);
  const ox = rect.left - origin.left + (rect.width - vbw * scale) / 2 - (vb?.x ?? 0) * scale;
  const oy = rect.top - origin.top + (rect.height - vbh * scale) / 2 - (vb?.y ?? 0) * scale;

  const shapes: SvgOp['shapes'] = [];
  for (const el of svg.querySelectorAll('path, circle')) {
    const cs = styleOf(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let shape: SvgShape;
    if (el.tagName === 'circle') {
      shape = {
        kind: 'circle',
        cx: Number(el.getAttribute('cx')) || 0,
        cy: Number(el.getAttribute('cy')) || 0,
        r: Number(el.getAttribute('r')) || 0,
      };
    } else {
      const d = el.getAttribute('d');
      if (!d) continue;
      shape = { kind: 'path', d };
    }
    const opacity = parseFloat(cs.opacity) || 0;
    shapes.push({
      shape,
      fill: visibleColor(cs.fill),
      fillAlpha: (parseFloat(cs.fillOpacity) || 0) * opacity,
      stroke: visibleColor(cs.stroke),
      strokeAlpha: (parseFloat(cs.strokeOpacity) || 0) * opacity,
      strokeW: parseFloat(cs.strokeWidth) || 1,
    });
  }
  return shapes.length ? { kind: 'svg', ox, oy, scale, shapes, group, alpha } : null;
}

/**
 * Replays a display list onto a canvas.
 *
 * Async to wait for fonts and images. Painting with a font still arriving
 * bakes the fallback face into the texture permanently — a bug that would only
 * ever show up on a slow connection in front of someone else.
 */
export async function paintPoster(list: PosterDisplayList): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const images = await loadImages(list.ops);

  const pad = POSTER_TEXTURE_PAD;
  const fullW = list.width + pad * 2;
  const fullH = list.height + pad * 2;
  const scale = Math.min(1, MAX_TEXTURE_EDGE / fullW, MAX_TEXTURE_EDGE / fullH);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(fullW * scale);
  canvas.height = Math.round(fullH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  const base = new DOMMatrix().translate(pad * scale, pad * scale).scale(scale);
  ctx.setTransform(base);

  paintSurface(ctx, list.width, list.height, list.surface);

  /*
   * Everything is clipped to the poster itself, as `overflow: hidden` does on
   * the sheet. The marquee tracks are wider than the page, and without this
   * their overflow would paint into the lit-edge padding.
   */
  ctx.save();
  roundRect(ctx, 0, 0, list.width, list.height, 3);
  ctx.clip();

  /*
   * Ops inside a MASKED group are painted onto a separate layer, which then has
   * its mask applied and is composited back as one piece. Masks cannot be done
   * per op: a gradient alpha applied to each word separately would be right,
   * but applied to overlapping ops it compounds. Ops are in document order, so
   * each masked group's ops arrive as one contiguous run.
   */
  type Layer = { group: number; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; dx: number; dy: number };
  let layer: Layer | null = null;

  const flushLayer = () => {
    if (!layer) return;
    applyMask(layer.ctx, list.groups[layer.group]);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, layer.dx, layer.dy);
    ctx.restore();
    layer = null;
  };

  for (const op of list.ops) {
    const maskGroup = nearestMaskGroup(list.groups, op.group);

    if (layer && layer.group !== maskGroup) flushLayer();
    if (maskGroup >= 0 && !layer) {
      /*
       * The layer is only as big as the masked element, not the whole texture.
       * Nine marquee rows each allocating a full 8K-tall canvas would be most of
       * a gigabyte of scratch memory for strips 60px tall.
       */
      const g = list.groups[maskGroup];
      const dx = Math.floor((g.x + pad) * scale);
      const dy = Math.floor((g.y + pad) * scale);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(g.w * scale) + 2);
      c.height = Math.max(1, Math.ceil(g.h * scale) + 2);
      const lctx = c.getContext('2d');
      if (lctx) {
        lctx.setTransform(new DOMMatrix().translate(pad * scale - dx, pad * scale - dy).scale(scale));
        layer = { group: maskGroup, canvas: c, ctx: lctx, dx, dy };
      }
    }

    const target = layer ? layer.ctx : ctx;
    target.save();
    applyClips(target, list.groups, op.group);
    target.globalAlpha = op.alpha;
    paintOp(target, op, images);
    target.restore();
  }
  flushLayer();

  ctx.restore();
  return canvas;
}

function paintOp(ctx: CanvasRenderingContext2D, op: Op, images: Map<string, HTMLImageElement>) {
  switch (op.kind) {
    case 'box': {
      if (op.fill && setFill(ctx, op.fill)) {
        roundRect(ctx, op.x, op.y, op.w, op.h, op.r);
        ctx.fill();
      }
      if (op.stroke && setStroke(ctx, op.stroke)) {
        /*
         * Inset by half the stroke. CSS borders live inside the border box and a
         * canvas stroke is centred on the path, so stroking the rect as measured
         * puts half of every hairline outside the card.
         */
        const i = op.strokeW / 2;
        roundRect(ctx, op.x + i, op.y + i, op.w - op.strokeW, op.h - op.strokeW, Math.max(0, op.r - i));
        ctx.lineWidth = op.strokeW;
        ctx.stroke();
      }
      return;
    }

    case 'text': {
      ctx.font = op.font;
      if (!setFill(ctx, op.color)) return;
      if ('letterSpacing' in ctx) ctx.letterSpacing = op.letterSpacing === 'normal' ? '0px' : op.letterSpacing;
      ctx.textBaseline = 'alphabetic';
      /*
       * A Range's rect is the font's content area — ascent plus descent —
       * centred in the line box. Placing the baseline `ascent` below the top of
       * that area is exact for the font actually in use.
       */
      const m = ctx.measureText(op.text);
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      ctx.fillText(op.text, op.x, op.y + (op.h - (asc + desc)) / 2 + asc);
      return;
    }

    case 'svg': {
      ctx.translate(op.ox, op.oy);
      ctx.scale(op.scale, op.scale);
      const outer = ctx.globalAlpha;
      for (const s of op.shapes) {
        const path = new Path2D();
        if (s.shape.kind === 'circle') path.arc(s.shape.cx, s.shape.cy, s.shape.r, 0, Math.PI * 2);
        else path.addPath(new Path2D(s.shape.d));
        if (s.fill && s.fillAlpha > 0 && setFill(ctx, s.fill)) {
          ctx.globalAlpha = outer * s.fillAlpha;
          ctx.fill(path);
        }
        if (s.stroke && s.strokeAlpha > 0 && setStroke(ctx, s.stroke)) {
          ctx.globalAlpha = outer * s.strokeAlpha;
          ctx.lineWidth = s.strokeW;
          ctx.stroke(path);
        }
      }
      return;
    }

    case 'image': {
      const img = images.get(op.src);
      if (img) ctx.drawImage(img, op.x, op.y, op.w, op.h);
      return;
    }
  }
}

/** Clips to every group from the outermost down to `group`. */
function applyClips(ctx: CanvasRenderingContext2D, groups: Group[], group: number) {
  const chain: Group[] = [];
  for (let g = group; g >= 0; g = groups[g].parent) chain.push(groups[g]);
  for (let i = chain.length - 1; i >= 0; i--) {
    const g = chain[i];
    roundRect(ctx, g.x, g.y, g.w, g.h, g.r);
    ctx.clip();
  }
}

function nearestMaskGroup(groups: Group[], group: number): number {
  for (let g = group; g >= 0; g = groups[g].parent) if (groups[g].mask) return g;
  return -1;
}

/** Multiplies a layer's alpha by its group's horizontal mask gradient. The layer spans exactly the group. */
function applyMask(ctx: CanvasRenderingContext2D, g: Group) {
  if (!g.mask) return;
  ctx.save();
  const grad = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
  for (const s of g.mask) grad.addColorStop(Math.min(1, Math.max(0, s.at)), `rgba(0,0,0,${s.alpha})`);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = grad;
  /* Overscanned past the group so the layer's edge pixels are covered at any scale. */
  ctx.fillRect(g.x - 16, g.y - 16, g.w + 32, g.h + 32);
  ctx.restore();
}

/**
 * A `linear-gradient(90deg, …)` mask, as alpha stops.
 *
 * Only the horizontal case, and only transparent-vs-opaque stops, because that
 * is the one mask on the page: the marquee edge fade. Anything else returns null
 * and is painted unmasked, which is the correct degradation — a visible edge
 * instead of missing content.
 */
function parseHorizontalMask(value: string): { at: number; alpha: number }[] | null {
  if (!value || value === 'none') return null;
  const m = /linear-gradient\(\s*90deg\s*,(.*)\)\s*$/.exec(value);
  if (!m) return null;
  const parts = m[1].split(/,(?![^(]*\))/).map((p) => p.trim());
  const stops = parts.map((p, i) => {
    const pos = /(-?[\d.]+)%\s*$/.exec(p);
    const color = pos ? p.slice(0, pos.index).trim() : p;
    return {
      at: pos ? Number(pos[1]) / 100 : i / Math.max(1, parts.length - 1),
      alpha: /transparent|rgba?\([^)]*,\s*0\s*\)|\/\s*0\s*\)/.test(color) ? 0 : 1,
    };
  });
  return stops.length >= 2 ? stops : null;
}

async function loadImages(ops: Op[]): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  const srcs = new Set(ops.filter((o): o is ImageOp => o.kind === 'image').map((o) => o.src));
  await Promise.all(
    Array.from(srcs).map(async (src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      try {
        await img.decode();
        out.set(src, img);
      } catch {
        /* A missing image leaves a gap in the texture. Not worth failing the handoff over. */
      }
    }),
  );
  return out;
}

/**
 * The poster's own surface and its lit edge.
 *
 * The fill is the poster's computed background, so it follows the site theme.
 * The edge values are restated from `#collapse-poster`'s box-shadow in
 * collapse.css — keep the two in step, or the swap shows a step at impact.
 */
function paintSurface(ctx: CanvasRenderingContext2D, w: number, h: number, surface: string) {
  if (!setFill(ctx, surface)) ctx.fillStyle = '#000';
  roundRect(ctx, 0, 0, w, h, 3);
  ctx.fill();

  /* `0 0 0 2px rgba(226,232,255,0.7)` — the lit edge, outside the box. */
  ctx.strokeStyle = 'rgba(226, 232, 255, 0.7)';
  ctx.lineWidth = 2;
  roundRect(ctx, -1, -1, w + 2, h + 2, 4);
  ctx.stroke();

  /* `inset 0 0 0 1px rgba(255,255,255,0.14)` — the hairline inside it. */
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 2.5);
  ctx.stroke();
}

/*
 * Colour assignment with a check.
 *
 * Canvas silently IGNORES a colour string it cannot parse and keeps whatever
 * was set before. Computed styles on this page include `color(srgb …)` from the
 * glass cards' color-mix, which older engines' canvases do not accept — and
 * "keep the previous colour" would paint a glass card in the colour of the
 * last word drawn. Setting a sentinel first makes a failed parse detectable,
 * and the op is skipped instead.
 */
const SENTINEL = '#010203';
function setFill(ctx: CanvasRenderingContext2D, c: string): boolean {
  ctx.fillStyle = SENTINEL;
  ctx.fillStyle = c;
  return ctx.fillStyle !== SENTINEL || c.replace(/\s/g, '').toLowerCase() === SENTINEL;
}
function setStroke(ctx: CanvasRenderingContext2D, c: string): boolean {
  ctx.strokeStyle = SENTINEL;
  ctx.strokeStyle = c;
  return ctx.strokeStyle !== SENTINEL || c.replace(/\s/g, '').toLowerCase() === SENTINEL;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The colour string, or null if it would paint nothing. */
function visibleColor(c: string): string | null {
  if (!c || c === 'transparent' || c === 'none') return null;
  /* rgba(r, g, b, 0) */
  const legacy = /rgba?\(([^)]+)\)/.exec(c);
  if (legacy) {
    const parts = legacy[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length === 4 && parseFloat(parts[3]) === 0) return null;
  }
  /* color(srgb r g b / 0) and friends */
  const modern = /\/\s*([\d.]+)\s*\)\s*$/.exec(c);
  if (modern && parseFloat(modern[1]) === 0) return null;
  if (c.startsWith('url(')) return null;
  return c;
}