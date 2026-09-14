'use client';

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Mark } from '@/components/core/Header';
import { useProfile } from '@/lib/useContent';

/**
 * Fixed, not absolute — the original card nav scrolls away with the page, which
 * is the wrong behaviour for a long maximalist route. The hardcoded "Get
 * Started" button is the Minimal toggle instead.
 */
const CARDS = [
  {
    title: 'Work',
    links: [
      { label: 'Recall', href: '#work' },
      { label: 'OmniTrace', href: '#work' },
      { label: 'DiagramStudio', href: '#work' },
    ],
  },
  {
    title: 'Proof',
    links: [
      { label: 'PPE detection', href: '#proof' },
      { label: 'Knowledge graph', href: '#graph' },
      { label: 'Work', href: '#work' },
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
  const cards = [
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
                DayNightToggle used to render here. Moved to App.tsx: this
                pill has `backdrop-blur-[10px]` (a `backdrop-filter`), and a
                `filter`/`backdrop-filter` on any ancestor makes it the
                containing block for `position: fixed` descendants — an
                obscure corner of the CSS spec. Combined with this pill's own
                `overflow-hidden`, the pull-cord was being clipped to this
                small rounded box instead of hanging from the real viewport
                top, which is exactly what the screenshot showed: the rope
                existed, just trapped inside the nav bar's corner.
              */}
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
              <a href="#ask" className="pill !px-[20px] !py-[11px]">
                Ask AI
              </a>
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
                            href={l.href}
                            onClick={() => setOpen(false)}
                            target={l.href.startsWith('http') ? '_blank' : undefined}
                            rel={l.href.startsWith('http') ? 'noreferrer' : undefined}
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