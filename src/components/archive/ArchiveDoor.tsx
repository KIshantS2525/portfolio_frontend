// src/components/archive/ArchiveDoor.tsx
import { Link } from 'react-router-dom';

/**
 * The door to /archive.
 *
 * `onPointerEnter` fires the dynamic import a beat before the click lands, so
 * the chunk is usually already in flight by the time the navigation happens
 * and the room opens instantly. Hovering is a good signal of intent and costs
 * nothing if it turns out to be wrong; the import is idempotent, so a reader
 * who sweeps the cursor over it fifty times still downloads it once.
 *
 * This is the whole gate. Nothing about the archive — not three.js geometry,
 * not the route, not this component's target — reaches a reader who never
 * points at it.
 */
export function ArchiveDoor() {
  const warm = () => {
    void import('@/routes/Archive');
  };

  return (
    <Link
      to="/archive"
      onPointerEnter={warm}
      onFocus={warm}
      className="group inline-flex items-baseline gap-[10px] border border-[var(--hairline)] px-[20px] py-[14px] transition-colors hover:border-[var(--accent-text)]"
    >
      <span className="t-body text-[var(--text)]">Open the archive</span>
      <span className="t-caption text-[var(--text-muted)] transition-transform group-hover:translate-x-[3px]">
        a room you can walk into →
      </span>
    </Link>
  );
}