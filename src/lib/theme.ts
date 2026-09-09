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
    /** Decorative only — the scattered particles drifting behind the page, never UI. */
    ambient: string[];
    /**
     * The sculpture's dust. Separate from `ambient` because the two sit on
     * different things: ambient particles drift *behind* the content and have
     * to stay out of its way, while dust has to hold the shape of a chess
     * piece against the page background. On the dark theme those are the same
     * problem and the two arrays agree. On the light one they are opposites —
     * see the light palette below.
     */
    dust: string[];
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
     * Dark-mode graph palette: a night sky, read literally.
     *
     * The kinds are assigned along the stellar sequence rather than around a
     * colour wheel, which is why the set holds together — every hue in it is
     * one a star actually comes in, and the eye knows that range even when it
     * cannot name it. O and B types are blue, A blue-white, G yellow, K
     * orange, M red. There is no green star and no purple one, so the single
     * colour here that is off the sequence is the violet, which is a nebula —
     * kept for domains, because a domain is the one kind that is a region
     * rather than a body, and kept because it is the site's own accent.
     *
     * The person is the Moon: the one thing close enough to be a disc instead
     * of a point (see makeOrbTexture), and on a black sky the pale, airless,
     * unrayed one. The sun is what the light theme gets.
     */
    person: '#f2f5fb', //      The Moon — pale lunar white, the only resolved body.
    role: '#ffb26b', //        K-type orange giant — few, warm, conspicuous.
    project: '#8fb6ff', //     B-type blue.
    domain: '#c9a6ff', //      Nebula violet — a region, not a star.
    tech: '#cfd9ee', //        A-type blue-white — the swarm, and the quietest.
    achievement: '#ffe6a3', // G-type yellow.
    link: '#6f7ea0',
    /*
     * The page's own drifting field, behind the content. Same stellar sequence
     * as the nodes and the dust, so a particle behind a paragraph and a
     * particle holding up the knight are recognisably the same thing seen at
     * different distances. The teal that used to be in here was the one colour
     * on the page that no star comes in, and it showed.
     */
    ambient: ['#8fb6ff', '#ffe6a3', '#ffb26b', '#cfd9ee', '#c9a6ff'],
    /*
     * The same stellar sequence as the nodes, so that once the graph becomes a
     * sculpture there is one sky rather than two populations sharing a shape.
     */
    dust: ['#8fb6ff', '#cfd9ee', '#ffe6a3', '#ffb26b', '#c9a6ff'],
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
     * The same sky as the dark theme, printed rather than lit.
     *
     * Two attempts at this were wrong in the same way. Both built a ramp of a
     * single hue — first ink, then blue — on the theory that a light theme
     * should stay near-monochrome, and both produced a page of grey and blue
     * bubbles with no life in them. Restraint is right for type and chrome. A
     * constellation is not chrome, and a sky rendered in one hue is not a sky.
     *
     * So the kinds carry the same stellar assignments they do on black: blue
     * giant, orange giant, yellow, violet nebula, blue-white swarm. One thing
     * has to change, and it is not the hue. Real star colours are all tints of
     * white — #8fb6ff and #ffe6a3 are within twenty points of lightness of
     * Parchment, and on Parchment they are simply not there. Printing a sky
     * means keeping the hues and inverting the value, so every colour below is
     * its dark-theme counterpart taken down until it reads as ink. The
     * relationships survive; the luminance flips, because it has to.
     *
     * The range stays deliberately narrow at both ends. The first ink ramp ran
     * from Twilight #282834 to Fog #b4b8b4 — seventy points of lightness,
     * survivable while nodes were nodes and fatal once the graph became a
     * sculpture. At that point every node is the same size as the motes around
     * it, so projects were near-black blots and forty-five tech nodes sat so
     * close to the paper they weren't there: speckled and moth-eaten at once.
     */
    person: '#e08700', //      The Sun — amber, rayed, the only resolved body.
    role: '#c1440e', //        Orange giant, in ink.
    project: '#2f5fd0', //     Blue giant.
    achievement: '#b07400', // Yellow, deepened until it survives paper.
    domain: '#7a4bc4', //      Nebula violet.
    tech: '#8fa3c4', //        Blue-white swarm — the quietest, as always.
    link: '#8fa3c4',
    /*
     * Decorative only. These drift across the whole page behind the content,
     * so anything with real weight in here reads as a smudge on the canvas
     * rather than a distant node — hence blues and the two lightest neutrals,
     * nothing from the dark end of the scale.
     */
    /*
     * Pale on purpose — these drift across the whole page behind the text, so
     * anything with real weight reads as a smudge on the canvas rather than a
     * distant node. But pale is not the same as grey: these are the node hues
     * washed out, not neutrals, so the light field has the same range of
     * colour the dark one does at a fraction of the strength.
     */
    ambient: ['#8ea8dc', '#e0b478', '#c99a8a', '#a99ad0', '#c9d2ce'],
    /*
     * Dust, and emphatically not the ambient set. Three of those five —
     * #8fc4dd, #c9d2ce, #dee2de — are within fifteen points of lightness of
     * Parchment, which is exactly what a background mote wants and exactly
     * what a sculpture cannot use: three fifths of the knight was invisible,
     * and the two that weren't are the strongest blues in the system, so what
     * remained read as a scatter of loud dots rather than a solid object.
     *
     * These are the node hues again, lightened one step so the dust stays
     * quieter than the things suspended in it, and every one of them still
     * clearly darker than the page. The depth cue works on alpha, so the far
     * side of the piece fades toward the paper rather than toward black —
     * which is the correct direction for a light theme, and is why nothing
     * here needs to be pale to begin with.
     */
    dust: ['#4a74d6', '#e69a2b', '#cc5c2a', '#8d63cc', '#7f92b8'],
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