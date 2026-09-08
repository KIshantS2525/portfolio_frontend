// src/components/graph/AskGraph.tsx
import { lazy, Suspense } from 'react';
import { WhenVisible } from '@/components/core/WhenVisible';
import { useProjects } from '@/lib/useContent';

/** Lazy for the same reason every three.js entry point on this site is: it never touches first paint. */
const Constellation = lazy(() =>
  import('@/components/graph/Constellation').then((m) => ({ default: m.Constellation })),
);

/**
 * The graph, again — smaller, decorative, non-interactive, filling the blank
 * space beside the Ask AI card.
 *
 * This is a second <Constellation> instance rather than the Hero's globe
 * relocated: the Hero's copy stays exactly where it is (still the first
 * thing a visitor sees), and this one exists purely as the "everything is
 * connected" motif recurring in the empty space next to Ask AI, the way
 * Dala's brain isn't a single element chasing you down the page but a shape
 * that keeps reappearing. It never receives a selection, so no click handler,
 * no readout beneath it — it's texture, not another control surface.
 *
 * The slow side-to-side drift on top of Constellation's own auto-rotate is
 * what stands in for "the half-turn moving across the screen" — a small,
 * continuous wobble rather than anything scroll-jacked, so it costs nothing
 * to keep animating and never fights the page's own scroll.
 */
export function AskGraph({ className = '' }: { className?: string }) {
  const { projects } = useProjects();

  return (
    <div className={`ask-graph-drift ${className}`}>
      <WhenVisible rootMargin="300px" defer className="block">
        <Suspense fallback={<div className="aspect-square w-full" aria-hidden />}>
          <Constellation className="aspect-square w-full" projects={projects} intensity={0.85} zoom={1.15} />
        </Suspense>
      </WhenVisible>
    </div>
  );
}