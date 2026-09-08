'use client';

import { useEffect, useState } from 'react';
import { CardSpotlight } from '@/components/studio/CardSpotlight';
import { projects } from '@/lib/content';

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
 */

/** 'surface' is the page colour in either theme; the two accents stay saturated. */
const FILLS = ['surface', 'accent', 'surface', 'tertiary', 'surface', 'surface'] as const;

export function StackCards() {
  const [stack, setStack] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setStack(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const shown = projects.slice(0, 6);

  return (
    <div className={stack ? '' : 'space-y-[24px]'}>
      {shown.map((p, i) => {
        const fill = FILLS[i % FILLS.length];
        const onAccent = fill !== 'surface';
        return (
          <div
            key={p.slug}
            className={stack ? 'sticky' : ''}
            style={stack ? { top: `${96 + i * 22}px`, marginBottom: i === shown.length - 1 ? 0 : 24 } : undefined}
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

                <div className="mt-[24px] grid gap-[18px] md:grid-cols-3 md:gap-[36px]">
                  {(
                    [
                      ['Challenge', p.challenge],
                      ['Approach', p.approach],
                      ['Outcome', p.outcome],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([head, text]) => (
                      <div key={head}>
                        <p className={`t-caption mb-[6px] ${onAccent ? 'text-white/60' : 'text-ash'}`}>
                          {head}
                        </p>
                        <p className={`t-body ${onAccent ? 'text-white/90' : 'text-mist'}`}>{text}</p>
                      </div>
                    ))}
                </div>

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