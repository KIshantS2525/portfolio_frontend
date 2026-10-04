// src/components/work/ProjectTimeline.tsx
'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Project } from '@/lib/content';
import { useProjects } from '@/lib/useContent';
import { ProjectSheet } from '@/components/work/ProjectSheet';
import { Rocket } from '@/components/space/Rocket';

const PUFFS = 12;

/**
 * Work, as a timeline.
 *
 * Replaces the stacked challenge/approach/outcome cards. Twenty-seven of those
 * in a row was a wall: every project shouted at the same volume, and the
 * reader had to scroll through all of them to find the two they cared about.
 * The timeline shows only what is needed to choose — year, name, where it was
 * built — and everything else moves into a sheet that opens on click.
 *
 * Desktop: the section pins and vertical scroll drives the rail sideways.
 * Items alternate above and below one line, so neighbours interleave and the
 * rail is half as long as a single row would be. Each item draws itself as it
 * crosses into view — connector, dot, then the text rising out of a mask —
 * and the accent line follows the reading head.
 *
 * Every value is a pure function of scroll position, read in one rAF loop off
 * getBoundingClientRect. No scroll library: the graph above this section is
 * lazy and 900vh tall, so anything that caches trigger positions at mount
 * would be wrong the moment it loads. Measuring per frame cannot go stale.
 *
 * Below 768px it is a vertical timeline instead — pinning a horizontal track
 * on a phone is scroll-jacking for no gain.
 */

/** Horizontal distance between consecutive items (they alternate sides, so same-side items are 2× apart). */
const STEP = 'clamp(150px, 12.5vw, 230px)';
/** Item width: almost two steps, so same-side neighbours never collide. */
const ITEM_W = `calc(${STEP} * 2 - 28px)`;

const yearKey = (y: string) => {
  const n = parseInt(y.match(/\d{4}/)?.[0] ?? '0', 10);
  return /present|now/i.test(y) ? n + 0.5 : n;
};
const firstYear = (y: string) => y.match(/\d{4}/)?.[0] ?? y;

function useMedia(query: string) {
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatch(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [query]);
  return match;
}

