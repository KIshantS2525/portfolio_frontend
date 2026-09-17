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

export type Blueprint = {
  projects: BlueprintBlock[];
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
  const list = work?.lastElementChild;
  if (!list) {
    console.warn('[collapse] blueprint: Work section not found — no project buildings.');
    return { projects };
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

  return { projects };
}

function isTransparent(c: string): boolean {
  if (!c || c === 'transparent') return true;
  return /rgba\([^)]*,\s*0\s*\)$/.test(c) || /\/\s*0\s*\)$/.test(c);
}
