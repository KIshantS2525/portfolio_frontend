// src/components/game/GameDoor.tsx
import { DoorCard } from '@/components/core/DoorCard';

/**
 * The door to /game — third path, same gate as ArchiveDoor. Sits beside it
 * rather than in the nav, for the reason explained on ArchiveDoor: a reader
 * who has scrolled this far has already chosen to be here, and a fork in the
 * road belongs at the point they've earned it, not the moment they arrive.
 */
export function GameDoor() {
  return (
    <DoorCard
      to="/game"
      warm={() => void import('@/routes/Game')}
      variant="survival"
      title="Survival"
      sub="Press to start"
      image="/doors/island.png"
    />
  );
}
