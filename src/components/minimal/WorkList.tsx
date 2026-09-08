'use client';

import { useMemo, useState } from 'react';
import { Reveal } from '@/components/core/Reveal';
import { type Project } from '@/lib/content';
import { useProjects } from '@/lib/useContent';
import { askAndScroll } from '@/lib/ask';

/**
 * A list, not a grid. Rows expand in place — no modal, no navigation, no
 * losing your scroll position. Featured projects lead and open by default,
 * because the engineering stories are the pitch.
 */
export function WorkList() {
  const { projects } = useProjects();
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(projects.filter((p) => p.featured).map((p) => p.slug)),
  );

  const domains = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of projects) for (const d of p.domains) count.set(d, (count.get(d) ?? 0) + 1);
    return Array.from(count.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([d]) => d);
  }, [projects]);

  const ordered = useMemo(() => {
    const sorted = [...projects].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    return filter ? sorted.filter((p) => p.domains.includes(filter)) : sorted;
  }, [filter, projects]);

  const toggle = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });

  return (
    <section id="work" className="shell scroll-mt-[96px] pt-[120px]">
      <Reveal>
        <h2 className="t-heading-lg text-bone">Work</h2>
      </Reveal>

      <Reveal delay={60}>
        <div className="mt-[24px] flex flex-wrap items-center gap-x-[18px] gap-y-[6px]">
          <FilterButton active={filter === null} onClick={() => setFilter(null)}>
            Everything
          </FilterButton>
          {domains.map((d) => (
            <FilterButton key={d} active={filter === d} onClick={() => setFilter(filter === d ? null : d)}>
              {d}
            </FilterButton>
          ))}
        </div>
      </Reveal>

      <div className="mt-[36px]">
        {ordered.map((p, i) => (
          <Row key={p.slug} project={p} open={open.has(p.slug)} onToggle={() => toggle(p.slug)} index={i} />
        ))}
        <div className="hairline" />
      </div>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tag transition-colors duration-200 ${
        active ? '!text-saffron' : 'hover:!text-bone'
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  project: p,
  open,
  onToggle,
  index,
}: {
  project: Project;
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  const panelId = `work-${p.slug}`;

  return (
    <Reveal delay={Math.min(index, 6) * 45}>
      <div className="hairline" />
      <div className="group py-[24px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full flex-col gap-[12px] text-left md:flex-row md:items-baseline md:justify-between md:gap-[36px]"
        >
          <span className="min-w-0 md:flex-1">
            <span className="t-heading-sm block text-bone transition-colors duration-200 group-hover:text-saffron">
              {p.name}
            </span>
            <span className="t-body mt-[6px] block max-w-[54ch] text-mist">{p.blurb}</span>
          </span>

          <span className="flex shrink-0 flex-wrap gap-x-[12px] gap-y-[2px] md:max-w-[260px] md:justify-end">
            {p.tech.slice(0, 4).map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
            {p.tech.length > 4 && <span className="tag">+{p.tech.length - 4}</span>}
          </span>
        </button>

        <div
          id={panelId}
          className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <div className="pt-[24px] md:pl-[0px]">
              <p className="t-caption text-ash">
                {p.context}, {p.year}
              </p>

              <div className="mt-[18px] grid gap-[24px] md:grid-cols-3 md:gap-[36px]">
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
                      <p className="t-caption mb-[6px] text-ash">{head}</p>
                      <p className="t-body text-mist">{text}</p>
                    </div>
                  ))}
              </div>

              {p.detail?.length ? (
                <div className="mt-[24px] max-w-[74ch] space-y-[12px]">
                  {p.detail.map((d, k) => (
                    <p key={k} className="t-body text-mist">
                      {d}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="mt-[24px] flex flex-wrap items-center gap-x-[24px] gap-y-[6px]">
                {p.links?.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="tag !text-saffron transition-opacity hover:opacity-70"
                  >
                    {l.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => askAndScroll(`Tell me more about ${p.name}`)}
                  className="tag transition-colors hover:!text-bone"
                >
                  Ask about this
                </button>
                <span className="tag">{p.tech.join(', ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
