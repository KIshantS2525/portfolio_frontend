// src/components/archive/NoticeBoard.tsx
import type { Profile } from '@/lib/content';

/**
 * The notice board on the end wall.
 *
 * The cork, the frame and the pinned cards are geometry — they are part of the
 * room and they are lit by the room. What is written on the cards is not: it
 * is this, an HTML panel anchored to the board's projected position, for the
 * same reason nothing else in here uses 3D text. Type baked into a texture
 * does not inherit the site's fonts, resamples badly at an angle, and cannot
 * be selected, copied or read aloud — and an email address that cannot be
 * copied is a decoration, not a contact.
 *
 * It fades in on proximity rather than on arrival. A hard cut at a threshold
 * makes the wall feel like a trigger volume; coming up over the last few
 * metres makes it feel like something you are walking toward and can finally
 * read.
 */

/**
 * What the board shows, as an exported name rather than an inline shape.
 *
 * It was inline, and inline is how a three-hop inference chain turns into a
 * mystery: Archive derives `rows` from boardRows(), passes it to buildRoom(),
 * and maps over it for the screen-reader list. Break any link — a stale
 * language server that has not indexed this file yet is enough — and the
 * whole chain silently degrades to `any`, and the error surfaces at the far
 * end on the map callback, three files from the actual cause.
 *
 * A named exported type means every one of those sites can be annotated, so a
 * broken link fails where it breaks instead of propagating.
 */
export type ContactRow = { label: string; value: string; href: string };

/**
 * The four ways to reach him, as data.
 *
 * This file used to export a React component that drew the board as HTML
 * floating over the 3D one. That is gone: the notes are painted into their own
 * textures in lockerScene and pinned to a real corkboard, because a rounded
 * card with a hover state hanging in mid-air is a web widget, and the archive
 * is not a web page. Clicking a note raycasts to it like a locker door does.
 *
 * What survives here is the list itself, which both the geometry and the
 * screen-reader copy of the room are built from — so they cannot disagree
 * about how to contact him, which is the sort of thing that only ever goes
 * wrong in the direction that loses you the email.
 */
export function boardRows(profile: Profile): ContactRow[] {
  return [
    { label: 'Email', value: profile.email, href: `mailto:${profile.email}` },
    {
      label: 'Phone',
      value: profile.phone,
      href: `tel:${profile.phone.replace(/\s/g, '')}`,
    },
    {
      label: 'GitHub',
      value: profile.github.replace(/^https?:\/\/(www\.)?/, ''),
      href: profile.github,
    },
    {
      label: 'LinkedIn',
      value: profile.linkedin.replace(/^https?:\/\/(www\.)?/, ''),
      href: profile.linkedin,
    },
  ];
}