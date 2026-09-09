// src/lib/theme.ts
/**
 * THE COLOUR SOURCE OF TRUTH.
 *
 * Every colour in the site is defined here and nowhere else. `npm run gen-theme`
 * compiles this into src/styles/theme.generated.css as real CSS custom
 * properties, which Tailwind's utilities then point at — so editing this file
 * changes the whole site, canvas included, with no other edits.
 *
 * Never edit theme.generated.css. It is overwritten on every dev start and build.
 *
 * Contrast is measured, not eyeballed. The ratio in each comment is against
 * that theme's own surface. Everything used as body or label text clears
 * WCAG AA (4.5:1); decorative-only values are marked as such.
 */

export type Theme = 'dark' | 'light';

export type Palette = {
  /* surfaces */
  surface: string;
  surfaceRaised: string;

  /* type */
  text: string;
  textBody: string;
  textMuted: string;

  /* accents */
  accent: string;
  accentHover: string;
  /** Text colour that sits ON an accent fill. */
  accentInk: string;
  /** The accent used as text — sometimes darker than the fill. */
  accentText: string;
  emphasis: string;
  tertiary: string;

  /* lines and shadow */
  hairline: string;
  shadow: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;

  /**
   * The day/night switch artwork. These are illustration colours for the
   * control itself, not UI tokens — they never appear anywhere else.
   */
  toggle: {
    /** .slider band, top to bottom */
    band: [string, string];
    /** slider-bg landscape gradient */
    sky: [string, string];
    /** the orb behind the knob */
    orb: [string, string];
    /** mountain ridges */
    ridge: [string, string];
  };

  /* constellation */
  graph: {
    person: string;
    role: string;
    project: string;
    domain: string;
    tech: string;
    achievement: string;
    link: string;
    /** Decorative only — the scattered particles, never UI. */
    ambient: string[];
    linkAlpha: number;
    dimAlpha: number;
    ambientScale: number;
    /** Constellation connecting-line thickness, passed straight to react-force-graph-3d's `linkWidth`. */
    linkWidth: number;
  };

  /**
   * Liquid-glass card tint defaults. Each is a base colour that the card's
   * frosted background, border and inner sheen are all derived from at
   * render time (see `.glass-card` in index.css) — never a flat fill by
   * itself. `base` is the general-purpose card (About, Contact, Ask AI,
   * admin panels); the rest key to the kind of thing the card is about, so a
   * project card and a tech chip don't read as the same object. All five
   * are overridable per-theme from the admin Colors tab.
   */
  cardTints: {
    base: string;
    project: string;
    tech: string;
    role: string;
    achievement: string;
  };
};

/**
 * Dark — the Dala void. Pure black, one violet accent, amber emphasis.
 */
const dark: Palette = {
  surface: '#000000',
  surfaceRaised: '#0c0c10', //  a hair off pure black — gives the glass cards a surface to sit on

  text: '#ffffff', //      21.0:1
  textBody: '#bdbdbd', //  11.2:1
  textMuted: '#9a9a9a', //  7.5:1

  accent: '#8052ff', //     4.6:1
  accentHover: '#8f66ff',
  accentInk: '#ffffff', //  4.6:1 on the fill
  accentText: '#ffb829', //  Saffron Spark — Dala's spec reserves amber for accent links, not violet
  emphasis: '#ffb829', //  12.1:1
  tertiary: '#15846e', //   4.6:1

  hairline: 'rgba(154, 154, 154, 0.28)',
  shadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
  scrollbarThumb: '#232323',
  scrollbarThumbHover: '#333333',

  toggle: {
    band: ['#364bba', '#a979d9'],
    sky: ['#6a86eb', '#010203'],
    orb: ['#a5c5eb', '#51eaff'],
    ridge: ['#6783ca', '#271b59'],
  },

  graph: {
    /*
     * Dark-mode graph palette. Person is a bright warm gold (Saffron pushed
     * lighter, so it stays distinct from tech's darker saffron) — the queen
     * bee node needs to read as a warm focal point instead of blending into
     * every other white-tinted dot in the field.
     */
    person: '#fff2a8', //     Warm champagne — the queen bee.
    role: '#8052ff',
    project: '#8052ff',
    domain: '#15846e',
    tech: '#ffb829',
    achievement: '#ffffff',
    link: '#ffffff',
    ambient: ['#8052ff', '#ffb829', '#15846e', '#6f5bd6', '#ffffff'],
    linkAlpha: 0.08,
    dimAlpha: 0.1,
    ambientScale: 1,
    linkWidth: 0.3,
  },

  cardTints: {
    base: '#ffffff',
    project: '#8052ff',
    tech: '#ffb829',
    role: '#8f66ff',
    achievement: '#15846e',
  },
};

