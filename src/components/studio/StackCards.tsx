'use client';

import { useEffect, useState } from 'react';
import { CardSpotlight } from '@/components/studio/CardSpotlight';
import { useProjects } from '@/lib/useContent';

/**
 * Sticky offsets with cards scrolling over one another. Costs nothing — pure
 * sticky and transform, no scroll listener.
 *
 * Below 768px the sticky offsets collapse and the cards read as mush, so the
 * stacking is dropped entirely and the same content renders as a plain list.
 *
 * The content model is challenge → approach → outcome, not a feature list.
 * Nobody reads "built with FastAPI and React". Everyone reads "no vector
 * database supported Windows ARM64, so I wrote my own at 2am."
 *
 * ── Two things this component used to get wrong ──
 *
 * It imported `projects` straight out of content.ts, which meant the work
 * section rendered the build-time copy and silently ignored the admin panel —
 * the same class of bug useContent.ts documents at length. It now goes
 * through useProjects() like the graph does.
 *
 * And it sliced to the first six. Six was fine when there were fifteen
 * projects and the section was a sampler; it is wrong now that this is the
 * showcase. Every project gets a card.
 */

/** 'surface' is the page colour in either theme; the two accents stay saturated. */
const FILLS = ['surface', 'accent', 'surface', 'tertiary', 'surface', 'surface'] as const;

/**
 * How many cards deep the stack is allowed to get before the offsets stop
 * growing.
 *
 * Each card sits 22px below the one before it, so the peeking headers are a
 * running index of what you have already read. Unbounded, twenty-seven cards
 * would be 570px of stacked headers — the top of the stack would be off the
 * viewport before the last card arrived, and the card you are actually reading
 * would be squeezed into whatever is left. Past this depth every card sticks
 * at the same offset and cleanly covers its predecessor, which is the correct
 * behaviour anyway: nobody is scrubbing back to card three by its 4px sliver.
 */
const MAX_STACK_DEPTH = 5;

export function StackCards() {
  const [stack, setStack] = useState(false);
  const { projects } = useProjects();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setStack(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div className={stack ? '' : 'space-y-[24px]'}>
      {projects.map((p, i) => {
        const fill = FILLS[i % FILLS.length];
        const onAccent = fill !== 'surface';
        const depth = Math.min(i, MAX_STACK_DEPTH);
        return (
          <div
            key={p.slug}
            className={stack ? 'sticky' : ''}
            style={
              stack
                ? {
                    top: `${96 + depth * 22}px`,
                    marginBottom: i === projects.length - 1 ? 0 : 24,
                  }
                : undefined
            }
          >
            <CardSpotlight
              className={
                onAccent ? 'rounded-[24px] border border-ash/15' : 'glass-card glass-project rounded-[24px]'
              }
              tint={onAccent ? '#ffffff' : 'var(--accent)'}
            >
              <article
                className="p-[24px] md:p-[36px]"
                style={onAccent ? { background: `var(--${fill})` } : undefined}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
                  <h3 className={`t-heading-sm ${onAccent ? 'text-white' : 'text-bone'}`}>{p.name}</h3>
                  <p className={`t-caption ${onAccent ? 'text-white/70' : 'text-ash'}`}>
                    {p.context}, {p.year}
                  </p>
                </div>

                {/*
                  Not every project has all three columns — the smaller ones
                  are an approach and nothing else, and an empty "Challenge"
                  heading reads as a gap rather than as brevity. Filtering
                  first and gridding to the survivors means a one-column card
                  uses the full width instead of leaving two thirds blank.
                */}
                {(() => {
                  const cols = (
                    [
                      ['Challenge', p.challenge],
                      ['Approach', p.approach],
                      ['Outcome', p.outcome],
                    ] as const
                  ).filter(([, v]) => v);

                  const grid =
                    cols.length === 3
                      ? 'md:grid-cols-3'
                      : cols.length === 2
                        ? 'md:grid-cols-2'
                        : 'md:grid-cols-1';

                  return (
                    <div className={`mt-[24px] grid gap-[18px] ${grid} md:gap-[36px]`}>
                      {cols.map(([head, text]) => (
                        <div key={head}>
                          <p className={`t-caption mb-[6px] ${onAccent ? 'text-white/60' : 'text-ash'}`}>
                            {head}
                          </p>
                          <p
                            className={`t-body ${onAccent ? 'text-white/90' : 'text-mist'} ${
                              cols.length === 1 ? 'max-w-[68ch]' : ''
                            }`}
                          >
                            {text}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <p className={`t-caption mt-[24px] ${onAccent ? 'text-white/60' : 'text-ash'}`}>
                  {p.tech.join(', ')}
                </p>
              </article>
            </CardSpotlight>
          </div>
        );
      })}
    </div>
  );
}