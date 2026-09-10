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
 * Light — the editorial register, at golden hour, from a photograph.
 *
 * The previous pass warmed the theme by eye and stopped short: an amber
 * parchment with a cool blue accent, on the reasoning that golden hour is warm
 * light and cool shadows. That is true of the physics and it was not what was
 * being asked for. It is now sampled from a specific reference — low sun over
 * a field, orange sky going to red at the top — and the five colours that came
 * off it are:
 *
 *   #F26734  the burning cloud, the hottest thing in the frame
 *   #FDA44A  the amber the whole sky sits in
 *   #F4957A  the salmon of the high cloud away from the sun
 *   #FAA27D  the peach where that meets the haze
 *   #FFF285  the pale yellow around the sun itself
 *
 * None of those five can be used as they are, and that is not a compromise —
 * it is what separates a palette from a swatch. Every one of them is a
 * mid-tone at high saturation, which is correct for a photograph, where they
 * are being *emitted*, and useless for a page, where they have to be printed.
 * #FDA44A as body text is 2.1:1. So the set is used in two registers instead:
 * washed almost to white for the surfaces, where it becomes the light in the
 * room, and deepened until it holds ink for the type and the sculpture, where
 * it becomes the pigment. Same hues at both ends — the page is unmistakably
 * lit by that sky — with sixty points of lightness between them so that the
 * things that must be legible are.
 *
 * The accent went warm with everything else. The old cool blue was the right
 * call for a theme that was merely warm-tinted and the wrong one for a theme
 * that is a sunset: one blue link in a page of ember reads as a leftover from
 * the previous palette, which is exactly what it was. Deepened #F26734 lands
 * at 5.6:1 on the canvas, so the one accent colour can be the loudest colour
 * in the reference and still clear AA as body-adjacent text.
 *
 * Contrast, measured against the canvas:
 *   Ink #2f2418 13.8:1 · Bark #4d3d2c 9.5:1 · Driftwood #71604c 5.5:1
 *   Ember #a8410f 5.6:1 as text, 5.9:1 white-on-fill as a button.
 */
const light: Palette = {
  surface: '#fdf3e3', //        Low Sun — #FFF285 and #FAA27D washed into paper
  surfaceRaised: '#fffaef', //  Lit Paper

  text: '#2f2418', //      Ink            13.8:1 — the hills in silhouette
  textBody: '#4d3d2c', //  Bark            9.5:1
  textMuted: '#71604c', //  Driftwood       5.5:1

  accent: '#a8410f', //     Ember — deepened #F26734, the one filled surface
  accentHover: '#c04d14', //  Ember Bright
  accentInk: '#fffaef', //  Lit Paper on Ember, 5.9:1
  accentText: '#a8410f', //  the same Ember as link and label text, 5.6:1
  emphasis: '#a8410f', //   Ember, 5.6:1
  tertiary: '#d97a2b', //   #FDA44A deepened — decorative punctuation only

  hairline: '#eddcc0', //  Wheat — the warm hairline is the system's signature edge
  shadow: 'rgba(120, 70, 20, 0.11) 0px 1px 1px 0px, rgba(120, 70, 20, 0.11) 0px 4px 5px 0px',
  scrollbarThumb: '#eddcc0',
  scrollbarThumbHover: '#d9bd93',

  /*
   * The switch shows the destination, so the light half is the reference
   * photograph reduced to four gradients: pale yellow into amber for the band,
   * amber into the burning orange for the sky, a hot core for the sun, and the
   * hills going to silhouette underneath it.
   */
  toggle: {
    band: ['#fff285', '#fda44a'],
    sky: ['#fda44a', '#f26734'],
    orb: ['#fff8d0', '#fda44a'],
    ridge: ['#8a4a24', '#3a2110'],
  },

  graph: {
    /*
     * The same sky as the dark theme, printed rather than lit — and now
     * printed at a different hour.
     *
     * Two earlier attempts built a ramp of a single hue, first ink then blue,
     * on the theory that a light theme should stay near-monochrome. Restraint
     * is right for type and chrome. A constellation is not chrome, and a sky
     * rendered in one hue is not a sky.
     *
     * What survives from the dark theme is the *assignment*: person is the
     * resolved body, roles are few and hot, projects are the structural
     * colour, tech is the numerous quiet swarm. What changes is that the
     * bodies are now being seen through a sunset rather than against a void,
     * so the warm kinds come straight off the reference and the two cool ones
     * come from where the reference is still cool — the band of sky opposite
     * the sun, and the violet where the high cloud has already lost the light.
     *
     * The two cool notes are load-bearing rather than decorative. Forty-five
     * tech nodes and a dozen projects rendered in the same orange family as
     * everything else is not a warm palette, it is a single-hue palette with
     * extra steps, and the graph stops being readable as a graph the moment
     * two kinds cannot be told apart.
     */
    person: '#e2620f', //      The Sun, low and orange — the only resolved body.
    role: '#b8431a', //        #F26734 deepened — few, hot, conspicuous.
    project: '#3a5f9e', //     The sky opposite the sun, still holding its blue.
    achievement: '#a8811a', // #FFF285 deepened until it survives paper.
    domain: '#7d5296', //      The violet where the high cloud has lost the light.
    tech: '#8f8172', //        Warm haze — the swarm, and the quietest.
    link: '#c3b49a',
    /*
     * Decorative only, and pale on purpose — these drift across the whole page
     * behind the text, so anything with real weight reads as a smudge on the
     * canvas rather than as a distant mote. All five sit between 1.4:1 and
     * 1.9:1 against the canvas, which is the band where a particle is
     * perceptible without ever competing with a word.
     */
    ambient: ['#e5a97f', '#e8bd7e', '#e3ab97', '#e7b899', '#ded39a'],
    /*
     * Dust, and emphatically not the ambient set. A background mote wants to
     * be barely there; a particle holding up a chess piece cannot be, or the
     * piece is not there either. These are the same five reference colours
     * taken down to between 2.6:1 and 4.0:1 — dark enough that the sculpture
     * has a silhouette, light enough that twenty thousand of them do not read
     * as a stain.
     *
     * All warm, unlike the node set above, and for the opposite reason: the
     * nodes have to be told apart from each other and the dust has to read as
     * one material. Once the graph becomes a sculpture there is no such thing
     * as a kind any more, so the field can be a single ember palette — which
     * is what makes the knight look carved out of the sunset rather than
     * assembled from five different things.
     */
    dust: ['#c9531c', '#cf8b22', '#b96a4e', '#c07a4f', '#a8901f'],
    linkAlpha: 0.14,
    dimAlpha: 0.14,
    ambientScale: 1.1,
    linkWidth: 0.3,
  },

  cardTints: {
    base: '#8f3a12',
    project: '#c04a17',
    tech: '#d9a03a',
    role: '#a8410f',
    achievement: '#7a5a2a',
  },
};

export const THEMES: Record<Theme, Palette> = { dark, light };
export const DEFAULT_THEME: Theme = 'dark';