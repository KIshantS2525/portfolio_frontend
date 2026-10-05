'use client';

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Mark } from '@/components/core/Header';
import { useProfile } from '@/lib/useContent';
import { OPEN_PROJECT_EVENT } from '@/lib/events';

/**
 * Fixed, not absolute — the original card nav scrolls away with the page, which
 * is the wrong behaviour for a long maximalist route.
 *
 * A link is either an in-page anchor (`href`) or a project (`project`, a slug).
 * Project links open that project's sheet directly instead of all dumping the
 * reader at the top of the timeline — see OPEN_PROJECT_EVENT in
 * lib/events.ts.
 */
type NavLink = { label: string; href?: string; project?: string };

const CARDS: { title: string; links: NavLink[] }[] = [
  {
    title: 'Work',
    links: [
      { label: 'Recall', project: 'recall' },
      { label: 'OmniTrace', project: 'omnitrace' },
      { label: 'DiagramStudio', project: 'diagramstudio' },
      { label: 'All projects', href: '#work' },
    ],
  },
  {
    title: 'Proof',
    links: [
      { label: 'PPE detection', href: '#proof' },
      { label: 'English → diagram', href: '#proof' },
      { label: 'Ask my AI', href: '#ask' },
    ],
  },
];

export function StudioNav() {
  const profile = useProfile();
  const [open, setOpen] = useState(false);

  /*
   * The "Reach me" card used to live in the module-level CARDS array above,
   * which meant its GitHub and LinkedIn hrefs were frozen at import time — the
   * one place in this file that could never see an admin edit, however the
   * component re-rendered. Built here instead, from the live profile.
   */
  const cards: { title: string; links: NavLink[] }[] = [
    ...CARDS,
    {
      title: 'Reach me',
      links: [
        { label: 'Email', href: '#contact' },
        { label: 'GitHub', href: profile.github },
        { label: 'LinkedIn', href: profile.linkedin },
      ],
    },
  ];

  /*
   * The nav's Ask AI pill steps aside while the hero's own "Ask my AI about
   * me" button is on screen — two identical filled pills in one view compete
   * for the same click. The hero button is found by its data attribute rather
   * than a ref because it lives inside the lazily-loaded graph chunk, which
   * may not exist yet when this mounts; reading it on every scroll handles
   * that for free. Lenis drives window.scrollTo, so native scroll events fire.
   */
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = document.querySelector('[data-hero-cta]');
      if (!el) {
        // Not mounted yet (lazy chunk) — treat the top of the page as hero.
        setHeroCtaVisible(window.scrollY < window.innerHeight * 0.5);
        return;
      }
      const r = el.getBoundingClientRect();
      setHeroCtaVisible(r.bottom > 80 && r.top < window.innerHeight);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    // The lazy hero can land a beat after mount; re-check once it has.
    const t = window.setTimeout(check, 800);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="fixed inset-x-0 top-[18px] z-50">
      <div className="shell">
        <div className="overflow-hidden rounded-[24px] border border-ash/15 bg-void/80 backdrop-blur-[10px]">
          <div className="flex items-center justify-between px-[18px] py-[14px]">
            <Link to="/" className="flex items-center gap-[10px] text-[15px] text-bone">
              <Mark />
              <span className="hidden sm:inline">{profile.name}</span>
              <span className="sm:hidden">Ishant</span>
            </Link>

            <div className="flex items-center gap-[18px]">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="studio-nav-cards"
                className="t-nav text-ash transition-colors hover:text-bone"
              >
                {open ? 'Close' : 'Menu'}
              </button>
              {/*
                The archive lives in the bar rather than only at the foot of
                the page. `onPointerEnter` fires the dynamic import a beat
                before the click lands, so the chunk is usually already in
                flight and the room opens instantly — hovering is a good
                signal of intent and costs nothing if it turns out to be
                wrong. The import is idempotent, so sweeping the cursor over
                it fifty times still downloads it once.
              */}
              <Link
                to="/archive"
                onPointerEnter={() => void import('@/routes/Archive')}
                onFocus={() => void import('@/routes/Archive')}
                className="t-nav hidden text-ash transition-colors hover:text-bone sm:inline"
              >
                Archive
              </Link>
              {/*
                The third path, warmed the same way. Called "Survival" rather
                than anything naming the game it resembles: the room is an
                island with a bed, a night that bites and a sword, which is
                what the word describes — and the site should not be leaning
                on somebody else's trademark to explain its own feature.
              */}
              <Link
                to="/game"
                onPointerEnter={() => void import('@/routes/Game')}
                onFocus={() => void import('@/routes/Game')}
                className="t-nav hidden text-ash transition-colors hover:text-bone sm:inline"
              >
                Survival
              </Link>
              <span
                className="inline-flex transition-[max-width,opacity,margin] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  maxWidth: heroCtaVisible ? 0 : 140,
                  opacity: heroCtaVisible ? 0 : 1,
                  marginLeft: heroCtaVisible ? -18 : 0,
                  // Clip only while hidden, so the focus ring and hover lift are never cut off.
                  overflow: heroCtaVisible ? 'hidden' : 'visible',
                }}
                aria-hidden={heroCtaVisible}
              >
                <a
                  href="#ask"
                  tabIndex={heroCtaVisible ? -1 : 0}
                  className="pill shrink-0 whitespace-nowrap !px-[20px] !py-[11px]"
                >
                  Ask AI
                </a>
              </span>
            </div>
          </div>

          <div
            id="studio-nav-cards"
            className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="grid gap-[12px] px-[12px] pb-[12px] sm:grid-cols-3">
                {cards.map((c) => (
                  <div key={c.title} className="rounded-[18px] border border-ash/15 p-[18px]">
                    <p className="t-caption text-saffron">{c.title}</p>
                    <ul className="mt-[10px] space-y-[6px]">
                      {c.links.map((l) => (
                        <li key={l.label}>
                          <a
                            href={l.project ? '#work' : l.href}
                            onClick={(e) => {
                              setOpen(false);
                              if (l.project) {
                                e.preventDefault();
                                window.dispatchEvent(
                                  new CustomEvent(OPEN_PROJECT_EVENT, { detail: l.project }),
                                );
                              }
                            }}
                            target={l.href?.startsWith('http') ? '_blank' : undefined}
                            rel={l.href?.startsWith('http') ? 'noreferrer' : undefined}
                            className="t-heading-2xs text-ash transition-colors hover:text-bone"
                            tabIndex={open ? 0 : -1}
                          >
                            {l.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}