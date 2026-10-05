// frontend/src/components/core/DoorCard.tsx
import { Link } from 'react-router-dom';
import './doors.css';

/**
 * A door at the foot of the homepage. Each one is dressed in the room it
 * leads to, not in the site's own theme (see doors.css) — `variant` picks
 * which room.
 *
 * `warm` fires the route's dynamic import on hover/focus so the chunk is
 * already in flight by the time the click lands.
 */
export function DoorCard({
  to,
  warm,
  variant,
  title,
  sub,
  image,
}: {
  to: string;
  warm: () => void;
  variant: 'archive' | 'survival';
  title: string;
  /** One short line under the title, styled like the room's own signage. */
  sub: string;
  /** Path under /public; a transparent PNG. */
  image: string;
}) {
  return (
    <Link
      to={to}
      onPointerEnter={warm}
      onFocus={warm}
      aria-label={title}
      className={`door door-${variant}`}
    >
      <h3 className="door-title">{title}</h3>
      <p className="door-sub" aria-hidden>
        {sub}
      </p>
      <div className="door-art">
        <img src={image} alt="" aria-hidden loading="lazy" decoding="async" draggable={false} />
      </div>
    </Link>
  );
}
