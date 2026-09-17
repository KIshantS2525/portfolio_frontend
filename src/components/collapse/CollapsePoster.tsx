// src/components/collapse/CollapsePoster.tsx
import { useMemo } from 'react';
import { StackCards } from '@/components/studio/StackCards';
import { ScrollExpand } from '@/components/studio/ScrollExpand';
import { CardSpotlight } from '@/components/studio/CardSpotlight';
import { Stack } from '@/components/minimal/Stack';
import { About } from '@/components/minimal/About';
import { Contact } from '@/components/minimal/Contact';
import { Footer } from '@/components/core/Footer';
import { Reveal } from '@/components/core/Reveal';
import { FrozenVisibility } from '@/components/core/WhenVisible';
import { ArchiveDoor } from '@/components/archive/ArchiveDoor';
import { GameDoor } from '@/components/game/GameDoor';
import { useCollapsePhase } from '@/lib/collapseState';
import { useAchievements, useProfile, useProjects, useRoles } from '@/lib/useContent';
import { usePalette } from '@/lib/useTheme';
import { buildGraph, solveLayout, type NodeKind } from '@/lib/graph';

/**
 * The homepage, as one tall sheet of paper.
 *
 * ── Why this is the real page now, and not a summary of it ──
 *
 * The first poster was a lookalike: the same content in a simplified layout of
 * its own — a 3-column card grid, chips for skills, a fixed 1280px width. It
 * read as "a page about Ishant", not as the page the visitor had just been
 * reading, and the whole premise of the collapse is that it is THIS page that
 * falls. So the poster now renders the actual homepage sections — the same
 * StackCards, Stack, About, Contact, doors and footer components Home renders,
 * in the same order, with the same markup around them — and it is laid out at
 * the visitor's real viewport width (see `fitPoster`), so every `vw`-based type
 * size and every `md:`/`lg:` breakpoint resolves exactly as it does on the page.
 *
 * ── The one thing that cannot be the real page ──
 *
 * GraphJourney. On the live page its ~1100vh is almost entirely scroll runway
 * for a pinned sequence; a sheet made of it would be one hero screen, ten
 * screens of black, then everything else. So that span becomes ONE screen: the
 * hero exactly as the pinned sequence opens on it — name, positioning, the two
 * actions — with the knowledge graph beside it, drawn flat. A 2D projection of
 * the same graph, from the same content, through the same deterministic layout
 * solve in lib/graph.ts, in the same per-kind palette. It is the still frame of
 * the thing that was moving.
 *
 * ── The rules this file follows ──
 *
 *   1. EVERYTHING FROZEN. The subtree is wrapped in <FrozenVisibility>, which
 *      tells every animated component it is off screen, including ones behind
 *      their own WhenVisible. The marquees stop, ScrollExpand stops. A sheet
 *      mid-throw must not have things moving on it — and the texture that
 *      replaces it at impact is captured at the click, so anything that moved
 *      in between would be a visible jump at the swap.
 *
 *   2. REVEALS FORCED OPEN. <Reveal> starts hidden and waits for an observer
 *      that misbehaves inside a scaled, rotating sheet. collapse.css pins every
 *      `.reveal` inside the poster to its revealed state, so the poster can use
 *      the real components (which contain Reveals) unmodified.
 *
 *   3. NO CANVASES. The live page's graph is WebGL; the poster's is SVG. The
 *      texture painter (posterTexture.ts) can replay boxes, text, SVG and
 *      images — not another canvas's pixels.
 *
 * Duplicate ids (`#work`, `#about`, `#contact`) exist while this is mounted,
 * because the section components carry their own. That is harmless: the live
 * copies are `display: none` for exactly as long as the poster exists, and
 * nothing navigates by hash during the sequence.
 */
