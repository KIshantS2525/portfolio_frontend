// src/routes/Admin.tsx
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from '@/components/core/Header';
import {
  profile as staticProfile,
  roles as staticRoles,
  projects as staticProjects,
  achievements as staticAchievements,
  type Project,
  type Role,
  type Achievement,
  type Profile,
} from '@/lib/content';
import { THEMES, type Theme } from '@/lib/theme';
import { setColorOverrides, type ColorOverrides, type ThemeOverrides } from '@/lib/colorOverrides';

/**
 * Admin.
 *
 * A whole-content editor over four entity types: projects, roles,
 * achievements, and the profile singleton. Every change flows straight into
 * the live site because the marketing routes read the same /api/content
 * endpoint the panel writes.
 *
 * How the data flow works, end to end:
 *
 *   1. On first open, the panel calls POST /api/admin/seed with the compiled
 *      content.ts snapshot as the body. If the backend already has a store,
 *      seed is a no-op — it never overwrites existing edits. This is what
 *      lets you edit "static" entries: they only look static until the first
 *      time you open the panel, and from that moment on the store is
 *      canonical.
 *   2. GET /api/admin/content returns the whole tree. Every list tab renders
 *      from that in-memory copy; every edit mutates it locally and PUTs the
 *      whole tree back on save.
 *   3. If /api/admin/content responds with { seeded: false }, we seed
 *      immediately with the frontend's compiled tree and reload — same
 *      effect, one round-trip later.
 *
 * Save-atomicity is trivial because PUT replaces the whole tree in one file
 * write; there are no partial updates to race with each other.
 *
 * Deploy note: this all lives on the backend's filesystem. On any host with
 * real disk (VPS, Render, Fly, Docker) it persists. On Vercel serverless it
 * resets on every cold start, which is why the Export tab still exists — it
 * spits out the projects slice as ready-to-paste content.ts source, which is
 * the durable path.
 */

type Tree = {
  profile: Profile;
  roles: Role[];
  projects: Project[];
  achievements: Achievement[];
  colors?: ColorOverrides;
};

const API = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'ishant:admin-token';

const STATIC_TREE: Tree = {
  profile: staticProfile,
  roles: staticRoles,
  projects: staticProjects,
  achievements: staticAchievements,
  colors: {},
};

/** Lazy — Constellation drags in three.js; not in the initial admin bundle. */
const Constellation = lazy(() =>
  import('@/components/graph/Constellation').then((m) => ({ default: m.Constellation })),
);

// ────────────────────────────────────────────────────────────────────────────

export default function Admin() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY));
    } catch {
      /* storage blocked */
    }
    setChecked(true);
  }, []);

  const signOut = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* no-op */
    }
    setToken(null);
  };

  if (!checked) return <div className="min-h-screen bg-void" />;

  return (
    <div className="min-h-screen bg-void">
      <header className="shell flex items-center justify-between py-[18px]">
        <Link to="/" className="flex items-center gap-[10px] text-[15px] text-bone">
          <Mark />
          <span>Admin</span>
        </Link>
        {token && (
          <button type="button" onClick={signOut} className="ghost">
            Sign out
          </button>
        )}
      </header>

      {token ? <Panel token={token} onExpired={signOut} /> : <SignIn onToken={setToken} />}
    </div>
  );
}

/* ── sign in ─────────────────────────────────────────────────────────────── */

