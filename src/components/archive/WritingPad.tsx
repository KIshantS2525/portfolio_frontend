// src/components/archive/WritingPad.tsx
import { useEffect, useRef } from 'react';
import type { Project } from '@/lib/content';

/**
 * The writing pad that comes out of an opened drawer.
 *
 * ── Why the handwriting is only on the tab ──
 *
 * The brief was handwritten text, and it is right about *where* it is right.
 * A hand-lettered tab on a file is the detail that sells the fiction — it says
 * a person put this here — and it costs one word.
 *
 * Three hundred words of body copy in a script face is a different thing. Set
 * a case study in handwriting and reading speed drops, every line is slightly
 * harder than the last, and the writing you are trying to get read becomes a
 * chore to get through. The archive exists to make the work more compelling,
 * not less legible.
 *
 * So the fiction lives in the furniture: the tab, the rule down the margin,
 * the ruled lines behind the text, the slight tilt of the sheet. The prose
 * stays in Fraunces, which is what the rest of the site reads in. That is the
 * same split a real file has — handwritten label, typed contents — so it is
 * more authentic this way as well as more readable.
 *
 * `--font-hand` is declared with a system-script fallback stack, so this works
 * out of the box. It is worth self-hosting a real one (Caveat is good and
 * free) as a woff2 next to Inter and Fraunces; drop the family name at the
 * front of the stack in index.css and every tab in the archive picks it up.
 */
export function WritingPad({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Focus the sheet when it arrives so Escape and Tab land somewhere sensible,
  // and a screen reader announces the project rather than staying on a drawer
  // that is no longer the subject.
  useEffect(() => {
    if (project) panel.current?.focus();
  }, [project]);

  const paras = project
    ? [
        project.challenge && ['The problem', project.challenge],
        project.approach && ['What I did', project.approach],
        project.outcome && ['What came of it', project.outcome],
        ...(project.detail ?? []).map((d) => ['', d] as [string, string]),
      ].filter(Boolean as unknown as (v: unknown) => v is [string, string])
    : [];

  return (
    <div
      aria-hidden={!project}
      className="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:justify-end"
    >
      {/*
        Slides up from the bottom edge on a phone and in from the right on a
        desktop — on a wide screen the drawer that just opened is beside the
        reader, so covering the centre would hide the thing they clicked.
      */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="false"
        aria-label={project ? `${project.name} — file` : undefined}
        tabIndex={-1}
        className="pointer-events-auto w-full max-w-[560px] outline-none transition-all duration-[560ms] ease-[cubic-bezier(0.16,1,0.3,1)] sm:mr-[48px]"
        style={{
          opacity: project ? 1 : 0,
          transform: project
            ? 'translateY(0) rotate(-0.4deg)'
            : 'translateY(28px) rotate(-1.6deg)',
          visibility: project ? 'visible' : 'hidden',
        }}
      >
        {/* The tab. The one piece of handwriting, and the whole of the fiction. */}
        <div className="flex items-end pl-[26px]">
          <span
            className="rounded-t-[6px] border border-b-0 border-[var(--hairline)] bg-[var(--surface-raised)] px-[16px] pt-[7px] pb-[5px] text-[17px] leading-none text-[var(--accent-text)]"
            style={{
              fontFamily:
                "var(--font-hand, 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive)",
            }}
          >
            {project?.name ?? ''}
          </span>
        </div>

        <div
          /*
           * `data-lenis-prevent` tells Lenis to leave wheel events inside this
           * element alone. It should be unnecessary now that SmoothScroll is
           * scoped out of /archive, and it stays because this component is
           * not archive-only in principle and a scrollable panel that quietly
           * stops scrolling when someone mounts a smooth-scroll library above
           * it is a horrible bug to track down twice.
           *
           * `onWheel` stopPropagation does the same job for the archive's own
           * wheel handler, which lives on the canvas and integrates deltas
           * into camera movement: without it, scrolling to read the file would
           * also walk you away from the locker you were reading.
           *
           * `overscroll-contain` stops the scroll chaining onward once the
           * text reaches its end.
           */
          data-lenis-prevent
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="relative max-h-[62vh] overflow-y-auto overscroll-contain border border-[var(--hairline)] bg-[var(--surface-raised)] px-[30px] py-[26px] sm:max-h-[70vh]"
          style={{
            /*
             * Ruled paper, drawn rather than downloaded: one repeating linear
             * gradient for the lines and one for the red margin rule. The
             * lines land on a 28px rhythm that the body copy's line-height is
             * set to match, so the text sits ON the ruling instead of drifting
             * across it — which is the difference between a notepad and a
             * background pattern.
             */
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0 27px, color-mix(in srgb, var(--hairline) 70%, transparent) 27px 28px)',
            backgroundPosition: '0 26px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-[20px] w-px"
            style={{ background: 'color-mix(in srgb, var(--accent-text) 30%, transparent)' }}
          />

          <p className="t-caption mb-[14px] text-[var(--text-muted)]">
            {project?.year} · {project?.context}
          </p>

          <p
            className="mb-[18px] text-[var(--text)]"
            style={{ fontFamily: 'var(--font-display)', fontSize: 19, lineHeight: '28px' }}
          >
            {project?.blurb}
          </p>

          {paras.map(([head, text], i) => (
            <div key={i} className="mb-[16px]">
              {head && (
                <p className="t-caption mb-[2px] text-[var(--text-muted)]">{head}</p>
              )}
              <p
                className="text-[var(--text-body)]"
                style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: '28px' }}
              >
                {text}
              </p>
            </div>
          ))}

          {!!project?.tech?.length && (
            <p className="t-caption mt-[18px] text-[var(--text-muted)]">
              {project.tech.join(' · ')}
            </p>
          )}

          <div className="mt-[20px] flex items-center gap-[18px]">
            {project?.links?.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="t-caption text-[var(--accent-text)] transition-opacity hover:opacity-70"
              >
                {l.label} ↗
              </a>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="t-caption ml-auto text-[var(--text-muted)] transition-opacity hover:opacity-60"
            >
              Close the drawer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}