import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Home from '@/routes/Home';
import { SmoothScroll } from '@/components/core/SmoothScroll';
import { AmbientField } from '@/components/core/AmbientField';
import { DayNightToggle } from '@/components/core/DayNightToggle';
import { useProfile } from '@/lib/useContent';

/** Admin is its own chunk — none of it ships to a visitor who never opens it. */
const Admin = lazy(() => import('@/routes/Admin'));

/*
 * The archive is split exactly like the admin panel, and for the same reason:
 * three.js geometry, a render loop and a whole second experience have no
 * business in the bundle of a reader who never opens the door. ArchiveDoor
 * warms this chunk on hover so the split costs nothing perceptible.
 */
const Archive = lazy(() => import('@/routes/Archive'));

/**
 * Metadata is set per route here rather than by a framework. There is no SSR in
 * a Vite SPA, so crawlers that don't execute JavaScript see whatever is in
 * index.html — which is why the canonical tags, Open Graph tags and the
 * Person JSON-LD all live there statically.
 *
 * There used to be a second public path (/studio) with its own title branch
 * here. That's gone — Home is the only thing a visitor can land on now, so
 * this only distinguishes /admin from everything else.
 */
function RouteMeta() {
  const { pathname } = useLocation();
  // Live, not compiled — a name changed in the admin panel should change the
  // browser tab too, and `profile` in the deps below is what makes the title
  // re-apply when the fetch lands a beat after the first paint.
  const profile = useProfile();

  useEffect(() => {
    document.title = pathname.startsWith('/admin')
      ? `Admin — ${profile.name}`
      : `${profile.name} — ${profile.title}`;

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = new URL('/', window.location.origin).href;

    window.scrollTo(0, 0);
  }, [pathname, profile.name, profile.title]);

  return null;
}

/**
 * The two things that hang over every page — and the one page they must not.
 *
 * AmbientField and DayNightToggle were mounted unconditionally at the root,
 * which is right for a site that is one continuous surface and wrong the
 * moment part of it stops being that. Both were bleeding straight through
 * into the locker room: the ambient motes drifting over a corridor that has
 * its own air, and the theme cord hanging in the top right of a room that
 * does not use the site theme at all — a rope you can pull that changes
 * nothing you can see, which is worse than no control.
 *
 * SmoothScroll is in here for a different and more concrete reason: Lenis
 * attaches a non-passive wheel listener to the document and preventDefaults
 * it, which is exactly what it is for on a long page and exactly wrong on a
 * route with no page scroll at all. It was silently eating every wheel event
 * in the locker room — including the ones aimed at the writing pad, which is
 * why the pad could not be scrolled no matter how much overflow it had. The
 * archive integrates wheel deltas itself; it does not want a second thing
 * doing the same job on the same events.
 *
 * The archive already has its own dark, its own palette and its own switch on
 * the wall. Site chrome belongs to the site.
 *
 * PullCord stays mounted here rather than inside StudioNav or Admin's header
 * because it is `position: fixed`, and a `filter`/`backdrop-filter` on any
 * ancestor re-anchors fixed descendants to that ancestor instead of the
 * viewport. Both of those headers have one. This level has neither, so it is
 * the one place the cord is guaranteed to hang from the real top of the page.
 */
function SiteChrome() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/archive')) return null;
  return (
    <>
      <SmoothScroll />
      <AmbientField />
      <DayNightToggle />
    </>
  );
}

export default function App() {
  return (
    <>
      <SiteChrome />
      <RouteMeta />
      <a
        href="#work"
        className="sr-only focus:not-sr-only focus:fixed focus:left-[24px] focus:top-[24px] focus:z-[100] focus:rounded-full focus:bg-iris focus:px-[18px] focus:py-[10px] focus:text-[14px] focus:text-white"
      >
        Skip to work
      </a>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div className="min-h-screen bg-void" aria-hidden />}>
              <Admin />
            </Suspense>
          }
        />
        <Route
          path="/archive"
          element={
            <Suspense
              fallback={<div className="min-h-screen bg-[var(--surface)]" aria-hidden />}
            >
              <Archive />
            </Suspense>
          }
        />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}