// src/components/minimal/Hero.tsx
'use client';

import { lazy, Suspense, useState } from 'react';
import { Reveal } from '@/components/core/Reveal';
import { WhenVisible } from '@/components/core/WhenVisible';
import { GraphReadout } from '@/components/graph/GraphReadout';
import { profile } from '@/lib/content';
import { prefillAsk } from '@/lib/ask';
import { useProjects } from '@/lib/useContent';
import type { GraphNode } from '@/lib/graph';

/** Lazy so the constellation and its layout solver never touch the first paint. */
const Constellation = lazy(() =>
  import('@/components/graph/Constellation').then((m) => ({ default: m.Constellation })),
);

/**
 * The Hero → Ask AI scroll-exit slide (the globe sliding left as Hero
 * scrolled away) is gone. Ask AI has its own dedicated graph now — see
 * <AskGraph> in Home.tsx — so Hero's globe sliding off toward it no longer
 * makes sense; it'd read as two different globes chasing each other down the
 * page instead of one clear motif reappearing once. Hero's copy is back to
 * simply being Hero's copy.
 */
export function Hero() {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const { projects } = useProjects();

  const pick = (node: GraphNode | null) => {
    setSelected(node);
    if (node) prefillAsk(`Tell me about ${node.label}`);
  };

  const [first, ...rest] = profile.name.split(' ');

  return (
    <section className="shell pt-[120px] md:pt-[150px]">
      <div className="grid items-center gap-[36px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-[60px]">
        <div>
          <Reveal immediate>
            <h1 className="t-display text-bone">
              {first}
              <br />
              {rest.join(' ')}
            </h1>
          </Reveal>

          <Reveal immediate delay={80}>
            <p className="t-body mt-[24px] max-w-[480px] text-mist">{profile.positioning}</p>
          </Reveal>

          <Reveal immediate delay={140}>
            <p className="t-caption mt-[18px] text-ash">
              {profile.title}, {profile.location.split(',')[0]}. {profile.availability}
            </p>
          </Reveal>

          <Reveal immediate delay={200}>
            <div className="mt-[30px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px]">
              <a href="#ask" className="pill">
                Ask my AI about me
              </a>
              <a href={profile.resume} download className="ghost">
                Download resume
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal immediate delay={260} className="order-last">
          <WhenVisible rootMargin="300px" defer className="block">
            <Suspense fallback={<div className="aspect-square w-full lg:aspect-auto lg:h-[min(620px,68vh)]" aria-hidden />}>
              <Constellation
                className="aspect-square w-full lg:aspect-auto lg:h-[min(620px,68vh)]"
                projects={projects}
                onSelect={pick}
                selectedId={selected?.id ?? null}
                zoom={1.3}
              />
            </Suspense>
          </WhenVisible>
          <p className="t-caption mt-[6px] text-center text-ash lg:text-right">
            {selected ? 'Tap anywhere else to clear' : 'Every project, tool and domain. Tap a node.'}
          </p>
        </Reveal>
      </div>

      <GraphReadout node={selected} onDismiss={() => pick(null)} />
    </section>
  );
}