export function CollapsePoster() {
  const phase = useCollapsePhase();
  const profile = useProfile();

  /*
   * Mounted only during the sequence. A second full copy of the homepage is not
   * something to keep in the tree on a page whose first-paint budget went into
   * getting GraphJourney started quickly.
   */
  if (phase === 'idle') return null;

  const [first, ...rest] = profile.name.split(' ');

  return (
    <div id="collapse-poster" aria-hidden="true">
      <FrozenVisibility>
        {/*
          The hero: GraphJourney's opening screen, markup copied from its overlay
          so the type, spacing and actions are pixel-identical — `shell`, a
          min-h-screen flex row, the 520px text column. Exactly one viewport
          tall, which is what makes the sheet's first frame line up with what the
          visitor was looking at when they clicked.
        */}
        <section className="poster-hero relative">
          <PosterGraph />
          <div className="shell relative flex min-h-screen items-center">
            <div className="w-full max-w-[520px]">
              <h1 className="t-display text-bone">
                {first}
                <br />
                {rest.join(' ')}
              </h1>
              <p className="t-body mt-[24px] max-w-[480px] text-mist">{profile.positioning}</p>
              <p className="t-caption mt-[18px] text-ash">
                {profile.title}, {profile.location.split(',')[0]}. {profile.availability}
              </p>
              <div className="mt-[30px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px]">
                <span className="pill">Ask my AI about me</span>
                <span className="ghost">Download resume</span>
              </div>
              <p className="t-caption mt-[36px] text-ash">Every project, tool and domain. Tap a node.</p>
            </div>
          </div>
        </section>

        {/* Everything from here down is Home.tsx's <main>, in Home's order. */}

        {/*
          `poster-work` is how blueprint.ts finds the project cards: the
          buildings stand on exactly these rects. Styling-free on purpose.
        */}
        <section className="poster-work shell pt-[120px]">
          <Reveal>
            <h2 className="t-heading-lg mb-[36px] text-bone">Work</h2>
          </Reveal>
          {/*
            Every project. All 29 become buildings in slice 5, and a poster that
            quietly dropped some would be the blueprint for a different city.
          */}
          <StackCards />
        </section>

        <section className="shell pt-[120px]">
          <Reveal>
            <CardSpotlight className="rounded-[24px] border border-ash/15 p-[30px]">
              <h2 className="t-heading-lg text-bone">DiagramStudio</h2>
              <p className="t-body mt-[12px] max-w-[54ch] text-mist">
                A hand-written lexer, parser and resolver compiling a custom DSL to a layout graph. Live at{' '}
                <span className="text-saffron">diagramstudio.in</span>.
              </p>
            </CardSpotlight>
          </Reveal>
          <div className="mt-[36px]">
            <ScrollExpand
              src="/studio/diagramstudio-hero.svg"
              alt=""
              caption="Placeholder. Replace with a 2400px-wide screenshot of the real canvas."
            />
          </div>
        </section>

        {/* `poster-stack` is how blueprint.ts finds the skills: one walker per item. */}
        <div className="poster-stack">
          <Stack />
        </div>
        <About />
        <Contact />

        <section className="shell flex flex-wrap gap-[16px] pt-[96px]">
          <ArchiveDoor />
          <GameDoor />
        </section>

        <Footer />
      </FrozenVisibility>
    </div>
  );
}

/* ── The knowledge graph, flat ──────────────────────────────────────────── */

/** Which kinds get a text label. Matches the live graph, which labels these three and nothing else. */
const LABELLED: ReadonlySet<NodeKind> = new Set(['person', 'role', 'project']);

/** Dot radius per kind, in layout units. The live graph's ordering, flattened. */
const DOT_R: Record<NodeKind, number> = {
  person: 11,
  role: 7,
  project: 5.2,
  domain: 4.2,
  achievement: 3.6,
  tech: 2.6,
};

/**
 * The constellation, as SVG.
 *
 * ── Why SVG and not a canvas ──
 *
 * Because the texture painter replays the poster from the DOM, and it can read
 * an SVG's circles and paths but not another canvas's pixels (rule 3 above).
 * SVG also means the graph is laid out, scaled and clipped by the same browser
 * that lays out the rest of the sheet — no second coordinate system to keep in
 * agreement with the text beside it.
 *
 * ── Why the labels are HTML ──
 *
 * SVG <text> would need its own font handling in the painter. Absolutely
 * positioned spans are just more text, which the painter already reproduces
 * word for word, in the page's real fonts.
 *
 * ── Links are one path ──
 *
 * A couple of hundred <line>s would be a couple of hundred elements for the
 * painter to walk, style-read and stroke. One path with a move-and-line per
 * link is one element, one computed style, one stroke.
 */
