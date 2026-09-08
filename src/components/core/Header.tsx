/**
 * This used to also export a fixed <Header> with a Minimal/Studio toggle and
 * a "land where you left" localStorage redirect. Both routes are one route
 * now (see src/routes/Home.tsx), and the site's only nav is <StudioNav>, so
 * that component and the mode-switching logic it existed for are gone. Only
 * the brand mark survives here, since <StudioNav> still uses it.
 */

/** Brand mark. The only place a gradient is allowed. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="mk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--tertiary)" />
        </linearGradient>
      </defs>
      <path d="M12 2 L22 20 L2 20 Z" fill="url(#mk)" />
      <path d="M12 9 L17 18 L7 18 Z" fill="var(--surface)" />
    </svg>
  );
}