// src/lib/useContent.ts
import { useSyncExternalStore } from 'react';
import {
  projects as staticProjects,
  profile as staticProfile,
  roles as staticRoles,
  achievements as staticAchievements,
  type Project,
  type Role,
  type Achievement,
  type Profile,
} from '@/lib/content';
import { setColorOverrides, type ColorOverrides } from '@/lib/colorOverrides';

/**
 * The single source of truth for content the site renders.
 *
 * On mount it hits GET /api/content — the backend's mutable content store — and
 * uses that when it succeeds. If the backend is unreachable, still starting up,
 * or hasn't been seeded yet, the compiled content.ts values below stand in.
 * That's why the same shape ships as both the initial default state AND the
 * fallback: every consumer gets a fully-populated tree on the first paint, no
 * loading spinner, no null-check dance in every component.
 *
 * The tree is deliberately a snapshot, not a live subscription — the site
 * doesn't need real-time updates, and refetching per view would just cost
 * extra network for no benefit. Admin changes show up on the next full page
 * load. The one place that does need live behaviour is the admin preview
 * itself, which remounts on each save via a bumped `key` prop.
 *
 * ── Why this file is a store rather than a hook with its own useState ──
 *
 * It used to be exactly that, and it had two faults that between them made
 * most of the admin panel decorative.
 *
 * The first was fan-out. Every caller of useContent() ran its own useEffect
 * and fired its own GET /api/content, so five components meant five identical
 * requests racing each other, five copies of the tree in memory, and five
 * chances for one of them to resolve late and render a different answer from
 * its neighbours. It is now one module-level store, one fetch guarded by a
 * `started` flag, and useSyncExternalStore handing every subscriber the same
 * object — which is also what makes the identity checks in useProjects()
 * meaningful rather than accidental.
 *
 * The second was worse, and is the actual reason an admin edit to the email
 * address changed nothing on the site: **the only field anyone read from this
 * tree was `projects`.** useContent() itself had no callers at all. Its one
 * consumer was useProjects(), which destructured `projects` and dropped
 * profile, roles and achievements on the floor. Every component that needed
 * an email address, a GitHub link or a job title imported the compiled
 * constant straight out of content.ts instead. So the admin panel wrote to
 * the backend correctly, the backend served it correctly, this file fetched
 * it correctly — and then the site rendered the build-time copy anyway.
 *
 * Hence useProfile / useRoles / useAchievements below. They are trivial, and
 * that is the point: the fix is not clever, it is that the wire was never
 * connected at the far end.
 */

export type ContentTree = {
  profile: Profile;
  roles: Role[];
  projects: Project[];
  achievements: Achievement[];
  /** Admin-set graph/card colour overrides. Absent means "use theme.ts defaults". */
  colors?: ColorOverrides;
};

const staticTree: ContentTree = {
  profile: staticProfile,
  roles: staticRoles,
  projects: staticProjects,
  achievements: staticAchievements,
};

/**
 * Normalises whatever the backend hands back: fills in missing arrays,
 * coerces the shape, and returns nothing (null) if the payload isn't a valid
 * tree so the caller can fall back to the static set instead of rendering
 * something half-broken.
 */
function normaliseTree(raw: unknown): ContentTree | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<ContentTree>;
  if (!t.profile && !t.projects && !t.roles && !t.achievements) return null;
  return {
    // A stored tree with a null profile is a half-seeded store, not an
    // instruction to render a nameless site — fall through to the compiled
    // one field at a time rather than all-or-nothing.
    profile: (t.profile as Profile) ?? staticProfile,
    roles: Array.isArray(t.roles) && t.roles.length ? (t.roles as Role[]) : staticRoles,
    projects: Array.isArray(t.projects)
      ? (t.projects as Project[]).map((p) => ({
          ...p,
          tech: p.tech ?? [],
          domains: p.domains ?? [],
        }))
      : staticProjects,
    achievements:
      Array.isArray(t.achievements) && t.achievements.length
        ? (t.achievements as Achievement[])
        : staticAchievements,
    colors: (t.colors as ColorOverrides) ?? undefined,
  };
}

/* ── the store ─────────────────────────────────────────────────────────── */

type Snapshot = { content: ContentTree; ready: boolean };

let snapshot: Snapshot = { content: staticTree, ready: false };
let started = false;
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

/**
 * Fire the one fetch. Guarded, because subscribe() runs on every mount and
 * React is entitled to subscribe, unsubscribe and resubscribe whenever it
 * likes — none of which should cost another round trip.
 */
function start() {
  if (started) return;
  started = true;
  fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/content`)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      const parsed = normaliseTree(raw);
      if (parsed) setColorOverrides(parsed.colors);
      emit({ content: parsed ?? staticTree, ready: true });
    })
    .catch(() => {
      // Backend down / not seeded / CORS — the static tree already in the
      // snapshot IS the site. `ready` still flips so consumers that gate on
      // it don't sit forever.
      emit({ content: staticTree, ready: true });
    });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Must return a stable reference between emits or useSyncExternalStore will
 * loop forever — hence the single `snapshot` object that is replaced whole
 * rather than rebuilt per call.
 */
function getSnapshot(): Snapshot {
  return snapshot;
}

export function useContent(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The three accessors that were missing, and whose absence was the bug.
 *
 * Anything rendering an email address, a phone number, a job title, a social
 * link, a role or an achievement must go through these rather than importing
 * the constant from content.ts, or it renders whatever was true at build time
 * and silently ignores the admin panel.
 */
export function useProfile(): Profile {
  return useContent().content.profile;
}

export function useRoles(): Role[] {
  return useContent().content.roles;
}

export function useAchievements(): Achievement[] {
  return useContent().content.achievements;
}

/**
 * Legacy shape used by GraphJourney / StackCards / anywhere that only needed
 * projects. Kept so the graph and work-list components didn't all have to
 * change in the same PR as the admin rewrite. It layers backend-added
 * projects (ones with slugs not already in content.ts) on top of the
 * canonical static order — newest additions lead.
 */
export function useProjects(): { projects: Project[]; extraCount: number } {
  const { content } = useContent();
  const known = new Set(staticProjects.map((p) => p.slug));
  const extra = content.projects.filter((p) => !known.has(p.slug));
  const merged =
    // If /api/content returned the FULL tree (seeded), it already contains
    // the static projects — use it verbatim. Otherwise it fell back to the
    // static tree, in which case `extra` is [] and we still get everything.
    content.projects.length >= staticProjects.length
      ? content.projects
      : [...extra, ...staticProjects];
  return { projects: merged, extraCount: extra.length };
}