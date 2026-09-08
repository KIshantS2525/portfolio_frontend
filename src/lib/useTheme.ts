import { useEffect, useState } from 'react';
import { DEFAULT_THEME, THEMES, type Palette, type Theme } from '@/lib/theme';
import {
  applyCardTintVars,
  COLOR_OVERRIDES_EVENT,
  getColorOverrides,
  type ColorOverrides,
} from '@/lib/colorOverrides';

/** Runtime theme state. All colours come from theme.ts; none are defined here. */

export const THEME_KEY = 'ishant:theme';
export const THEME_EVENT = 'ishant:theme-change';

export function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEMES[theme].surface);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked */
  }
  applyCardTintVars(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setThemeState((document.documentElement.dataset.theme as Theme) || resolveTheme());
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  return [
    theme,
    (t: Theme) => {
      applyTheme(t);
      setThemeState(t);
    },
  ];
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