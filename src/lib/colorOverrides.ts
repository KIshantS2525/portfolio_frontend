// src/lib/colorOverrides.ts
import type { Theme } from '@/lib/theme';

/**
 * Runtime colour customisation, on top of the theme.ts defaults.
 *
 * These are the only colours the admin Colors tab can change without a
 * redeploy: the graph node colours (per kind) and the liquid-glass card
 * tints (per card kind), independently for dark and light. They live on the
 * backend content tree (see `/api/content`, `colors` key) — the same store
 * profile/projects/roles already use — so a change made in the panel shows
 * up for every visitor, not just the admin's own browser.
 *
 * This module is a small module-level store with a pub/sub event, not React
 * state, because the values are needed in two places that don't share a
 * component tree: `usePalette()` (used by the WebGL graph, which reads plain
 * JS colour strings) and the plain CSS custom properties `.glass-card`
 * reads. A context would work too, but this needs zero provider wiring and
 * matches the existing `useTheme` pattern in this file's neighbour.
 */

export type NodeKind = 'person' | 'role' | 'project' | 'domain' | 'tech' | 'achievement' | 'link';
export type CardKind = 'base' | 'project' | 'tech' | 'role' | 'achievement';

export type GraphOverrides = Partial<Record<NodeKind, string>>;
export type CardOverrides = Partial<Record<CardKind, string>>;

export type ThemeOverrides = {
  graph?: GraphOverrides;
  cards?: CardOverrides;
  /** Constellation line thickness. Same units as react-force-graph-3d's `linkWidth`. */
  linkWidth?: number;
};

export type ColorOverrides = {
  dark?: ThemeOverrides;
  light?: ThemeOverrides;
};

export const COLOR_OVERRIDES_EVENT = 'ishant:color-overrides-change';

let current: ColorOverrides = {};

export function getColorOverrides(): ColorOverrides {
  return current;
}

/**
 * Replace the whole overrides tree (e.g. after `/api/content` resolves, or
 * on every keystroke in the admin Colors tab for a live preview) and push
 * the card-tint CSS variables onto the document immediately so every
 * `.glass-card` on the page updates without a reload.
 */
export function setColorOverrides(next: ColorOverrides | null | undefined) {
  current = next ?? {};
  applyCardTintVars(currentThemeName());
  window.dispatchEvent(new CustomEvent(COLOR_OVERRIDES_EVENT, { detail: current }));
}

function currentThemeName(): Theme {
  return (document.documentElement.dataset.theme as Theme) || 'dark';
}

const CARD_KEYS: CardKind[] = ['base', 'project', 'tech', 'role', 'achievement'];

/**
 * Writes `--glass-tint-*` as inline styles on <html>, which beats the
 * stylesheet's defaults from theme.generated.css without needing to touch
 * that generated file at runtime. Clearing an override removes the inline
 * property so the generated default shows through again.
 */
export function applyCardTintVars(theme: Theme) {
  const root = document.documentElement;
  const overrides = current[theme]?.cards ?? {};
  for (const key of CARD_KEYS) {
    const value = overrides[key];
    if (value) root.style.setProperty(`--glass-tint-${key}`, value);
    else root.style.removeProperty(`--glass-tint-${key}`);
  }
}