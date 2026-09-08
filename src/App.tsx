import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Home from '@/routes/Home';
import { SmoothScroll } from '@/components/core/SmoothScroll';
import { AmbientField } from '@/components/core/AmbientField';
import { DayNightToggle } from '@/components/core/DayNightToggle';
import { profile } from '@/lib/content';

/** Admin is its own chunk — none of it ships to a visitor who never opens it. */
const Admin = lazy(() => import('@/routes/Admin'));

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

  useEffect(() => {
    document.title = pathname.startsWith('/admin')
      ? `Admin — ${profile.name}`
      : `${profile.name} — ${profile.title}`;

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = new URL('/', window.location.origin).href;

    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <SmoothScroll />
      <AmbientField />
      {/*
        Mounted here, once, sitewide — deliberately not inside StudioNav or
        Admin's header. Both of those have (or had) a clipping/filtered
        ancestor, and PullCord is `position: fixed`, which gets re-anchored to
        the nearest ancestor with a `filter`/`backdrop-filter` instead of the
        viewport. App's root has neither, so this is the one place the cord
        is guaranteed to hang from the real top of the page.
      */}
      <DayNightToggle />
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
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}