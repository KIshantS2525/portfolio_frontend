// src/components/archive/ArchiveDoor.tsx
import { DoorCard } from '@/components/core/DoorCard';

/**
 * The door to /archive.
 *
 * `warm` fires the dynamic import a beat before the click lands, so the chunk
 * is usually already in flight by the time the navigation happens and the
 * room opens instantly. Hovering is a good signal of intent and costs nothing
 * if it turns out to be wrong; the import is idempotent, so a reader who
 * sweeps the cursor over it fifty times still downloads it once.
 *
 * This is the whole gate. Nothing about the archive — not three.js geometry,
 * not the route, not this component's target — reaches a reader who never
 * points at it.
 */
export function ArchiveDoor() {
  return (
    <DoorCard
      to="/archive"
      warm={() => void import('@/routes/Archive')}
      variant="archive"
      title="Archive"
      sub="Ishant Shrivastava"
      image="/doors/archive.png"
    />
  );
}