function PosterGraph() {
  const palette = usePalette();
  const colors = palette.graph;
  const { projects } = useProjects();
  const roles = useRoles();
  const achievements = useAchievements();
  const profile = useProfile();

  const layout = useMemo(() => {
    /*
     * The same build and the same seeded solve the site uses, so this is the
     * same constellation — not a lookalike arranged for the poster. ~30ms for
     * ~150 nodes, once per mount, on a frame the click's glitch flash covers.
     */
    const graph = solveLayout(buildGraph(true, projects ?? undefined, { roles, achievements, profile }));
    let r = 1;
    for (const n of graph.nodes) r = Math.max(r, Math.hypot(n.x, n.y) + DOT_R[n.kind] + 4);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    let d = '';
    for (const l of graph.links) {
      const a = byId.get(l.source);
      const b = byId.get(l.target);
      if (a && b) d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return { nodes: graph.nodes, r, d };
  }, [projects, roles, achievements, profile]);

  const { nodes, r, d } = layout;
  const pct = (v: number) => `${(((v + r) / (2 * r)) * 100).toFixed(3)}%`;

  return (
    <div className="poster-graph" aria-hidden="true">
      <svg viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} width="100%" height="100%">
        {/*
          Links slightly stronger than the live graph's 8% alpha, which is tuned
          for additive WebGL lines overlapping in depth. Flat and alpha-blended,
          8% vanishes entirely; much more than this and the flat graph reads as
          a web of lines, which the live sphere never does at hero size.
        */}
        <path d={d} fill="none" stroke={colors.link} strokeOpacity={0.14} strokeWidth={0.9} />
        {nodes.map((n) => (
          <circle
            key={`h-${n.id}`}
            cx={n.x}
            cy={n.y}
            r={DOT_R[n.kind] * 2.3}
            fill={colors[n.kind]}
            fillOpacity={n.kind === 'person' ? 0.2 : 0.1}
          />
        ))}
        {nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={DOT_R[n.kind]} fill={colors[n.kind]} />
        ))}
      </svg>
      {nodes
        .filter((n) => LABELLED.has(n.kind))
        .map((n) => (
          <span
            key={`l-${n.id}`}
            className={`poster-graph__label poster-graph__label--${n.kind}`}
            /*
             * Offset from the node's percentage position in `em`, not a transform:
             * the painter reads each word's rect, and keeping labels
             * untransformed keeps that rect exactly where the text is. `em`
             * because the label size scales with the graph (see collapse.css),
             * and a fixed px gap would drift off the dot as the graph shrinks.
             */
            style={{ left: `calc(${pct(n.x)} + 0.9em)`, top: `calc(${pct(n.y)} - 0.5em)` }}
          >
            {n.label}
          </span>
        ))}
    </div>
  );
}

const ROCK_COUNT = 26;

