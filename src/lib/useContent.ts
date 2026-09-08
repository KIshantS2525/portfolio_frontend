// src/lib/useContent.ts
import { useEffect, useState } from 'react';
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
 * Kept the old useProjects() wrapper below so nothing on the marketing site
 * that already destructures `{ projects, extraCount }` has to change today —
 * it now derives both values from the same hook.
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
    profile: (t.profile as Profile) ?? staticProfile,
    roles: Array.isArray(t.roles) ? (t.roles as Role[]) : staticRoles,
    projects: Array.isArray(t.projects)
      ? (t.projects as Project[]).map((p) => ({
          ...p,
          tech: p.tech ?? [],
          domains: p.domains ?? [],
        }))
      : staticProjects,
    achievements: Array.isArray(t.achievements)
      ? (t.achievements as Achievement[])
      : staticAchievements,
    colors: (t.colors as ColorOverrides) ?? undefined,
  };
}

export function useContent(): { content: ContentTree; ready: boolean } {
  const [content, setContent] = useState<ContentTree>(staticTree);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/content`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (cancelled) return;
        const parsed = normaliseTree(raw);
        if (parsed) {
          setContent(parsed);
          setColorOverrides(parsed.colors);
        }
        setReady(true);
      })
      .catch(() => {
        // Backend down / not seeded / CORS — the static tree already loaded
        // above IS the site. `ready` still flips to true so consumers that
        // gate rendering on it don't sit forever.
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { content, ready };
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