export function ProjectTimeline() {
  const { projects } = useProjects();
  // Oldest first, so the line reads left to right as a career. Stable within
  // a year, which keeps the content file's own ordering (featured first).
  const items = useMemo(
    () =>
      projects
        .map((p, i) => ({ p, i }))
        .sort((a, b) => yearKey(a.p.year) - yearKey(b.p.year) || a.i - b.i)
        .map(({ p }) => p),
    [projects],
  );
  const [open, setOpen] = useState<number | null>(null);
  const desktop = useMedia('(min-width: 768px)');

  const span = useMemo(() => {
    if (!items.length) return '';
    const a = firstYear(items[0].year);
    const last = items[items.length - 1].year;
    const b = /present|now/i.test(last) ? 'now' : firstYear(last);
    return a === b ? a : `${a} to ${b}`;
  }, [items]);

  return (
    <>
      {desktop ? (
        <HorizontalTimeline items={items} span={span} onOpen={setOpen} />
      ) : (
        <VerticalTimeline items={items} span={span} onOpen={setOpen} />
      )}
      <ProjectSheet
        projects={items}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/* ── Desktop ─────────────────────────────────────────────────────────── */

function HorizontalTimeline({
  items,
  span,
  onOpen,
}: {
  items: Project[];
  span: string;
  onOpen: (i: number) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const rocketRef = useRef<HTMLDivElement>(null);
  const puffRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const [year, setYear] = useState(() => (items[0] ? firstYear(items[0].year) : ''));

  // Section height = horizontal travel + one screen, so the pin lasts exactly
  // as long as the track takes to cross.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const travel = Math.max(0, track.scrollWidth - window.innerWidth);
      setHeight(travel + window.innerHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [items.length]);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const rail = railRef.current;
    if (!section || !track || !rail) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let running = false;
    const last: string[] = [];
    let lastHead = '';
    let lastYear = '';

    /*
     * The rocket rides the head of the line, so the accent line behind it is
     * its exhaust trail: the rocket is literally drawing the career. Its
     * attitude is a little physics — speed is smoothed from scroll, the
     * flame grows with it, the body stretches with it, and the lean is a
     * damped spring, so a sudden stop makes it nod and wobble before it
     * settles, the way a cartoon would.
     */
    let lastX = -1;
    let lastT = 0;
    let speed = 0;
    let lean = 0;
    let leanV = 0;
    let puffAt = 0;
    let puffIdx = 0;

    const tick = (now: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = section.getBoundingClientRect();
      const travel = Math.max(0, track.scrollWidth - vw);
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - vh)));
      const x = -p * travel;
      track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;

      const railLeft = rail.offsetLeft + x;
      const railW = rail.offsetWidth;

      // The accent line runs up to the reading head at 70% of the screen.
      const head = Math.min(1, Math.max(0, (vw * 0.7 - railLeft) / Math.max(1, railW)));
      const headS = head.toFixed(4);
      if (headS !== lastHead && headRef.current) {
        headRef.current.style.transform = `scaleX(${headS})`;
        lastHead = headS;
      }

      const rocket = rocketRef.current;
      if (rocket) {
        const rx = head * railW;
        const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
        lastT = now;
        const v = lastX < 0 ? 0 : (rx - lastX) / Math.max(dt, 1e-3);
        lastX = rx;
        speed += (v - speed) * Math.min(1, dt * 9);
        const sp = Math.abs(speed);
        const f = dt * 60;
        // Nose lifts a touch under thrust; the spring overshoots on a stop.
        // Level flight: no nose-up lean on scroll.
        const want = 0;
        leanV += (want - lean) * 0.09 * f;
        leanV *= Math.pow(0.82, f);
        lean += leanV * f;
        const sx = reduced ? 1 : 1 + Math.min(0.2, sp / 2600);
        const bob = reduced ? 0 : Math.sin(now / 420) * 1.6 * (1 - Math.min(1, sp / 300));
        rocket.style.transform = `translate3d(${rx.toFixed(1)}px, ${bob.toFixed(2)}px, 0)`;
        rocket.style.setProperty('--lean', `${lean.toFixed(2)}deg`);
        rocket.style.setProperty('--sx', sx.toFixed(3));
        rocket.style.setProperty('--sy', (1 / Math.sqrt(sx)).toFixed(3));
        rocket.style.setProperty('--boost', (0.55 + Math.min(1.3, sp / 650)).toFixed(3));

        // Smoke, left behind on the line while it is moving.
        if (!reduced && sp > 70 && now - puffAt > 70) {
          puffAt = now;
          const puff = puffRefs.current[puffIdx];
          puffIdx = (puffIdx + 1) % PUFFS;
          if (puff) {
            puff.classList.remove('go');
            puff.style.left = `${(rx - 8).toFixed(1)}px`;
            puff.style.setProperty('--dx', `${(-18 - Math.random() * 30).toFixed(0)}px`);
            puff.style.setProperty('--dy', `${((Math.random() - 0.5) * 26).toFixed(0)}px`);
            void puff.offsetWidth;
            puff.classList.add('go');
          }
        }
      }

      let current = '';
      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const sx = railLeft + el.offsetLeft;
        // 0 as the item enters at the right edge, 1 by the time it is a
        // third of the way in. Smoothstepped so the draw decelerates.
        const lin = reduced ? 1 : Math.min(1, Math.max(0, (vw * 0.94 - sx) / (vw * 0.3)));
        const r = lin * lin * (3 - 2 * lin);
        const v = r.toFixed(3);
        if (last[i] !== v) {
          el.style.setProperty('--r', v);
          last[i] = v;
        }
        if (sx < vw * 0.55) current = firstYear(items[i]?.year ?? '');
      }
      if (!current && items[0]) current = firstYear(items[0].year);
      if (current !== lastYear) {
        lastYear = current;
        setYear(current);
      }

      raf = requestAnimationFrame(tick);
    };

    // Only run while the section is anywhere near the screen.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(tick);
        } else if (!e.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(section);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [items]);

  /**
   * Keyboard: the items live inside a transformed track, so the browser's
   * own scroll-into-view on focus cannot reach them. Scroll the page to the
   * position at which the focused item sits at 40% of the screen instead.
   */
  const focusItem = (i: number) => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const rail = railRef.current;
    const el = itemRefs.current[i];
    if (!section || !track || !rail || !el) return;
    const vw = window.innerWidth;
    const travel = Math.max(1, track.scrollWidth - vw);
    const want = rail.offsetLeft + el.offsetLeft - vw * 0.4;
    const p = Math.min(1, Math.max(0, want / travel));
    const top = section.getBoundingClientRect().top + window.scrollY;
    const target = top + p * (section.offsetHeight - window.innerHeight);
    if (Math.abs(window.scrollY - target) > 4) window.scrollTo({ top: target, behavior: 'instant' });
  };

  // Group boundaries, for the year marks on the line.
  const marks = useMemo(() => {
    const out: { i: number; year: string }[] = [];
    items.forEach((p, i) => {
      const y = firstYear(p.year);
      if (i === 0 || y !== firstYear(items[i - 1].year)) out.push({ i, year: y });
    });
    return out;
  }, [items]);

  return (
    <section
      ref={sectionRef}
      id="work"
      aria-label="Work"
      className="relative scroll-mt-[0px]"
      style={{ height: height ?? '400vh' }}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* The year you are in, large and quiet, bottom right. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-[3vh] right-[var(--gutter)] select-none"
        >
          <span key={year} className="tl-year t-display block tabular-nums">
            {year}
          </span>
        </div>

        <div
          ref={trackRef}
          className="flex h-[min(60vh,560px)] -translate-y-[3vh] items-stretch will-change-transform"
          style={{ paddingLeft: 'max(var(--gutter), calc((100vw - var(--page-max)) / 2 + var(--gutter)))' }}
        >
          {/* Intro */}
          <div className="flex w-[min(30vw,420px)] shrink-0 flex-col justify-between pr-[48px]">
            <h2 className="t-display text-bone">Work</h2>
            <div>
              <p className="t-body text-mist">
                {items.length} projects, {span}. Open any of them for the full story.
              </p>
              <p className="t-caption mt-[18px] flex items-center gap-[10px] text-ash">
                <span className="tl-nudge inline-block h-px w-[36px] bg-current" aria-hidden />
                Keep scrolling
              </p>
            </div>
          </div>

          {/* Rail */}
          <div
            ref={railRef}
            className="relative shrink-0"
            style={{
              width: `calc(${STEP} * ${Math.max(0, items.length - 1)} + ${ITEM_W} + 12vw)`,
            }}
          >
            {/* Base line + the accent that follows the reading head */}
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[var(--hairline)]" />
            <div
              ref={headRef}
              className="absolute left-0 right-0 top-1/2 h-px origin-left -translate-y-1/2 bg-iris"
              style={{ transform: 'scaleX(0)' }}
            />
            {Array.from({ length: PUFFS }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="rk-puff"
                ref={(el) => {
                  puffRefs.current[i] = el;
                }}
              />
            ))}
            <Rocket ref={rocketRef} />
            <span className="absolute left-0 top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-iris" />
            <span className="absolute right-0 top-1/2 size-[9px] translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--hairline)] bg-void" />

            {/* Year marks, sat on the line between the last item of one year and the first of the next */}
            {marks.map(({ i, year: y }) => (
              <span
                key={y}
                className="tl-mark absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--hairline)] bg-void px-[10px] py-[3px] text-[12px] tabular-nums text-ash"
                style={{ left: i === 0 ? 0 : `calc(${STEP} * ${i} - ${STEP} / 2 + 24px)` }}
              >
                {y}
              </span>
            ))}

            {items.map((p, i) => {
              const top = i % 2 === 0;
              return (
                <button
                  key={p.slug}
                  type="button"
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  onClick={() => onOpen(i)}
                  onFocus={() => focusItem(i)}
                  aria-label={`${p.name}, ${p.year}. Open details`}
                  className={`tl-item group absolute text-left ${top ? 'top-0 bottom-1/2' : 'top-1/2 bottom-0'}`}
                  style={
                    {
                      left: `calc(${STEP} * ${i} + 24px)`,
                      width: ITEM_W,
                      '--r': 0,
                    } as CSSProperties
                  }
                >
                  {/* connector */}
                  <span
                    aria-hidden
                    className={`tl-stem absolute left-0 w-px bg-iris ${
                      top ? 'top-[5px] bottom-0 origin-bottom' : 'top-0 bottom-[5px] origin-top'
                    }`}
                  />
                  {/* end dot */}
                  <span
                    aria-hidden
                    className={`tl-dot absolute left-0 size-[11px] -translate-x-1/2 rounded-full bg-iris ${
                      top ? 'top-0' : 'bottom-0'
                    }`}
                  />

                  <span
                    className={`absolute left-[20px] right-0 flex flex-col ${
                      top ? 'top-[-4px]' : 'bottom-[-4px]'
                    }`}
                  >
                    <Mask className="text-[13px] tabular-nums text-saffron" delay={0}>
                      {p.year}
                    </Mask>
                    <Mask className="t-heading-xs mt-[6px] text-bone" delay={0.08}>
                      <span className="tl-name">{p.name}</span>
                    </Mask>
                    <Mask className="t-caption mt-[6px] max-w-[30ch] text-ash" delay={0.16}>
                      {p.context}
                    </Mask>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** One line rising out of a clip, driven by the item's --r. */
function Mask({
  children,
  className = '',
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  delay: number;
}) {
  return (
    <span className={`block overflow-hidden pb-[2px] ${className}`}>
      <span className="tl-rise block" style={{ '--d': delay } as CSSProperties}>
        {children}
      </span>
    </span>
  );
}

/* ── Mobile ──────────────────────────────────────────────────────────── */

function VerticalTimeline({
  items,
  span,
  onOpen,
}: {
  items: Project[];
  span: string;
  onOpen: (i: number) => void;
}) {
  return (
    <section id="work" className="shell scroll-mt-[96px] pt-[120px]">
      <h2 className="t-heading-lg text-bone">Work</h2>
      <p className="t-body mt-[12px] text-mist">
        {items.length} projects, {span}. Tap any of them for the full story.
      </p>
      <ol className="relative mt-[36px] border-l border-[var(--hairline)] pl-[22px]">
        {items.map((p, i) => {
          const newYear = i === 0 || firstYear(p.year) !== firstYear(items[i - 1].year);
          return (
            <li key={p.slug} className={newYear && i > 0 ? 'mt-[30px]' : ''}>
              {newYear && (
                <p className="relative mb-[12px] text-[13px] tabular-nums text-saffron">
                  <span className="absolute left-[-27px] top-1/2 size-[9px] -translate-y-1/2 rounded-full bg-iris" />
                  {firstYear(p.year)}
                </p>
              )}
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="w-full py-[10px] text-left"
              >
                <span className="block text-[19px] leading-[1.25] text-bone">{p.name}</span>
                <span className="t-caption mt-[2px] block text-ash">{p.context}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
