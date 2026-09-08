'use client';

import { lazy, Suspense, useState } from 'react';
import { WhenVisible } from '@/components/core/WhenVisible';
import { GraphReadout } from '@/components/graph/GraphReadout';
import { prefillAsk } from '@/lib/ask';
import { useProjects } from '@/lib/useContent';
import type { GraphNode } from '@/lib/graph';

/** Lazy so the constellation and its layout solver never touch the first paint. */
const Constellation = lazy(() =>
  import('@/components/graph/Constellation').then((m) => ({ default: m.Constellation })),
);

export function StudioGraph() {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const { projects } = useProjects();

  return (
    <>
      <WhenVisible rootMargin="300px" defer className="block">
        <Suspense fallback={<div className="h-[min(78vh,760px)] w-full" aria-hidden />}>
          <Constellation
            className="h-[min(78vh,760px)] w-full"
            projects={projects}
            intensity={1.35}
            zoom={1.3}
            onSelect={(n) => {
              setSelected(n);
              if (n) prefillAsk(`Tell me about ${n.label}`);
            }}
            selectedId={selected?.id ?? null}
          />
        </Suspense>
      </WhenVisible>
      <div className="shell">
        <GraphReadout node={selected} onDismiss={() => setSelected(null)} />
      </div>
    </>
  );
}