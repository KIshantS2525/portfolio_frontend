// frontend/src/lib/useContent.ts
import { useSyncExternalStore } from 'react';
import {
  projects as staticProjects,
  profile as staticProfile,
  roles as staticRoles,
  achievements as staticAchievements,
  education as staticEducation,
  skills as staticSkills,
  about as staticAbout,
  stackRows as staticStack,
  metrics as staticMetrics,
  SUGGESTED_QUESTIONS as staticQuestions,
  type Project,
  type Role,
  type Achievement,
  type Profile,
  type Education,
  type StackRow,
  type Metric,
} from '@/lib/content';
import {
  getColorOverrides,
  normaliseColors,
  setColorOverrides,
  type ColorOverrides,
} from '@/lib/colorOverrides';

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
  /*
   * The sections below were compiled-only until the admin panel learned to
   * edit them. A store written before that has none of them, so each one
   * falls back to content.ts individually when it is missing (undefined or
   * null) — but an EMPTY list saved on purpose is respected, not overridden.
   */
  education: Education[];
  skills: Record<string, string[]>;
  about: string[];
  stack: StackRow[];
  metrics: Metric[];
  questions: string[];
};

export const STATIC_TREE: ContentTree = {
  profile: staticProfile,
  roles: staticRoles,
  projects: staticProjects,
  achievements: staticAchievements,
  education: staticEducation,
  skills: staticSkills,
  about: staticAbout,
  stack: staticStack,
  metrics: staticMetrics,
  questions: staticQuestions,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** An array from the store, or the compiled fallback when the key is absent. */
function list<T>(v: unknown, fallback: T[]): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}

/**
 * Normalises whatever the backend hands back: per-field fallback to the
 * compiled content for anything missing, and null when the payload isn't a
 * tree at all so the caller keeps the static set.
 *
 * Shared with the admin panel (it loads the same shape), so both sides agree
 * on what a half-written store means.
 */
export function normaliseTree(raw: unknown): ContentTree | null {
  if (!isObj(raw)) return null;
  const t = raw as Partial<Record<keyof ContentTree, unknown>>;
  if (!t.profile && !Array.isArray(t.projects) && !Array.isArray(t.roles)) return null;
  return {
    // A null profile is a half-seeded store, not an instruction to render a
    // nameless site. Missing profile FIELDS fall back one at a time too.
    profile: isObj(t.profile) ? { ...staticProfile, ...(t.profile as Partial<Profile>) } : staticProfile,
    roles: list<Role>(t.roles, staticRoles).map((r) => ({ ...r, projects: r.projects ?? [] })),
    projects: list<Project>(t.projects, staticProjects).map((p) => ({
      ...p,
      tech: p.tech ?? [],
      domains: p.domains ?? [],
    })),
    achievements: list<Achievement>(t.achievements, staticAchievements),
    // Old two-theme trees ({ dark, light }) are read as their dark half.
    colors: normaliseColors(t.colors),
    education: list<Education>(t.education, staticEducation),
    skills: isObj(t.skills) ? (t.skills as Record<string, string[]>) : staticSkills,
    about: list<string>(t.about, staticAbout),
    stack: list<StackRow>(t.stack, staticStack),
    metrics: list<Metric>(t.metrics, staticMetrics),
    questions: list<string>(t.questions, staticQuestions),
  };
}

/* ── the store ─────────────────────────────────────────────────────────── */

type Snapshot = { content: ContentTree; ready: boolean };

let snapshot: Snapshot = { content: STATIC_TREE, ready: false };
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
  listenForPreview();
  fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/content`)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      // In the admin's live preview, the panel's unsaved tree wins.
      if (previewing) return;
      const parsed = normaliseTree(raw);
      if (!parsed) {
        emit({ content: STATIC_TREE, ready: true });
        return;
      }
      /*
       * Only hand out new objects when something actually changed. Every
       * fresh object here — even with identical contents — re-derives the
       * graph's nodes and figures and rebuilds the 75k-particle dust cloud,
       * which showed up as a hitch a moment after load. If the comparison
       * says "different" for any reason (even key order), this falls back to
       * exactly the old behaviour.
       */
      const sameColors =
        JSON.stringify(normaliseColors(parsed.colors)) === JSON.stringify(getColorOverrides());
      if (!sameColors) setColorOverrides(parsed.colors);
      const sameContent = sameTree(parsed, snapshot.content);
      emit({ content: sameContent ? snapshot.content : parsed, ready: true });
    })
    .catch(() => {
      if (previewing) return;
      // Backend down / not seeded / CORS — the static tree already in the
      // snapshot IS the site. `ready` still flips so consumers that gate on
      // it don't sit forever.
      emit({ content: STATIC_TREE, ready: true });
    });
}

/** Content equality, ignoring `colors` (compared separately against the live overrides). */
function sameTree(a: ContentTree, b: ContentTree): boolean {
  const { colors: _a, ...restA } = a;
  const { colors: _b, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

/* ── admin live preview ─────────────────────────────────────────────────── */

/**
 * The admin panel embeds the real homepage in an iframe at /?preview=1 and
 * posts its UNSAVED content tree into it on every edit, so the preview shows
 * exactly what Save would publish. Only messages from a same-origin parent
 * are accepted; outside an iframe, or without the flag, none of this runs.
 */
export const PREVIEW_MESSAGE = 'ishant:preview';
export const PREVIEW_READY = 'ishant:preview-ready';
export const PREVIEW_SCROLL = 'ishant:preview-scroll';

let previewing = false;

function listenForPreview() {
  if (typeof window === 'undefined' || window.parent === window) return;
  if (!new URLSearchParams(window.location.search).has('preview')) return;
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    const data = e.data as { type?: string; tree?: unknown; target?: string };
    if (data?.type === PREVIEW_MESSAGE) {
      const parsed = normaliseTree(data.tree);
      if (!parsed) return;
      previewing = true;
      setColorOverrides(parsed.colors);
      emit({ content: parsed, ready: true });
    } else if (data?.type === PREVIEW_SCROLL && data.target) {
      const el = document.querySelector(data.target);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
      else if (data.target === 'top') window.scrollTo(0, 0);
    }
  });
  window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);
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

export function useEducation(): Education[] {
  return useContent().content.education;
}

export function useSkills(): Record<string, string[]> {
  return useContent().content.skills;
}

export function useAbout(): string[] {
  return useContent().content.about;
}

export function useStackRows(): StackRow[] {
  return useContent().content.stack;
}

export function useMetrics(): Metric[] {
  return useContent().content.metrics;
}

export function useQuestions(): string[] {
  return useContent().content.questions;
}

/**
 * Projects, in the store's order.
 *
 * This used to compare the store's project count with the compiled count and,
 * if the store had FEWER, throw the store away and render the compiled list
 * instead. So deleting a single project in the admin silently discarded every
 * project edit — renames, rewrites, new tech — and resurrected the deleted
 * one. The store is the source of truth once it exists; when the backend is
 * unreachable, the snapshot already holds the compiled list.
 */
export function useProjects(): { projects: Project[]; extraCount: number; ready: boolean } {
  const { content, ready } = useContent();
  const known = new Set(staticProjects.map((p) => p.slug));
  const extraCount = content.projects.filter((p) => !known.has(p.slug)).length;
  return { projects: content.projects, extraCount, ready };
}
