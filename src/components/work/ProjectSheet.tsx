// src/components/work/ProjectSheet.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '@/lib/content';
import { askAndScroll } from '@/lib/ask';

/**
 * The full story of one project, in a sheet from the right.
 *
 * The timeline only carries year, name and context; this is where challenge,
 * approach, outcome, the longer notes, the stack and the links live. Previous
 * and next walk the same order as the timeline, so a reader can go through the
 * whole body of work without closing it.
 *
 * Closes on Escape, the backdrop and the close button; ← and → page. While it
 * is open the page underneath does not scroll: wheel and touch events are
 * stopped at the overlay before Lenis (listening on window) can see them, and
 * the sheet's own body scrolls natively.
 */
export function ProjectSheet({
  projects,
  index,
  onIndex,
  onClose,
}: {
  projects: Project[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  // Keep the last project mounted through the exit animation.
  const [shown, setShown] = useState<number | null>(index);
  const [entered, setEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      if (shown === null) returnFocus.current = document.activeElement as HTMLElement | null;
      setShown(index);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => {
      setShown(null);
      returnFocus.current?.focus({ preventScroll: true });
    }, 420);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  // New project → back to the top of the body.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && index! < projects.length - 1) onIndex(index! + 1);
      else if (e.key === 'ArrowLeft' && index! > 0) onIndex(index! - 1);
    };
    window.addEventListener('keydown', onKey);

    const root = rootRef.current;
    const stop = (e: Event) => e.stopPropagation();
    root?.addEventListener('wheel', stop, { passive: true });
    root?.addEventListener('touchmove', stop, { passive: true });
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      root?.removeEventListener('wheel', stop);
      root?.removeEventListener('touchmove', stop);
    };
  }, [open, index, projects.length, onClose, onIndex]);

  if (shown === null || typeof document === 'undefined') return null;
  const p = projects[shown];
  if (!p) return null;

  const sections = (
    [
      ['Challenge', p.challenge],
      ['Approach', p.approach],
      ['Outcome', p.outcome],
    ] as const
  ).filter(([, v]) => v);

  return createPortal(
    <div
      ref={rootRef}
      className="sheet-root fixed inset-0 z-[80]"
      data-open={entered && open ? '' : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
    >
      <div className="sheet-backdrop absolute inset-0" onClick={onClose} aria-hidden />

      <aside className="sheet-panel absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-[12px] px-[24px] pb-[12px] pt-[20px] md:px-[40px]">
          <p className="text-[13px] tabular-nums text-ash">
            {shown + 1} of {projects.length}
          </p>
          <div className="flex items-center gap-[6px]">
            <IconButton
              label="Previous project"
              disabled={shown === 0}
              onClick={() => onIndex(shown - 1)}
              d="M14.5 6 8.5 12l6 6"
            />
            <IconButton
              label="Next project"
              disabled={shown === projects.length - 1}
              onClick={() => onIndex(shown + 1)}
              d="m9.5 6 6 6-6 6"
            />
            <span className="mx-[6px] h-[20px] w-px bg-[var(--hairline)]" aria-hidden />
            <IconButton refEl={closeRef} label="Close" onClick={onClose} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
          </div>
        </div>

        <div
          ref={bodyRef}
          data-lenis-prevent
          className="flex-1 overflow-y-auto overscroll-contain px-[24px] pb-[48px] md:px-[40px]"
        >
          <div key={p.slug} className="sheet-content">
            <p className="mt-[24px] text-[14px] tabular-nums text-saffron">{p.year}</p>
            <h3 id="sheet-title" className="t-heading mt-[8px] text-bone">
              {p.name}
            </h3>
            <p className="t-caption mt-[10px] text-ash">{p.context}</p>
            <p className="mt-[24px] text-[clamp(18px,1.4vw,21px)] font-[300] leading-[1.45] text-bone sheet-lede">
              {p.blurb}
            </p>

            {sections.length > 0 && (
              <dl className="mt-[36px] space-y-[28px] border-t border-[var(--hairline)] pt-[28px]">
                {sections.map(([head, text]) => (
                  <div key={head} className="grid gap-[6px] md:grid-cols-[110px_1fr] md:gap-[24px]">
                    <dt className="t-caption pt-[4px] text-ash">{head}</dt>
                    <dd className="t-body text-mist">{text}</dd>
                  </div>
                ))}
              </dl>
            )}

            {p.detail && p.detail.length > 0 && (
              <div className="mt-[28px] space-y-[14px] border-t border-[var(--hairline)] pt-[28px] md:pl-[134px]">
                {p.detail.map((d, i) => (
                  <p key={i} className="t-body text-mist">
                    {d}
                  </p>
                ))}
              </div>
            )}

            {p.tech.length > 0 && (
              <div className="mt-[28px] border-t border-[var(--hairline)] pt-[28px] md:grid md:grid-cols-[110px_1fr] md:gap-[24px]">
                <p className="t-caption pt-[6px] text-ash">Built with</p>
                <ul className="mt-[10px] flex flex-wrap gap-[6px] md:mt-0">
                  {p.tech.map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-[var(--hairline)] px-[12px] py-[5px] text-[13px] text-mist"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-[40px] flex flex-wrap items-center gap-x-[28px] gap-y-[6px]">
              <button
                type="button"
                className="pill"
                onClick={() => {
                  onClose();
                  window.setTimeout(() => askAndScroll(`Tell me more about ${p.name}`), 80);
                }}
              >
                Ask my AI about this
              </button>
              {p.links?.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="ghost">
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function IconButton({
  label,
  onClick,
  d,
  disabled,
  refEl,
}: {
  label: string;
  onClick: () => void;
  d: string;
  disabled?: boolean;
  refEl?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={refEl}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[38px] items-center justify-center rounded-full border border-[var(--hairline)] text-mist transition-colors hover:border-ash hover:text-bone disabled:pointer-events-none disabled:opacity-30"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
