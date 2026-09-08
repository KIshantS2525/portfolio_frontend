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
  accentText: '#8052ff',
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
 * Light — cream paper and marker orange. Deliberately its own personality
 * rather than an inverted void: ink and highlighter on notebook stock.
 *
 * Two of the source tokens could not be used as given:
 *   · Marker Orange #ff6f1e is 2.70:1 on cream — it fails as text. It is kept
 *     as the button FILL, with Cocoa Ink on top at 6.02:1, which is both
 *     accessible and more on-brand than white would have been.
 *   · Burnt Sienna #ce500a is 4.26:1 — large text only. Links and 12px labels
 *     use #b84708 (5.2:1) so captions stay readable.
 * The sticker colours (Sky, Bubblegum) are decorative per the brief, so they
 * appear only in the constellation's ambient particle field — never in UI.
 */
const light: Palette = {
  surface: '#fdfbf9', //        Cream Paper
  surfaceRaised: '#f7efe9', //  Dew Drop

  text: '#2b1a07', //      Cocoa Ink       16.2:1
  textBody: '#43341f', //  derived cocoa   11.6:1
  textMuted: '#726352', //  derived cocoa   5.6:1

  accent: '#ff6f1e', //     Marker Orange — fill only
  accentHover: '#f2600d',
  accentInk: '#2b1a07', //  Cocoa Ink on orange, 6.0:1
  accentText: '#b84708', //  deepened sienna, 5.2:1
  emphasis: '#b84708', //   5.2:1
  tertiary: '#137a39', //   deepened sprout, 5.3:1

  hairline: 'rgba(43, 26, 7, 0.26)',
  shadow: '0 2px 0 rgba(43, 26, 7, 0.06), 0 10px 24px rgba(190, 188, 187, 0.5)',
  scrollbarThumb: '#ded7d0',
  scrollbarThumbHover: '#c8bfb6',

  toggle: {
    band: ['#abfaff', '#d5ffab'],
    sky: ['#9fdef2', '#a8ffac'],
    orb: ['#f6f061', '#61edf6'],
    ridge: ['#86d2a0', '#517d91'],
  },

  graph: {
    /*
     * Light-mode graph palette. Rebalanced for what actually needs to happen
     * on cream paper:
     *  - `person` (the queen-bee node in the middle) is Marker Orange, the
     *    same accent the CTA button uses. Cocoa ink at 3px was fine for
     *    body text but reads as a dead dark speck when it's meant to be the
     *    focal point of a graph animation — the whole thing orbits it.
     *  - `role` and `project` are kept distinct: Sienna for role (deep,
     *    stable), Marker Orange for project (bright, primary). In dark mode
     *    they were both purple; here they'd both be sienna, which lost the
     *    hub-vs-project distinction against the beige backdrop.
     *  - `domain` (deep sprout) and `tech` (deep bubblegum, not orange) get
     *    real hue separation from role/project so the graph doesn't read as
     *    a monochrome orange cloud in light mode.
     */
    person: '#ff6f1e', //     Marker Orange — the queen bee.
    role: '#b84708', //       deepened sienna
    project: '#ff6f1e', //    Marker Orange
    domain: '#137a39', //     deep sprout
    tech: '#c2185b', //       deep bubblegum — sits opposite orange on the wheel
    achievement: '#2b1a07', // Cocoa ink
    link: '#2b1a07',
    // Sticker colours live here and only here.
    ambient: ['#ff6f1e', '#3b82f6', '#ff66cf', '#22c55e', '#b84708'],
    linkAlpha: 0.16,
    dimAlpha: 0.16,
    ambientScale: 1.3,
    linkWidth: 0.3,
  },

  cardTints: {
    base: '#2b1a07',
    project: '#ff6f1e',
    tech: '#c2185b',
    role: '#b84708',
    achievement: '#137a39',
  },
};

export const THEMES: Record<Theme, Palette> = { dark, light };
export const DEFAULT_THEME: Theme = 'dark';