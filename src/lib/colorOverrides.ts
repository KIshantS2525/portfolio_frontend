// frontend/src/lib/colorOverrides.ts
import { THEMES, type Palette } from '@/lib/theme';

/**
 * Runtime colour customisation, on top of the theme.ts defaults.
 *
 * The site has one look now (night), so there is one set of overrides — not
 * a dark set and a light set. Everything the homepage actually shows can be
 * changed here from the admin Colors tab without a redeploy:
 *
 *   page    background, cards, the three text greys, the accent and its
 *           hover/ink, the amber highlight, hairlines        → CSS variables
 *   sky     the fixed backdrop gradient and its stars       → SkyBackdrop
 *   galaxy  the hero spiral                                 → cosmos.ts
 *   graph   node colours per kind, link colour + width      → the 3D graph
 *   dust    the particles the sculptures are made of        → DustCloud
 *   ambient the particles drifting behind the page          → AmbientField
 *   cards   the glass info-card tints                       → CSS variables
 *
 * They live in the backend content tree (`colors` key), so a change shows up
 * for every visitor. A tree saved by the old two-theme panel
 * ({ dark: {...}, light: {...} }) is read as its dark half.
 */

export type NodeKind = 'person' | 'role' | 'project' | 'domain' | 'tech' | 'achievement' | 'link';
export type CardKind = 'base' | 'project' | 'tech' | 'role' | 'achievement';

export type PageKey =
  | 'surface'
  | 'surfaceRaised'
  | 'text'
  | 'textBody'
  | 'textMuted'
  | 'accent'
  | 'accentHover'
  | 'accentInk'
  | 'emphasis'
  | 'hairline';
export type GalaxyKey = keyof Palette['galaxy'];
export type SkyKey = keyof Palette['sky'];

export type ColorOverrides = {
  page?: Partial<Record<PageKey, string>>;
  sky?: Partial<Record<SkyKey, string>>;
  galaxy?: Partial<Record<GalaxyKey, string>>;
  graph?: Partial<Record<NodeKind, string>>;
  /** Constellation line thickness, react-force-graph-3d `linkWidth` units. */
  linkWidth?: number;
  dust?: string[];
  ambient?: string[];
  cards?: Partial<Record<CardKind, string>>;
};

/** The defaults every override sits on top of. */
export const BASE: Palette = THEMES.dark;

export const COLOR_OVERRIDES_EVENT = 'ishant:color-overrides-change';

let current: ColorOverrides = {};

export function getColorOverrides(): ColorOverrides {
  return current;
}

/** Accepts the current flat shape or the old { dark, light } one. */
export function normaliseColors(raw: unknown): ColorOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const flat = (r.dark && typeof r.dark === 'object' ? r.dark : r) as ColorOverrides;
  const out: ColorOverrides = {};
  for (const k of ['page', 'sky', 'galaxy', 'graph', 'cards'] as const) {
    const v = flat[k];
    if (v && typeof v === 'object') (out as Record<string, unknown>)[k] = { ...v };
  }
  if (typeof flat.linkWidth === 'number') out.linkWidth = flat.linkWidth;
  if (Array.isArray(flat.dust)) out.dust = flat.dust.slice();
  if (Array.isArray(flat.ambient)) out.ambient = flat.ambient.slice();
  return out;
}

/**
 * The full palette with overrides applied — what the canvas-painted parts of
 * the site (graph, galaxy, sky, particles) read.
 */
export function resolvePalette(o: ColorOverrides = current): Palette {
  const page = o.page ?? {};
  return {
    ...BASE,
    ...page,
    // The amber is used both as emphasis and as link/label text.
    accentText: page.emphasis ?? BASE.accentText,
    graph: {
      ...BASE.graph,
      ...o.graph,
      ...(o.linkWidth !== undefined ? { linkWidth: o.linkWidth } : null),
      ...(o.dust?.length ? { dust: o.dust } : null),
      ...(o.ambient?.length ? { ambient: o.ambient } : null),
    },
    galaxy: { ...BASE.galaxy, ...o.galaxy },
    sky: { ...BASE.sky, ...o.sky },
    cardTints: { ...BASE.cardTints, ...o.cards },
  };
}

/**
 * Replace the whole overrides tree (after /api/content resolves, or live from
 * the admin preview) and push the CSS-variable colours onto <html> straight
 * away, so every utility class that reads them updates without a reload.
 */
export function setColorOverrides(next: unknown) {
  current = normaliseColors(next);
  applyCssVars();
  window.dispatchEvent(new CustomEvent(COLOR_OVERRIDES_EVENT, { detail: current }));
}

const PAGE_VARS: Record<PageKey, string[]> = {
  surface: ['--surface'],
  surfaceRaised: ['--surface-raised'],
  text: ['--text'],
  textBody: ['--text-body'],
  textMuted: ['--text-muted'],
  accent: ['--accent'],
  accentHover: ['--accent-hover'],
  accentInk: ['--accent-ink'],
  emphasis: ['--emphasis', '--accent-text'],
  hairline: ['--hairline'],
};

const CARD_KEYS: CardKind[] = ['base', 'project', 'tech', 'role', 'achievement'];

/**
 * Inline styles on <html> beat the stylesheet defaults in
 * theme.generated.css. Tailwind's colour utilities are declared on :root as
 * var(--text) and friends, so setting the source variable on the same
 * element is enough for text-bone, bg-iris and the rest to follow. Clearing
 * an override removes the inline property and the default shows through.
 */
export function applyCssVars() {
  const root = document.documentElement;
  const page = current.page ?? {};
  for (const [key, vars] of Object.entries(PAGE_VARS) as [PageKey, string[]][]) {
    for (const v of vars) {
      if (page[key]) root.style.setProperty(v, page[key]!);
      else root.style.removeProperty(v);
    }
  }
  const cards = current.cards ?? {};
  for (const key of CARD_KEYS) {
    const value = cards[key];
    if (value) root.style.setProperty(`--glass-tint-${key}`, value);
    else root.style.removeProperty(`--glass-tint-${key}`);
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', page.surface ?? BASE.surface);
}

/** Kept for callers of the old name. */
export function applyCardTintVars() {
  applyCssVars();
}
