// src/components/collapse/blueprint.ts

/**
 * The city plan, read off the poster.
 *
 * The locked rule for the city is that the page IS the plan: every building
 * stands on the block it came from, at that block's footprint, in that block's
 * order. The poster is already a replica of the page laid out at the real
 * viewport width, so the plan is not designed anywhere — it is measured, in the
 * same frame and against the same origin as the texture (posterTexture.ts),
 * which is what guarantees each building lands exactly on its own card printed
 * on the fallen sheet.
 *
 * DOM-only and tiny, so it ships with Home beside the texture measurer. The
 * world receives plain numbers and never touches the DOM.
 *
 * ── How the cards are found ──
 *
 * StackCards is a shared component and the poster renders it unmodified, so it
 * cannot be given data attributes for this. The poster's Work section carries a
 * `poster-work` class instead, and inside it StackCards renders one wrapper div
 * per project, in project order. That structure is StackCards' own; if it ever
 * changes, this returns fewer blocks and logs, and the city simply has fewer
 * buildings rather than buildings in the wrong places.
 */

export type BlueprintBlock = {
  /** Footprint in poster px, relative to the poster's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The card's heading — the building's signage. */
  name: string;
  /** The card's context line ("Company, 2025"), signed beneath the name. */
  caption: string;
  /**
   * The card's fill if it is one of the solid accent cards, null for the glass
   * ones. Buildings keep the card's colour language, so the accent cards stay
   * the landmarks in the row that they are on the page.
   */
  fill: string | null;
  /** Font longhands of the heading, so the signage is set in the page's face. */
  fontFamily: string;
};

/**
 * The name printed at the top of the page, and where it is printed.
 *
 * The rect is the <h1> ITSELF — the two lines on the left of the hero — not the
 * hero section around it, and the type is the heading's own. The monument is
 * this heading extruded: same place on the page, same size, same face. So the
 * metrics travel with it, because rebuilding the text from anything less would
 * be a different heading in roughly the same spot.
 */
