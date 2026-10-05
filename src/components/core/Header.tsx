// frontend/src/components/core/Header.tsx
/**
 * This used to also export a fixed <Header> with a Minimal/Studio toggle and
 * a "land where you left" localStorage redirect. Both routes are one route
 * now (see src/routes/Home.tsx), and the site's only nav is <StudioNav>, so
 * that component and the mode-switching logic it existed for are gone. Only
 * the brand mark survives here, since <StudioNav> still uses it.
 */

/**
 * Brand mark: your avatar — the full amber disc, crown included, with the
 * hair breaking out over the top edge (the background is cut away, not the
 * circle). Image lives in public/avatar/; the 256px file stays sharp up to
 * ~85px on a 3× screen.
 *
 * The browser-tab icon is NOT this whole disc — a full portrait turns to
 * mush at 16px. It is a tighter head crop of the same avatar, on the same
 * amber: public/favicon.ico, favicon-16/32.png and apple-touch-icon.png,
 * linked from index.html.
 */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/avatar/avatar-256.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className="shrink-0 select-none"
      style={{ width: size, height: size }}
    />
  );
}