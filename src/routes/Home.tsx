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
import { profile } from '@/lib/content';

/** Lazy for the same reason every three.js entry point on this site is: it never touches first paint. */
const GraphJourney = lazy(() =>
  import('@/components/graph/GraphJourney').then((m) => ({ default: m.GraphJourney })),
);

/**
 * Same treatment. This one carries its own 856KB model on top of the three.js
 * chunk, so it is deferred as well as lazy — the import does not fire until the
 * section is within 200px of the viewport, which for a section this far down
 * the page means most visitors never pay for it at all.
 */
const ParticleKnight = lazy(() =>
  import('@/components/knight/ParticleKnight').then((m) => ({ default: m.ParticleKnight })),
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
          The knight. A fixed height on the wrapper is not optional: the canvas
          fills its parent, and a parent that derives its height from its
          children collapses to zero — which renders nothing, silently, with no
          error in the console.
        */}
        <section className="shell pt-[120px]">
          <Reveal>
            <h2 className="t-heading-lg text-bone">Knight</h2>
            <p className="t-body mt-[12px] max-w-[54ch] text-mist">
              16,000 particles sampled from the surface of a 3D mesh. Drag to turn it.
            </p>
          </Reveal>
          <WhenVisible defer rootMargin="200px" className="mt-[36px]">
            <Suspense fallback={<div className="rounded-[24px] bg-void" style={{ height: '80vh' }} aria-hidden />}>
              <div className="overflow-hidden rounded-[24px]" style={{ height: '80vh' }}>
                <ParticleKnight />
              </div>
            </Suspense>
          </WhenVisible>
        </section>

        <Stack />
        <About />
        <Contact />
      </main>

      <Footer />
    </>
  );
}