export type BlueprintName = {
  /** One entry per line as the hero breaks it: ["Ishant", "Shrivastava"]. */
  lines: string[];
  /* The heading's type, exactly as the page sets it — the monument is this text, not a version of it. */
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  /** px, in poster space. */
  fontSize: number;
  lineHeight: number;
  letterSpacing: string;
  /** The hero section's footprint in poster px, relative to the poster's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
};

/** A rect on the sheet, in poster px. */
export type BlueprintRect = { x: number; y: number; w: number; h: number };

/** One contact target: a building with something behind it. */
export type BlueprintContact = BlueprintRect & {
  label: string;
  /** `link` opens in a new tab; `copy` puts `value` on the clipboard. */
  kind: 'link' | 'copy';
  value: string;
};

export type Blueprint = {
  projects: BlueprintBlock[];
  name: BlueprintName;
  /** The Stack section's rect, and every skill printed in it — one walker each. */
  stack: (BlueprintRect & { skills: string[] }) | null;
  /** The contact links, in the order the page lists them. */
  contacts: BlueprintContact[];
  /**
   * The flat knowledge graph's rect on the sheet, in poster px, or null if the
   * hero has none. The point cloud hangs over exactly this patch of ground.
   */
  graph: { x: number; y: number; w: number; h: number } | null;
};

export function measureBlueprint(poster: HTMLElement): Blueprint {
  const origin = poster.getBoundingClientRect();
  const work = poster.querySelector<HTMLElement>('.poster-work');
  const projects: BlueprintBlock[] = [];

  /*
   * StackCards' root is the Work section's last child element — the heading
   * before it is wrapped in a Reveal. Its direct children are the per-project
   * wrappers.
   */
  const name = readName(poster);
  const stack = readStack(poster, origin);
  const contacts = readContacts(poster, origin);
  const graphEl = poster.querySelector<HTMLElement>('.poster-graph');
  const graphRect = graphEl?.getBoundingClientRect();
  const graph = graphRect
    ? {
        x: graphRect.left - origin.left,
        y: graphRect.top - origin.top,
        w: graphRect.width,
        h: graphRect.height,
      }
    : null;

  const list = work?.lastElementChild;
  if (!list) {
    console.warn('[collapse] blueprint: Work section not found — no project buildings.');
    return { projects, name, graph, stack, contacts };
  }

  for (const wrapper of Array.from(list.children)) {
    const card = wrapper.firstElementChild as HTMLElement | null;
    const heading = wrapper.querySelector('h3');
    if (!card || !heading) continue;

    const rect = card.getBoundingClientRect();
    const article = wrapper.querySelector('article');
    const fill = article ? getComputedStyle(article).backgroundColor : '';
    const caption = heading.nextElementSibling?.textContent ?? '';

    projects.push({
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
      name: (heading.textContent ?? '').trim(),
      caption: caption.trim(),
      fill: isTransparent(fill) ? null : fill,
      fontFamily: getComputedStyle(heading).fontFamily,
    });
  }

  return { projects, name, graph, stack, contacts };
}

/**
 * The Stack section and the skills printed in it.
 *
 * Each marquee item carries its own name in `title` — the logo rows are SVG
 * paths with the name only in that attribute and an sr-only span, so `title` is
 * the one place to read it from without depending on markup that exists for
 * screen readers. The rows are rendered twice (a marquee duplicates its group to
 * loop), so the list is de-duplicated: one walker per skill, not two.
 */
function readStack(poster: HTMLElement, origin: DOMRect) {
  const section = poster.querySelector<HTMLElement>('.poster-stack');
  if (!section) return null;
  const rect = section.getBoundingClientRect();
  const skills: string[] = [];
  const seen = new Set<string>();
  for (const el of section.querySelectorAll<HTMLElement>('[title]')) {
    const name = (el.title ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    skills.push(name);
  }
  return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height, skills };
}

/**
 * The contact links, as the plots their buildings stand on.
 *
 * An `href` that is a real URL becomes a gate you open in a new tab; a `mailto:`
 * or `tel:` becomes a building with no entrance that copies its value instead.
 * That split is the plan's, and it falls out of the markup rather than being
 * configured anywhere: the page already knows which of its links go somewhere.
 */
function readContacts(poster: HTMLElement, origin: DOMRect): BlueprintContact[] {
  const section = poster.querySelector<HTMLElement>('#contact');
  if (!section) return [];
  const out: BlueprintContact[] = [];
  for (const a of section.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const rect = a.getBoundingClientRect();
    if (rect.width === 0) continue;
    const href = a.getAttribute('href') ?? '';
    const copy = /^(mailto:|tel:)/i.test(href);
    out.push({
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
      label: (a.textContent ?? '').trim() || 'Contact',
      kind: copy ? 'copy' : 'link',
      value: copy ? href.replace(/^(mailto:|tel:)/i, '') : href,
    });
  }
  return out;
}

/**
 * The hero heading, line by line.
 *
 * `textContent` would give "IshantShrivastava" — the hero breaks the name with a
 * <br>, and text nodes either side of it carry no space. Reading the text nodes
 * themselves keeps the line break the page already made, which is the break the
 * monument is built in.
 */
function readName(poster: HTMLElement): BlueprintName {
  const origin = poster.getBoundingClientRect();
  const h1 = poster.querySelector('h1');
  const rect = h1 ? h1.getBoundingClientRect() : origin;
  const cs = h1 ? getComputedStyle(h1) : null;
  const lines = h1
    ? Array.from(h1.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean)
    : [];
  return {
    lines,
    fontFamily: cs?.fontFamily ?? 'sans-serif',
    fontWeight: cs?.fontWeight ?? '400',
    fontStyle: cs?.fontStyle ?? 'normal',
    fontSize: cs ? parseFloat(cs.fontSize) : 16,
    /* `normal` computes to a number in Chrome; the fallback keeps the arithmetic safe if it ever doesn't. */
    lineHeight: cs && parseFloat(cs.lineHeight) ? parseFloat(cs.lineHeight) : cs ? parseFloat(cs.fontSize) * 1.1 : 18,
    letterSpacing: cs?.letterSpacing ?? 'normal',
    x: rect.left - origin.left,
    y: rect.top - origin.top,
    w: rect.width,
    h: rect.height,
  };
}

function isTransparent(c: string): boolean {
  if (!c || c === 'transparent') return true;
  return /rgba\([^)]*,\s*0\s*\)$/.test(c) || /\/\s*0\s*\)$/.test(c);
}