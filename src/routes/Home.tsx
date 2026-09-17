// src/routes/Home.tsx
import { lazy, Suspense } from 'react';
import { StudioNav } from '@/components/studio/StudioNav';
import { StackCards } from '@/components/studio/StackCards';
import { ScrollExpand } from '@/components/studio/ScrollExpand';
import { CardSpotlight } from '@/components/studio/CardSpotlight';
import { Stack } from '@/components/minimal/Stack';
import { About } from '@/components/minimal/About';
import { Contact } from '@/components/minimal/Contact';
import { Footer } from '@/components/core/Footer';
import { WhenVisible } from '@/components/core/WhenVisible';
import { Reveal } from '@/components/core/Reveal';
import { useProjects } from '@/lib/useContent';
import { useProfile } from '@/lib/useContent';
import { ArchiveDoor } from '@/components/archive/ArchiveDoor';
import { GameDoor } from '@/components/game/GameDoor';
import { CollapseFX, CollapsePoster } from '@/components/collapse/CollapsePoster.tsx';
import { CollapseSequence } from '@/components/collapse/CollapseSequence';
import { useCollapseActive } from '@/lib/collapseState';

/** Lazy for the same reason every three.js entry point on this site is: it never touches first paint. */
const GraphJourney = lazy(() =>
  import('@/components/graph/GraphJourney').then((m) => ({ default: m.GraphJourney })),
);

/**
 * Home. The only route.
 *
 * Hero, Ask AI, Metrics, and Proof used to be four separate sections, two of
 * which had their own <Constellation> instance. They're gone as standalone
 * sections now — <GraphJourney> owns that entire span as one continuous,
 * pinned scroll sequence built around a single graph that travels, turns,
 * scatters, and reassembles, with each of those four pieces of content
 * overlaid on it at the right moment rather than living in their own
 * document-flow sections. See GraphJourney.tsx for the actual sequence.
 *
 * Everything from "Work" down is unchanged: normal document flow, no pinning.
 */
