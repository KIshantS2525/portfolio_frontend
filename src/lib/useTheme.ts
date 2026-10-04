import { useEffect, useState } from 'react';
import { THEMES, type Palette, type Theme } from '@/lib/theme';
import {
  applyCardTintVars,
  COLOR_OVERRIDES_EVENT,
  getColorOverrides,
  type ColorOverrides,
} from '@/lib/colorOverrides';

/** Runtime theme state. All colours come from theme.ts; none are defined here. */

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
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEMES.dark.surface);
  applyCardTintVars('dark');
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
 * The constellation paints to a canvas, which cannot read CSS variables. It
 * reads the palette object directly instead — same source, no duplication —
 * merged with any admin-set graph colour overrides for the active theme.
 */
export function usePalette(): Palette {
  const [theme] = useTheme();
  const overrides = useColorOverrides();
  const base = THEMES[theme];
  const themeOverrides = overrides[theme];
  if (!themeOverrides || (!themeOverrides.graph && themeOverrides.linkWidth === undefined)) return base;
  return {
    ...base,
    graph: {
      ...base.graph,
      ...themeOverrides.graph,
      ...(themeOverrides.linkWidth !== undefined ? { linkWidth: themeOverrides.linkWidth } : null),
    },
  };
}