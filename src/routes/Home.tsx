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

  return (
    <>
      <StudioNav />

      <main>
        {/*
          No `defer` here, unlike every other lazy three.js mount on this
          site — this is the first thing on the page now (it absorbed Hero),
          so it has to exist in the DOM immediately rather than waiting for
          an intersection that, for above-the-fold content, would just be
          waiting on itself. The Suspense boundary still keeps the heavy
          three.js chunk out of the initial bundle either way.
        */}
        <WhenVisible>
          <Suspense fallback={<div className="bg-void" style={{ height: '1100vh' }} aria-hidden />}>
            <GraphJourney projects={projects} />
          </Suspense>
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
                A hand-written lexer, parser and resolver compiling a custom DSL to a layout graph.
                Live at{' '}
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

      <Footer />
    </>
  );
}