export default function Home() {
  const profile = useProfile();
  const { projects } = useProjects();
  const collapsing = useCollapseActive();

  return (
    <>
      <StudioNav />

      {/*
        ── The collapse structure ──

        Four nested elements, and every one earns its place. This is not
        defensive nesting; each solves a specific failure seen on this page.

          #collapse-viewport  fixed and viewport-sized once active, and owner of
                              the `perspective`.

                              It has to be fixed and explicitly sized because
                              `perspective` makes an element the containing block
                              for its fixed descendants — the same rule as
                              `transform` and `backdrop-filter`, already
                              documented on SiteChrome for PullCord. As a
                              normal-flow div its only child is pinned, so it has
                              ZERO height, and everything inside resolving
                              `inset: 0` against it collapsed to nothing: the
                              starfield vanished and the sheet anchored to the
                              top of an empty box instead of the screen.

          #collapse-stage     position and scale, origin TOP CENTRE. That origin
                              is what makes the fit arithmetic in paperRecede.ts
                              simple enough to read.

          #collapse-sheet     rotation only, origin BOTTOM CENTRE — a wall falls
                              around its base, and that is the difference between
                              a collapse and a spin. Two origins cannot live on
                              one element, which is the only reason this is two
                              elements rather than one.

          #collapse-live      the real page. Hidden the instant the sequence
                              starts, because the poster replaces it.

        <CollapsePoster> is what actually falls. The live page cannot be the
        sheet: <main> here is ~1100vh, but nearly all of that is scroll runway
        for GraphJourney's pinned sequence rather than content, so a sheet made
        of the real document would be one hero screen, ten screens of black, and
        the rest crammed at the bottom. See CollapsePoster.tsx.

        <CollapseSequence> renders #collapse-world, the WebGL layer, as a
        SIBLING before the viewport rather than inside it. The viewport is a
        preserve-3d rendering context, and anything inside one is depth-sorted
        against the transformed sheet — a canvas at z = 0 would be sorted in
        FRONT of a sheet that has fallen to negative z, and the fallen poster
        would vanish behind the sky it is supposed to be lying under. Outside the
        context it is plain z-index stacking, which cannot reorder itself.

        <StudioNav> and <Footer> stay outside on purpose. The nav is fixed, so it
        is not part of the sheet that falls; the footer is below the fold and
        would only add height to a surface nobody sees the bottom of. (It is
        hidden by collapse.css during the sequence, since with the stage pinned
        it would otherwise ride up under the nav.)
      */}
      <CollapseSequence />

      <div id="collapse-viewport">
        <div id="collapse-stage">
          <div id="collapse-sheet">
            <div id="collapse-live">
              <main>
                {/*
                  No `defer` here, unlike every other lazy three.js mount on this
                  site — this is the first thing on the page now (it absorbed
                  Hero), so it has to exist in the DOM immediately rather than
                  waiting for an intersection that, for above-the-fold content,
                  would just be waiting on itself. The Suspense boundary still
                  keeps the heavy three.js chunk out of the initial bundle either
                  way.
                */}
                {/*
                  Unmounted — not hidden — for the whole collapse.

                  Through slice 1 this stayed mounted under `display: none`, which
                  stopped it painting but left ForceGraph3D's renderer, its context
                  and its frame loop alive underneath the sequence. The world needs
                  its own context, and two at once is Risk 1 in the handover. So it
                  goes the moment the phase leaves idle, and CollapseSequence
                  releases the orphaned context explicitly before creating its own.

                  The placeholder is the same 1100vh block as the Suspense fallback
                  so document height does not change while collapsed: the exit
                  restores the visitor's scroll offset, and it can only land there
                  if the runway above it is still the same length.
                */}
                <WhenVisible>
                  {collapsing ? (
                    <div className="bg-void" style={{ height: '1100vh' }} aria-hidden />
                  ) : (
                    <Suspense
                      fallback={<div className="bg-void" style={{ height: '1100vh' }} aria-hidden />}
                    >
                      <GraphJourney projects={projects} />
                    </Suspense>
                  )}
                </WhenVisible>

                {/* Work */}
                <section id="work" className="shell scroll-mt-[96px] pt-[120px]">
                  <Reveal>
                    <h2 className="t-heading-lg mb-[36px] text-bone">Work</h2>
                  </Reveal>
                  <StackCards />
                </section>

                {/* Feature */}
                <section className="shell pt-[120px]">
                  <Reveal>
                    <CardSpotlight className="rounded-[24px] border border-ash/15 p-[30px]">
                      <h2 className="t-heading-lg text-bone">DiagramStudio</h2>
                      <p className="t-body mt-[12px] max-w-[54ch] text-mist">
                        A hand-written lexer, parser and resolver compiling a custom DSL to a layout
                        graph. Live at{' '}
                        <a
                          href={profile.liveProject}
                          target="_blank"
                          rel="noreferrer"
                          className="text-saffron transition-opacity hover:opacity-70"
                        >
                          diagramstudio.in
                        </a>
                        .
                      </p>
                    </CardSpotlight>
                  </Reveal>
                  <div className="mt-[36px]">
                    <WhenVisible rootMargin="200px">
                      <ScrollExpand
                        src="/studio/diagramstudio-hero.svg"
                        alt="The DiagramStudio canvas with an architecture diagram open"
                        caption="Placeholder. Replace with a 2400px-wide screenshot of the real canvas."
                      />
                    </WhenVisible>
                  </div>
                </section>

                {/*
                  The standalone <ParticleKnight> demo used to sit here — its own canvas,
                  its own 856KB GLB, its own copy of three.js behaviour, showing the same
                  object the scroll journey ends on. Two knights on one page is one
                  knight too many: the finale stops being a payoff if the reader has
                  already met the piece in a box with a caption under it. The component
                  is still in src/components/knight if it is ever wanted elsewhere;
                  nothing imports it now, so it costs nothing to keep.
                */}

                <Stack />
                <About />
                <Contact />

                {/*
                  The door sits here, at the bottom, on purpose. Anyone who has read
                  this far is already invested, and the archive is a reward rather
                  than a fork in the road — putting it in the nav would ask every
                  arriving visitor to choose between two experiences before they have
                  seen either.
                */}
                <section className="shell flex flex-wrap gap-[16px] pt-[96px]">
                  <ArchiveDoor />
                  <GameDoor />
                </section>
              </main>
            </div>

            <CollapsePoster />
          </div>
        </div>

        {/*
          Screen-space effects: the glitch that covers the live-to-poster swap,
          the falling debris, the dust at impact. Outside the stage because they
          belong to the camera rather than to the sheet — anything inside the
          stage inherits the sheet's scale and rotation, and dust that tips over
          with the wall is not dust.
        */}
        <CollapseFX />
      </div>

      <Footer />
    </>
  );
}