/**
 * Light — General Intelligence Company's editorial register. Warm parchment
 * canvas, near-neutral ink, and exactly one chromatic accent (Signal Blue)
 * used the way the spec insists on: as a border and as text, never as a
 * background fill. The only filled surface in the whole theme is Dusk, and
 * it appears on a single button variant — everything else is paper, hairline
 * and ink, the same restraint the reference system uses throughout.
 *
 *   · Signal Blue #41a1cf is 2.9:1 on Parchment — too low for body text, so
 *     it is reserved for large text, borders and 15px+ labels, matching the
 *     reference's own "outlined action" role for the colour.
 *   · Dusk #1f1f29 is the sole filled surface (buttons only, per spec) and
 *     doubles as the deepest graph/card tint so a handful of elements still
 *     read as "ink" rather than "grey" against the warm canvas.
 *   · Cerulean #0081c0 is the rare saturated punctuation colour — used only
 *     as the constellation's focal node and a card tint, never as UI chrome.
 */
const light: Palette = {
  surface: '#fefffc', //        Parchment
  surfaceRaised: '#ffffff', //  Paper

  text: '#2c2c2c', //      Graphite       14.6:1
  textBody: '#444141', //  Charcoal       10.6:1
  textMuted: '#646464', //  Ash            6.3:1

  accent: '#1f1f29', //     Dusk — the system's one filled surface, buttons only
  accentHover: '#282834', //  Twilight
  accentInk: '#ffffff', //  white on Dusk, 15.9:1
  accentText: '#0f7ea3', //  deepened Signal Blue, 4.7:1 — readable as link/label text
  emphasis: '#0f7ea3', //   deepened Signal Blue, 4.7:1
  tertiary: '#0081c0', //   Cerulean — rare vivid punctuation, decorative use only

  hairline: '#dee2de', //  Mist — the green-tinted hairline is the system's signature edge
  shadow: 'rgba(0, 0, 0, 0.08) 0px 1px 1px 0px, rgba(0, 0, 0, 0.08) 0px 4px 5px 0px',
  scrollbarThumb: '#dee2de',
  scrollbarThumbHover: '#b4b8b4',

  toggle: {
    band: ['#9fdef2', '#41a1cf'],
    sky: ['#41a1cf', '#0081c0'],
    orb: ['#dee2de', '#41a1cf'],
    ridge: ['#646464', '#282834'],
  },

  graph: {
    /*
     * Light-mode graph palette, built as an ink wash rather than a set of
     * hues. The first pass had this exactly backwards: `tech` is by far the
     * most numerous kind — up to 45 of them against two roles — and it was set
     * to Graphite, so the densest layer of the constellation was also the
     * heaviest and the whole field read as dirt scattered on the page.
     *
     * Here the tonal weight tracks importance instead of accident of count.
     * Cerulean marks the person (the system's one saturated colour, spent on
     * the one node that earns it), Signal Blue the roles, then the ink scale
     * steps down through Twilight and Charcoal for projects and achievements
     * to Ash for domains and Fog for the tech swarm. The many small dots are
     * now the lightest thing in the field, which is what lets the paper stay
     * paper. Hue separation isn't needed to tell the kinds apart at this
     * density — value separation does it, and stays inside the reference
     * system's near-monochrome discipline.
     */
    person: '#0081c0', //      Cerulean — the queen bee, and the only saturated node.
    role: '#41a1cf', //        Signal Blue
    project: '#282834', //     Twilight
    achievement: '#444141', // Charcoal
    domain: '#646464', //      Ash
    tech: '#b4b8b4', //        Fog — the swarm, deliberately the quietest.
    link: '#646464',
    /*
     * Decorative only. These drift across the whole page behind the content,
     * so anything with real weight in here reads as a smudge on the canvas
     * rather than a distant node — hence blues and the two lightest neutrals,
     * nothing from the dark end of the scale.
     */
    ambient: ['#41a1cf', '#8fc4dd', '#0081c0', '#c9d2ce', '#dee2de'],
    linkAlpha: 0.14,
    dimAlpha: 0.14,
    ambientScale: 1.1,
    linkWidth: 0.3,
  },

  cardTints: {
    base: '#1f1f29',
    project: '#41a1cf',
    tech: '#0081c0',
    role: '#282834',
    achievement: '#444141',
  },
};

export const THEMES: Record<Theme, Palette> = { dark, light };
export const DEFAULT_THEME: Theme = 'dark';