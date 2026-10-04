import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Home from '@/routes/Home';
import { SmoothScroll } from '@/components/core/SmoothScroll';
import { AmbientField } from '@/components/core/AmbientField';
import { SkyBackdrop } from '@/components/core/SkyBackdrop';
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
 * Third door, same reasoning: a voxel island with its own render loop and
 * pointer-lock controls is not something a reader who never clicks the door
 * should have to download.
 */
const Game = lazy(() => import('@/routes/Game'));

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
      : pathname.startsWith('/game')
        ? `The Island — ${profile.name}`
        : `${profile.name} — ${profile.title}`;

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = new URL('/', window.location.origin).href;

    window.scrollTo(0, 0);
  }, [pathname, profile.name, profile.title]);

  return null;
}

/**
 * Site chrome: smooth scrolling and the drifting stars. Mounted on the main
 * site only. The archive and the island are their own rooms with their own
 * air, their own lighting and their own pull cords, and Lenis's wheel
 * listener would eat the scroll events they integrate themselves.
 *
 * The site itself is night only — there is no theme switch here any more.
 */
function SiteChrome() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/archive') || pathname.startsWith('/game')) return null;
  return (
    <>
      <SmoothScroll />
      <SkyBackdrop />
      <AmbientField />
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
        <Route
          path="/game"
          element={
            <Suspense fallback={<div className="min-h-screen bg-black" aria-hidden />}>
              <Game />
            </Suspense>
          }
        />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}