function SignIn({ onToken }: { onToken: (t: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Sign in failed.');
      localStorage.setItem(TOKEN_KEY, data.token);
      onToken(data.token);
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'Failed to fetch'
          ? err.message
          : 'Could not reach the server. Is the backend running on port 8000?',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell flex min-h-[70vh] items-center">
      <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
        <h1 className="t-heading text-bone">Sign in</h1>
        <p className="t-body mt-[6px] text-mist">Edit anything on the site without a redeploy.</p>

        <div className="mt-[30px] space-y-[12px]">
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p role="alert" className="t-caption mt-[12px] text-saffron">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="pill mt-[24px] w-full disabled:opacity-40">
          {busy ? 'Checking' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

/* ── panel ───────────────────────────────────────────────────────────────── */

type Tab = 'projects' | 'roles' | 'achievements' | 'profile' | 'colors' | 'preview' | 'export';

function Panel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [tab, setTab] = useState<Tab>('projects');
  const [tree, setTree] = useState<Tree | null>(null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [previewKey, setPreviewKey] = useState(0);

  const auth = { authorization: `Bearer ${token}` };

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...auth, ...(init?.headers ?? {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onExpired();
        throw new Error('Session expired. Sign in again.');
      }
      if (!res.ok) throw new Error(data.detail || 'That request failed.');
      return data;
    },
    [token, onExpired],
  );

  /**
   * Load-or-seed. If the store already exists we take what's in it;
   * otherwise we push the compiled static tree up as the seed, so the panel
   * can immediately show and edit "static" entries.
   */
  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await call('/api/admin/content');
      if (!data.seeded) {
        await call('/api/admin/seed', {
          method: 'POST',
          body: JSON.stringify(STATIC_TREE),
        });
        setTree(STATIC_TREE);
      } else {
        setTree(mergeWithStaticShape(data.content));
      }
      // Export tab still needs the projects-only serialised form.
      const exported = await call('/api/admin/export').catch(() => ({ code: '' }));
      setCode(exported.code ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load content.');
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  /* Live preview: every edit on the Colors tab pushes straight to the
     runtime overrides store so the graph and glass cards update immediately,
     without waiting for Save. */
  useEffect(() => {
    if (tree) setColorOverrides(tree.colors ?? {});
  }, [tree]);

  /** PUT the whole tree. Deliberately atomic — see the file header. */
  const save = useCallback(async () => {
    if (!tree) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await call('/api/admin/content', {
        method: 'PUT',
        body: JSON.stringify(tree),
      });
      setDirty(false);
      setNote('Saved. The live site reflects this on the next page load.');
      setPreviewKey((k) => k + 1);
      const exported = await call('/api/admin/export').catch(() => ({ code: '' }));
      setCode(exported.code ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }, [tree, call]);

  const patch = useCallback((updater: (t: Tree) => Tree) => {
    setTree((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
    setNote(null);
  }, []);

  const tabs: Array<{ id: Tab; label: string }> = useMemo(
    () => [
      { id: 'projects', label: `Projects (${tree?.projects.length ?? 0})` },
      { id: 'roles', label: `Roles (${tree?.roles.length ?? 0})` },
      { id: 'achievements', label: `Achievements (${tree?.achievements.length ?? 0})` },
      { id: 'profile', label: 'Profile' },
      { id: 'colors', label: 'Colors' },
      { id: 'preview', label: 'Preview graph' },
      { id: 'export', label: 'Export' },
    ],
    [tree],
  );

  if (!tree) {
    return (
      <main className="shell py-[48px]">
        {error ? (
          <p role="alert" className="t-body text-saffron">
            {error}
          </p>
        ) : (
          <p className="t-body text-ash">Loading content…</p>
        )}
      </main>
    );
  }

  return (
    <main className="shell pb-[96px]">
      <div className="sticky top-0 z-[10] -mx-[var(--gutter)] bg-void/95 px-[var(--gutter)] pt-[24px] backdrop-blur-[8px]">
        <div className="flex flex-wrap items-center justify-between gap-[18px]">
          <div className="flex flex-wrap gap-[18px]">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`t-nav transition-colors ${
                  tab === t.id ? 'text-saffron' : 'text-ash hover:text-bone'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-[12px]">
            {dirty && <span className="t-caption text-saffron">Unsaved changes</span>}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || busy}
              className="pill !py-[8px] !px-[18px] disabled:opacity-40"
            >
              {busy ? 'Saving' : 'Save everything'}
            </button>
          </div>
        </div>
        <div className="hairline mt-[24px]" />
      </div>

      <div className="pt-[24px]">
        {error && (
          <p role="alert" className="t-caption mb-[18px] text-saffron">
            {error}
          </p>
        )}
        {note && (
          <p aria-live="polite" className="t-caption mb-[18px] text-verdant">
            {note}
          </p>
        )}

        {tab === 'projects' && (
          <ProjectsTab
            projects={tree.projects}
            onChange={(projects) => patch((t) => ({ ...t, projects }))}
          />
        )}
        {tab === 'roles' && (
          <RolesTab
            roles={tree.roles}
            projects={tree.projects}
            onChange={(roles) => patch((t) => ({ ...t, roles }))}
          />
        )}
        {tab === 'achievements' && (
          <AchievementsTab
            achievements={tree.achievements}
            projects={tree.projects}
            onChange={(achievements) => patch((t) => ({ ...t, achievements }))}
          />
        )}
        {tab === 'profile' && (
          <ProfileTab
            profile={tree.profile}
            onChange={(profile) => patch((t) => ({ ...t, profile }))}
          />
        )}
        {tab === 'colors' && (
          <ColorsTab
            colors={tree.colors ?? {}}
            onChange={(colors) => patch((t) => ({ ...t, colors }))}
          />
        )}
        {tab === 'preview' && <PreviewGraph key={previewKey} projects={tree.projects} />}
        {tab === 'export' && <ExportTab code={code} />}
      </div>
    </main>
  );
}

/** Backfills any list keys the backend may have dropped, so tabs never blank out on load. */
function mergeWithStaticShape(raw: unknown): Tree {
  const t = (raw as Partial<Tree>) ?? {};
  return {
    profile: (t.profile as Profile) ?? staticProfile,
    roles: Array.isArray(t.roles) ? (t.roles as Role[]) : staticRoles,
    projects: Array.isArray(t.projects) ? (t.projects as Project[]) : staticProjects,
    achievements: Array.isArray(t.achievements)
      ? (t.achievements as Achievement[])
      : staticAchievements,
    colors: (t.colors as ColorOverrides) ?? {},
  };
}

/* ── projects tab ────────────────────────────────────────────────────────── */

const EMPTY_PROJECT: Project = {
  slug: '',
  name: '',
  year: '',
  context: '',
  blurb: '',
  tech: [],
  domains: [],
};

function ProjectsTab({
  projects,
  onChange,
}: {
  projects: Project[];
  onChange: (p: Project[]) => void;
}) {
  // Tracked by INDEX, not slug: the Slug field itself is editable, and
  // tracking by slug meant the very first keystroke into that field changed
  // project.slug, the lookup-by-old-slug below failed to find anything, and
  // the whole form unmounted — which read as "the project just closes."
  // Index is stable across a rename; it only needs adjusting on delete.
  const [editing, setEditing] = useState<number | null>(null);

  const target = editing !== null ? (projects[editing] ?? null) : null;

  const startNew = () => {
    const draft: Project = { ...EMPTY_PROJECT, slug: `new-${Date.now().toString(36)}` };
    onChange([draft, ...projects]);
    setEditing(0);
  };

  const remove = (index: number) => {
    if (!confirm('Remove this project? It disappears from the live site on next save.')) return;
    onChange(projects.filter((_, i) => i !== index));
    setEditing((e) => {
      if (e === null) return e;
      if (e === index) return null;
      return e > index ? e - 1 : e;
    });
  };

  return (
    <div className="grid gap-[36px] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <button type="button" onClick={startNew} className="pill mb-[18px]">
          Add project
        </button>
        <div className="border-t border-ash/20">
          {projects.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setEditing(i)}
              className={`block w-full border-b border-ash/20 py-[14px] text-left transition-colors ${
                editing === i ? 'bg-ash/5' : 'hover:bg-ash/[0.03]'
              }`}
            >
              <p className="t-heading-2xs text-bone">
                {p.name || <span className="text-ash">Untitled</span>}
                {p.featured && <span className="t-caption ml-[10px] text-saffron">featured</span>}
              </p>
              <p className="t-caption mt-[2px] text-ash">
                {[p.context, p.year].filter(Boolean).join(', ')}
              </p>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="t-body py-[18px] text-ash">No projects yet. Add one.</p>
          )}
        </div>
      </div>

      {target && editing !== null ? (
        <ProjectForm
          key={editing}
          project={target}
          onChange={(updated) =>
            onChange(projects.map((p, i) => (i === editing ? updated : p)))
          }
          onRemove={() => remove(editing)}
        />
      ) : (
        <p className="t-body text-ash">Select a project on the left, or add a new one.</p>
      )}
    </div>
  );
}

function ProjectForm({
  project,
  onChange,
  onRemove,
}: {
  project: Project;
  onChange: (p: Project) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Project>) => onChange({ ...project, ...patch });

  return (
    <div className="glass-card glass-project max-w-[720px] rounded-[24px] p-[24px]">
      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Slug" hint="URL-safe, unique." value={project.slug} onChange={(slug) => set({ slug })} />
        <Field label="Name" value={project.name} onChange={(name) => set({ name })} />
      </div>
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field label="Year" value={project.year} onChange={(year) => set({ year })} placeholder="2026" />
        <Field
          label="Context"
          value={project.context}
          onChange={(context) => set({ context })}
          placeholder="Ascentt AITek"
        />
      </div>
      <Field
        className="mt-[12px]"
        label="Blurb"
        hint="One line. What shows in the collapsed work row."
        value={project.blurb}
        onChange={(blurb) => set({ blurb })}
      />
      <div className="mt-[12px] space-y-[12px]">
        <Field label="Challenge" area value={project.challenge ?? ''} onChange={(challenge) => set({ challenge })} />
        <Field label="Approach" area value={project.approach ?? ''} onChange={(approach) => set({ approach })} />
        <Field label="Outcome" area value={project.outcome ?? ''} onChange={(outcome) => set({ outcome })} />
      </div>
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field
          label="Tech"
          hint="Comma separated. Each becomes a node in the graph."
          value={project.tech.join(', ')}
          onChange={(v) => set({ tech: splitList(v) })}
          placeholder="Python, PyTorch"
        />
        <Field
          label="Domains"
          hint="Comma separated. Reuse existing ones to link projects together."
          value={project.domains.join(', ')}
          onChange={(v) => set({ domains: splitList(v) })}
          placeholder="Computer vision, RAG"
        />
      </div>

      <label className="mt-[18px] flex items-center gap-[10px] text-mist">
        <input
          type="checkbox"
          checked={project.featured ?? false}
          onChange={(e) => set({ featured: e.target.checked })}
          className="h-[16px] w-[16px] accent-iris"
        />
        <span className="t-body">Featured — leads the work list and opens expanded</span>
      </label>

      <div className="mt-[24px]">
        <button type="button" onClick={onRemove} className="ghost !text-saffron hover:!opacity-70">
          Delete this project
        </button>
      </div>
    </div>
  );
}

/* ── roles tab ───────────────────────────────────────────────────────────── */

const EMPTY_ROLE: Role = {
  slug: '',
  company: '',
  title: '',
  location: '',
  period: '',
  summary: '',
  projects: [],
};

function RolesTab({
  roles,
  projects,
  onChange,
}: {
  roles: Role[];
  projects: Project[];
  onChange: (r: Role[]) => void;
}) {
  // Same index-based fix as ProjectsTab — see the comment there.
  const [editing, setEditing] = useState<number | null>(null);
  const target = editing !== null ? (roles[editing] ?? null) : null;

  const startNew = () => {
    const draft: Role = { ...EMPTY_ROLE, slug: `new-${Date.now().toString(36)}` };
    onChange([draft, ...roles]);
    setEditing(0);
  };
  const remove = (index: number) => {
    if (!confirm('Remove this role?')) return;
    onChange(roles.filter((_, i) => i !== index));
    setEditing((e) => {
      if (e === null) return e;
      if (e === index) return null;
      return e > index ? e - 1 : e;
    });
  };

  return (
    <div className="grid gap-[36px] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <button type="button" onClick={startNew} className="pill mb-[18px]">
          Add role
        </button>
        <div className="border-t border-ash/20">
          {roles.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setEditing(i)}
              className={`block w-full border-b border-ash/20 py-[14px] text-left transition-colors ${
                editing === i ? 'bg-ash/5' : 'hover:bg-ash/[0.03]'
              }`}
            >
              <p className="t-heading-2xs text-bone">{r.company || <span className="text-ash">Untitled</span>}</p>
              <p className="t-caption mt-[2px] text-ash">{r.title}</p>
            </button>
          ))}
          {roles.length === 0 && <p className="t-body py-[18px] text-ash">No roles yet.</p>}
        </div>
      </div>

      {target && editing !== null ? (
        <RoleForm
          key={editing}
          role={target}
          projects={projects}
          onChange={(updated) => onChange(roles.map((r, i) => (i === editing ? updated : r)))}
          onRemove={() => remove(editing)}
        />
      ) : (
        <p className="t-body text-ash">Select a role on the left, or add a new one.</p>
      )}
    </div>
  );
}

function RoleForm({
  role,
  projects,
  onChange,
  onRemove,
}: {
  role: Role;
  projects: Project[];
  onChange: (r: Role) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Role>) => onChange({ ...role, ...patch });
  const toggleProject = (slug: string) => {
    const next = role.projects.includes(slug)
      ? role.projects.filter((s) => s !== slug)
      : [...role.projects, slug];
    set({ projects: next });
  };

  return (
    <div className="glass-card glass-role max-w-[720px] rounded-[24px] p-[24px]">
      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Slug" value={role.slug} onChange={(slug) => set({ slug })} />
        <Field label="Company" value={role.company} onChange={(company) => set({ company })} />
      </div>
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field label="Title" value={role.title} onChange={(title) => set({ title })} />
        <Field label="Location" value={role.location} onChange={(location) => set({ location })} />
      </div>
      <Field
        className="mt-[12px]"
        label="Period"
        value={role.period}
        onChange={(period) => set({ period })}
        placeholder="Feb 2025 – Present"
      />
      <Field
        className="mt-[12px]"
        label="Summary"
        area
        value={role.summary}
        onChange={(summary) => set({ summary })}
      />

      <div className="mt-[18px]">
        <p className="t-caption mb-[8px] text-ash">
          Projects worked on here — check any project. Each connects to this role in the graph.
        </p>
        <div className="grid gap-[6px] sm:grid-cols-2">
          {projects.map((p) => (
            <label key={p.slug} className="flex items-center gap-[10px] text-mist">
              <input
                type="checkbox"
                checked={role.projects.includes(p.slug)}
                onChange={() => toggleProject(p.slug)}
                className="h-[14px] w-[14px] accent-iris"
              />
              <span className="t-body">{p.name || p.slug}</span>
            </label>
          ))}
          {projects.length === 0 && <p className="t-body text-ash">Add projects first.</p>}
        </div>
      </div>

      <div className="mt-[24px]">
        <button type="button" onClick={onRemove} className="ghost !text-saffron hover:!opacity-70">
          Delete this role
        </button>
      </div>
    </div>
  );
}

/* ── achievements tab ────────────────────────────────────────────────────── */

const EMPTY_ACHIEVEMENT: Achievement = { slug: '', name: '', detail: '' };

function AchievementsTab({
  achievements,
  projects,
  onChange,
}: {
  achievements: Achievement[];
  projects: Project[];
  onChange: (a: Achievement[]) => void;
}) {
  const startNew = () => {
    const draft: Achievement = { ...EMPTY_ACHIEVEMENT, slug: `new-${Date.now().toString(36)}` };
    onChange([draft, ...achievements]);
  };
  const remove = (slug: string) => {
    if (!confirm('Remove this achievement?')) return;
    onChange(achievements.filter((a) => a.slug !== slug));
  };
  const update = (slug: string, patch: Partial<Achievement>) =>
    onChange(achievements.map((a) => (a.slug === slug ? { ...a, ...patch } : a)));

  return (
    <div className="max-w-[860px]">
      <button type="button" onClick={startNew} className="pill mb-[18px]">
        Add achievement
      </button>
      <div className="space-y-[24px]">
        {achievements.map((a) => (
          <div key={a.slug} className="glass-card glass-achievement rounded-[18px] p-[18px]">
            <div className="grid gap-[12px] sm:grid-cols-2">
              <Field label="Slug" value={a.slug} onChange={(slug) => update(a.slug, { slug })} />
              <Field label="Name" value={a.name} onChange={(name) => update(a.slug, { name })} />
            </div>
            <Field
              className="mt-[12px]"
              label="Detail"
              area
              value={a.detail}
              onChange={(detail) => update(a.slug, { detail })}
            />
            <div className="mt-[12px]">
              <label className="t-caption block text-ash">Linked project (optional)</label>
              <select
                value={a.project ?? ''}
                onChange={(e) => update(a.slug, { project: e.target.value || undefined })}
                className="mt-[6px] w-full rounded-[18px] border border-ash/20 bg-transparent px-[16px] py-[12px] t-body text-bone outline-none focus:border-iris"
              >
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name || p.slug}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-[12px]">
              <button
                type="button"
                onClick={() => remove(a.slug)}
                className="tag hover:!text-saffron"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {achievements.length === 0 && (
          <p className="t-body text-ash">No achievements yet. Add one.</p>
        )}
      </div>
    </div>
  );
}

/* ── profile tab ─────────────────────────────────────────────────────────── */

function ProfileTab({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });

  return (
    <div className="max-w-[720px]">
      <p className="t-body mb-[24px] text-mist">
        The header, hero and footer all read from this. Changes are live everywhere on next page
        load.
      </p>

      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Name" value={profile.name} onChange={(name) => set({ name })} />
        <Field label="Title" value={profile.title} onChange={(title) => set({ title })} />
      </div>
      <Field
        className="mt-[12px]"
        label="Positioning"
        area
        hint="The hero paragraph. Two lines max."
        value={profile.positioning}
        onChange={(positioning) => set({ positioning })}
      />
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field label="Location" value={profile.location} onChange={(location) => set({ location })} />
        <Field
          label="Availability"
          value={profile.availability}
          onChange={(availability) => set({ availability })}
        />
      </div>
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field label="Email" value={profile.email} onChange={(email) => set({ email })} />
        <Field label="Phone" value={profile.phone} onChange={(phone) => set({ phone })} />
      </div>
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field label="GitHub" value={profile.github} onChange={(github) => set({ github })} />
        <Field label="LinkedIn" value={profile.linkedin} onChange={(linkedin) => set({ linkedin })} />
      </div>
      <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2">
        <Field
          label="Live project URL"
          value={profile.liveProject}
          onChange={(liveProject) => set({ liveProject })}
        />
        <Field label="Resume path" value={profile.resume} onChange={(resume) => set({ resume })} />
      </div>
      <Field
        className="mt-[12px]"
        label="Experience length"
        hint="How this is phrased in the about block. Keep it vague so it can't go stale."
        value={profile.experienceLength}
        onChange={(experienceLength) => set({ experienceLength })}
      />
    </div>
  );
}

/* ── colors tab ──────────────────────────────────────────────────────────── */

const NODE_FIELDS: Array<{ key: keyof NonNullable<ThemeOverrides['graph']> & string; label: string; hint: string }> = [
  { key: 'person', label: 'Main node (you)', hint: 'The queen-bee node at the centre of the graph.' },
  { key: 'role', label: 'Role node', hint: 'Where you worked — the hub nodes one ring out.' },
  { key: 'project', label: 'Project node', hint: 'Each shipped project.' },
  { key: 'domain', label: 'Domain node', hint: 'Problem domains — computer vision, RAG, etc.' },
  { key: 'tech', label: 'Tech node', hint: 'Individual tools and frameworks.' },
  { key: 'achievement', label: 'Achievement node', hint: 'Recognitions and awards.' },
  { key: 'link', label: 'Connecting lines', hint: 'The threads between nodes.' },
];

const CARD_FIELDS: Array<{ key: keyof NonNullable<ThemeOverrides['cards']> & string; label: string; hint: string }> = [
  { key: 'base', label: 'General card', hint: 'Ask AI, About, Contact, admin panels — everything without a more specific kind.' },
  { key: 'project', label: 'Project card', hint: 'Project detail cards, the graph readout when a project is selected.' },
  { key: 'tech', label: 'Tech / domain card', hint: 'Technology and domain readouts.' },
  { key: 'role', label: 'Role card', hint: 'Role detail cards.' },
  { key: 'achievement', label: 'Achievement card', hint: 'Achievement rows and readouts.' },
];

function ColorsTab({
  colors,
  onChange,
}: {
  colors: ColorOverrides;
  onChange: (c: ColorOverrides) => void;
}) {
  const [theme, setTheme] = useState<Theme>('dark');
  const defaults = THEMES[theme];
  const overrides: ThemeOverrides = colors[theme] ?? {};

  const setGraph = (key: string, value: string | undefined) => {
    const nextGraph = { ...overrides.graph };
    if (value) nextGraph[key as keyof typeof nextGraph] = value;
    else delete nextGraph[key as keyof typeof nextGraph];
    onChange({ ...colors, [theme]: { ...overrides, graph: nextGraph } });
  };

  const setCard = (key: string, value: string | undefined) => {
    const nextCards = { ...overrides.cards };
    if (value) nextCards[key as keyof typeof nextCards] = value;
    else delete nextCards[key as keyof typeof nextCards];
    onChange({ ...colors, [theme]: { ...overrides, cards: nextCards } });
  };

  const setLinkWidth = (value: number | undefined) => {
    const next = { ...overrides, linkWidth: value };
    if (value === undefined) delete next.linkWidth;
    onChange({ ...colors, [theme]: next });
  };

  const resetTheme = () => {
    if (!confirm(`Reset every ${theme}-mode color to its default?`)) return;
    onChange({ ...colors, [theme]: {} });
  };

  return (
    <div className="max-w-[900px]">
      <p className="t-body mb-[18px] text-mist">
        Pick a color and it takes effect immediately, everywhere — the graph, the liquid-glass
        cards, all of it — before you even hit Save. Save writes it for every visitor; leaving
        without saving reverts to the defaults below on the next load.
      </p>

      <div className="mb-[24px] flex items-center gap-[18px]">
        <div className="inline-flex overflow-hidden rounded-full border border-ash/25">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              aria-pressed={theme === t}
              className={`t-nav px-[18px] py-[8px] transition-colors ${
                theme === t ? 'bg-iris text-white' : 'text-ash hover:text-bone'
              }`}
            >
              {t === 'dark' ? 'Dark mode' : 'Light mode'}
            </button>
          ))}
        </div>
        <button type="button" onClick={resetTheme} className="ghost">
          Reset {theme} to defaults
        </button>
      </div>

      <div className="glass-card glass-project mb-[36px] rounded-[24px] p-[24px]">
        <h3 className="t-heading-2xs mb-[4px] text-bone">Node colors</h3>
        <p className="t-caption mb-[18px] text-ash">
          Each kind of node in the constellation graph.
        </p>
        <div className="grid gap-[18px] sm:grid-cols-2">
          {NODE_FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={overrides.graph?.[f.key] ?? defaults.graph[f.key]}
              isDefault={!overrides.graph?.[f.key]}
              onChange={(v) => setGraph(f.key, v)}
              onReset={() => setGraph(f.key, undefined)}
            />
          ))}
        </div>

        <div className="mt-[24px] border-t border-ash/15 pt-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-[4px]">
            <div>
              <p className="t-body text-bone">Connecting line thickness</p>
              <p className="t-caption text-ash">
                The threads between nodes. Open this and drag whenever you want them bolder for a
                demo, thinner otherwise.
              </p>
            </div>
            {overrides.linkWidth !== undefined && (
              <button
                type="button"
                onClick={() => setLinkWidth(undefined)}
                className="t-caption text-ash underline hover:text-bone"
              >
                Reset
              </button>
            )}
          </div>
          <div className="mt-[12px] flex items-center gap-[14px]">
            <input
              type="range"
              min={0.05}
              max={3}
              step={0.05}
              value={overrides.linkWidth ?? defaults.graph.linkWidth}
              onChange={(e) => setLinkWidth(Number(e.target.value))}
              className="h-[4px] w-full max-w-[320px] flex-1 cursor-pointer accent-iris"
            />
            <span className="t-caption w-[40px] text-right font-mono text-mist">
              {(overrides.linkWidth ?? defaults.graph.linkWidth).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="glass-card glass-achievement rounded-[24px] p-[24px]">
        <h3 className="t-heading-2xs mb-[4px] text-bone">Card colors</h3>
        <p className="t-caption mb-[18px] text-ash">
          The tint each liquid-glass card's frosted background and border are derived from.
        </p>
        <div className="grid gap-[18px] sm:grid-cols-2">
          {CARD_FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={overrides.cards?.[f.key] ?? defaults.cardTints[f.key]}
              isDefault={!overrides.cards?.[f.key]}
              onChange={(v) => setCard(f.key, v)}
              onReset={() => setCard(f.key, undefined)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  isDefault,
  onChange,
  onReset,
}: {
  label: string;
  hint: string;
  value: string;
  isDefault: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const id = `color-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex items-start gap-[12px]">
      <label htmlFor={id} className="relative mt-[2px] shrink-0 cursor-pointer">
        <span
          className="block h-[36px] w-[36px] rounded-full border border-ash/30"
          style={{ background: value }}
        />
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px]">
          <p className="t-body text-bone">{label}</p>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="w-[92px] rounded-[8px] border border-ash/20 bg-transparent px-[8px] py-[2px] font-mono text-[12px] text-mist outline-none focus:border-iris"
          />
          {!isDefault && (
            <button type="button" onClick={onReset} className="t-caption text-ash underline hover:text-bone">
              Reset
            </button>
          )}
        </div>
        <p className="t-caption mt-[2px] text-ash">{hint}</p>
      </div>
    </div>
  );
}

/* ── preview + export ────────────────────────────────────────────────────── */

function PreviewGraph({ projects }: { projects: Project[] }) {
  return (
    <div className="max-w-[1080px]">
      <p className="t-body text-mist">
        Same graph the marketing site uses. Reflects your current unsaved edits — projects, their
        tech and their domains all update the graph.
      </p>
      <p className="t-caption mt-[6px] text-ash">{projects.length} projects total.</p>
      <div className="glass-card glass-project mt-[24px] overflow-hidden rounded-[24px]">
        <Suspense
          fallback={
            <div className="flex h-[560px] items-center justify-center">
              <p className="t-caption text-ash">Loading the graph…</p>
            </div>
          }
        >
          <Constellation className="h-[560px] w-full" projects={projects} zoom={1.1} />
        </Suspense>
      </div>
    </div>
  );
}

function ExportTab({ code }: { code: string }) {
  return (
    <div className="max-w-[860px]">
      <p className="t-body text-mist">
        Paste this into the <code className="text-saffron">projects</code> array in{' '}
        <code className="text-saffron">src/lib/content.ts</code>. That makes an entry permanent,
        ships it in the static bundle, and means it survives a host with an ephemeral filesystem.
        Only the projects slice is exported — roles / achievements / profile are edited in the
        panel and live on the backend.
      </p>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(code)}
        className="pill mt-[18px]"
      >
        Copy
      </button>
      <pre className="glass-card mt-[18px] overflow-x-auto rounded-[24px] p-[24px] font-mono text-[13px] leading-[1.7] text-mist">
        {code || '// No projects yet.'}
      </pre>
    </div>
  );
}

/* ── shared inputs ───────────────────────────────────────────────────────── */

function splitList(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  area = false,
  hint,
  placeholder,
  required,
  autoComplete,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  area?: boolean;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  const id = `f-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const shared =
    'w-full rounded-[18px] border border-ash/20 bg-transparent px-[16px] py-[12px] t-body text-bone outline-none transition-colors focus:border-iris placeholder:text-ash';

  return (
    <div className={className}>
      <label htmlFor={id} className="t-caption block text-ash">
        {label}
      </label>
      {/*
        Always reserve the hint's line, even blank. A hint on one field but
        not its grid sibling (e.g. Slug's "URL-safe, unique." next to a
        hint-less Name field) used to leave that row's inputs starting at two
        different heights — the "skewed" form look. An invisible placeholder
        keeps every field in a row starting from the same baseline whether or
        not it happens to have a hint.
      */}
      <p className={`t-caption mt-[2px] text-ash opacity-70 ${hint ? '' : 'invisible'}`}>
        {hint || '\u00A0'}
      </p>
      {area ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} mt-[6px] resize-none`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} mt-[6px]`}
        />
      )}
    </div>
  );
}