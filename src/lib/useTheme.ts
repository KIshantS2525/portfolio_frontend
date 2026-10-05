// frontend/src/lib/useTheme.ts
import { useEffect, useMemo, useState } from 'react';
import { type Palette, type Theme } from '@/lib/theme';
import {
  applyCssVars,
  COLOR_OVERRIDES_EVENT,
  getColorOverrides,
  resolvePalette,
  type ColorOverrides,
} from '@/lib/colorOverrides';

/** Runtime theme state. Default colours come from theme.ts; overrides from the admin. */

/**
 * The main site is night only. The archive and the island keep their own
 * lighting (their own pull cords, their own palettes); the site theme is no
 * longer switchable, so this always resolves to dark.
 */
export function resolveTheme(): Theme {
  return 'dark';
}

export function applyTheme(_theme?: Theme) {
  document.documentElement.dataset.theme = 'dark';
  applyCssVars();
}

/** Always dark. Kept as a hook so components read the palette the same way. */
export function useTheme(): [Theme, (t: Theme) => void] {
  return ['dark', () => {}];
}

/** Re-renders whenever the admin Colors tab (or a freshly-loaded /api/content) changes overrides. */
export function useColorOverrides(): ColorOverrides {
  const [overrides, setOverrides] = useState<ColorOverrides>(getColorOverrides);
  useEffect(() => {
    const onChange = (e: Event) => setOverrides({ ...(e as CustomEvent<ColorOverrides>).detail });
    window.addEventListener(COLOR_OVERRIDES_EVENT, onChange);
    return () => window.removeEventListener(COLOR_OVERRIDES_EVENT, onChange);
  }, []);
  return overrides;
}

/**
 * The canvas-painted parts (graph, galaxy, sky, particles) cannot read CSS
 * variables, so they read the palette object instead — theme.ts defaults with
 * the admin overrides applied. Memoised on the overrides, so the identity only
 * changes when a colour actually does (the graph rebuilds on identity change).
 */
export function usePalette(): Palette {
  const overrides = useColorOverrides();
  return useMemo(() => resolvePalette(overrides), [overrides]);
}