/**
 * Every falling rock's numbers, worked out once at module load.
 *
 * ── Why this is not in the stylesheet ──
 *
 * The obvious version derives each rock's size and timing from its index inside
 * `calc()`, something like `calc(2px + (var(--i) % 4) * 2px)`. That does not
 * work, and it fails in a way worth writing down: CSS `calc()` has no modulo
 * operator, and `%` inside it is parsed as a PERCENTAGE SIGN. So every one of
 * those expressions was a syntax error, and the whole debris rule was thrown
 * away by the parser — no rocks, no warning at runtime, just nothing falling.
 *
 * (CSS Values 4 does add a real `mod()` function, but browser support is recent
 * enough that relying on it here would trade a visible bug for an invisible one
 * on older browsers.)
 *
 * Computed at module scope rather than in the component so the values are
 * stable for the life of the page: a rock that changed size on re-render
 * mid-fall would be a rock that teleports.
 *
 * ── Why this stopped looking like snow ──
 *
 * The first version of these was pale grey, evenly spaced, identically sized,
 * and set to `infinite`. That is a precise description of falling snow, which
 * is exactly what it looked like — and because it never stopped, it was still
 * gently drifting down long after the wall had hit the ground.
 *
 * Four things fix it, and all four matter:
 *
 *   · ONE SHOT. Rubble is thrown loose by an event and then it is over. A loop
 *     turns a consequence into weather.
 *   · UNEVEN SPACING. `i * 4.3%` puts a rock every 55px like a picket fence.
 *     The offset below breaks the grid up so they read as scattered.
 *   · MIXED MASS. Every fourth piece is a chunk several times the size of the
 *     grit around it, and falls faster. Uniform size is the single strongest
 *     snow signal there is.
 *   · DARK AND FAST. Stone is darker than the sky it falls against, not
 *     brighter, and it falls quickly enough to blur rather than drift.
 */
const ROCKS = Array.from({ length: ROCK_COUNT }, (_, i) => {
  /* Every fourth piece is a heavy chunk rather than grit. */
  const chunk = i % 4 === 1;
  /* Breaks the even spacing without randomness that could change per render. */
  const jitter = ((i * 37) % 11) - 5;

  return {
    x: `${1 + i * 3.7 + jitter * 0.6}%`,
    w: chunk ? `${7 + (i % 3) * 3}px` : `${2 + (i % 3)}px`,
    h: chunk ? `${5 + (i % 4) * 3}px` : `${2 + (i % 2)}px`,
    /*
     * Heavier pieces fall faster. Not strictly how gravity works — everything
     * falls at the same rate — but it is how falling debris READS, because the
     * big pieces in real footage are closer to camera and so cross the frame
     * sooner.
     */
    dur: chunk ? `${620 + (i % 4) * 90}ms` : `${820 + (i % 5) * 140}ms`,
    /*
     * Spread across the rumble so they arrive in a ragged stream rather than a
     * curtain. The longest delay plus the longest duration lands just after the
     * slam, so the last stone hits about when the wall does.
     */
    delay: `${(i % 9) * 170}ms`,
    drift: `${((i % 5) - 2) * 26}px`,
    spin: `${180 + (i % 5) * 140}deg`,
    /* Grit is dimmer than chunks, which catch a little more light on an edge. */
    tone: chunk ? 'rgba(128, 122, 112, 0.92)' : 'rgba(96, 92, 86, 0.8)',
  };
});

/**
 * Everything that happens to the screen rather than to the sheet: the glitch
 * that covers the swap, the falling debris, the dust at impact.
 *
 * ── Why the flash exists ──
 *
 * At the moment of the click the live page is replaced by the poster. They are
 * deliberately not identical — one has a running particle graph in it and the
 * other cannot — so the swap is a visible pop. Rather than hide it, it gets
 * covered by a two-frame chromatic glitch, which is the same visual language
 * the warning button has been twitching in since the visitor arrived. A tear in
 * the page is exactly what the button promised.
 *
 * ── Why the debris is markup and not particles ──
 *
 * Twenty-six spans on CSS keyframes cost nothing, need no render loop, and this
 * whole slice is still deliberately WebGL-free. The real particle system
 * arrives with the environment in slice 2, and it can take this over then.
 */
export function CollapseFX() {
  const phase = useCollapsePhase();
  if (phase === 'idle') return null;

  return (
    <>
      <div id="collapse-flash" aria-hidden="true" />
      <div id="collapse-debris" aria-hidden="true">
        {ROCKS.map((r, i) => (
          <span
            key={i}
            style={
              {
                '--x': r.x,
                '--w': r.w,
                '--h': r.h,
                '--dur': r.dur,
                '--delay': r.delay,
                '--drift': r.drift,
                '--spin': r.spin,
                '--tone': r.tone,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div id="collapse-dust" aria-hidden="true" />
    </>
  );
}