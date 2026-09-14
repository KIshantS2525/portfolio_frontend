// src/components/game/GameDoor.tsx
import { Link } from 'react-router-dom';

/**
 * The door to /game — third path, same gate as ArchiveDoor. Sits beside it
 * rather than in the nav, for the reason explained on ArchiveDoor: a reader
 * who has scrolled this far has already chosen to be here, and a fork in the
 * road belongs at the point they've earned it, not the moment they arrive.
 */
export function GameDoor() {
  const warm = () => {
    void import('@/routes/Game');
  };

  return (
    <Link
      to="/game"
      onPointerEnter={warm}
      onFocus={warm}
      className="group inline-flex items-baseline gap-[10px] border border-[var(--hairline)] px-[20px] py-[14px] transition-colors hover:border-[var(--accent-text)]"
    >
      <span className="t-body text-[var(--text)]">Enter survival</span>
      <span className="t-caption text-[var(--text-muted)] transition-transform group-hover:translate-x-[3px]">
        an island you can dig into →
      </span>
    </Link>
  );
}
