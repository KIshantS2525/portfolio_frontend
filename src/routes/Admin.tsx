// frontend/src/routes/Admin.tsx
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from '@/components/core/Header';
import type {
  Project,
  Role,
  Achievement,
  Profile,
  Education,
  StackRow,
  Metric,
  Link as ProjectLink,
} from '@/lib/content';
import {
  normaliseTree,
  PREVIEW_MESSAGE,
  PREVIEW_READY,
  PREVIEW_SCROLL,
  STATIC_TREE as SITE_STATIC_TREE,
  type ContentTree,
} from '@/lib/useContent';
import { BASE, type ColorOverrides } from '@/lib/colorOverrides';

/**
 * Admin.
 *
 * A whole-content editor: projects, roles, achievements, the profile, the
 * About copy and education, skills and the stack strips, the headline
 * numbers and the Ask AI suggested questions. Every change flows straight into
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
 * Deploy note: the backend stores the tree in Upstash Redis when its
 * UPSTASH_REDIS_REST_URL / _TOKEN env vars are set (works on Vercel), and in
 * a content.json file otherwise — which only persists on a host with a real
 * disk (VPS, Render, Fly, Docker). See backend/admin.py. The Export tab
 * remains as a way to bake projects into content.ts permanently.
 */

type Tree = ContentTree;

const API = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'ishant:admin-token';

const STATIC_TREE: Tree = { ...SITE_STATIC_TREE, colors: {} };

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

type Tab =
  | 'projects'
  | 'roles'
  | 'achievements'
  | 'profile'
  | 'about'
  | 'skills'
  | 'extras'
  | 'colors'
  | 'preview'
  | 'export';

function Panel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [tab, setTab] = useState<Tab>('projects');
  const [tree, setTree] = useState<Tree | null>(null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

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
      { id: 'about', label: 'About & education' },
      { id: 'skills', label: 'Skills & stack' },
      { id: 'extras', label: 'Numbers & questions' },
      { id: 'colors', label: 'Colors' },
      { id: 'preview', label: 'Live preview' },
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
        {tab === 'about' && (
          <AboutTab
            about={tree.about}
            education={tree.education}
            onAbout={(about) => patch((t) => ({ ...t, about }))}
            onEducation={(education) => patch((t) => ({ ...t, education }))}
          />
        )}
        {tab === 'skills' && (
          <SkillsTab
            skills={tree.skills}
            stack={tree.stack}
            onSkills={(skills) => patch((t) => ({ ...t, skills }))}
            onStack={(stack) => patch((t) => ({ ...t, stack }))}
          />
        )}
        {tab === 'extras' && (
          <ExtrasTab
            metrics={tree.metrics}
            questions={tree.questions}
            onMetrics={(metrics) => patch((t) => ({ ...t, metrics }))}
            onQuestions={(questions) => patch((t) => ({ ...t, questions }))}
          />
        )}
        {tab === 'colors' && (
          <ColorsTab
            colors={tree.colors ?? {}}
            tree={tree}
            onChange={(colors) => patch((t) => ({ ...t, colors }))}
          />
        )}
        {tab === 'preview' && <LivePreview tree={tree} />}
        {tab === 'export' && <ExportTab code={code} />}
      </div>
    </main>
  );
}

/**
 * Backfills anything the stored tree is missing — including whole sections
 * from before the panel could edit them — from the compiled content, using
 * the same rules as the live site (see normaliseTree in useContent.ts).
 */
function mergeWithStaticShape(raw: unknown): Tree {
  const t = normaliseTree(raw) ?? STATIC_TREE;
  return { ...t, colors: t.colors ?? {} };
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
        <ListField
          label="Tech"
          hint="Comma separated. Each becomes a node in the graph."
          value={project.tech}
          onChange={(tech) => set({ tech })}
          placeholder="Python, PyTorch"
        />
        <ListField
          label="Domains"
          hint="Comma separated. Reuse existing ones to link projects together."
          value={project.domains}
          onChange={(domains) => set({ domains })}
          placeholder="Computer vision, RAG"
        />
      </div>
      <ParagraphsField
        className="mt-[12px]"
        label="More detail"
        hint="Extra paragraphs in the project panel. Leave a blank line between paragraphs."
        value={project.detail ?? []}
        onChange={(detail) => set({ detail: detail.length ? detail : undefined })}
      />
      <LinksField
        className="mt-[12px]"
        label="Links"
        hint="One per line: Label | https://url"
        value={project.links ?? []}
        onChange={(links) => set({ links: links.length ? links : undefined })}
      />

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
  // By index, not slug: editing the Slug field used to change the key on
  // every keystroke, remounting the card and dropping the cursor.
  const remove = (index: number) => {
    if (!confirm('Remove this achievement?')) return;
    onChange(achievements.filter((_, i) => i !== index));
  };
  const update = (index: number, patch: Partial<Achievement>) =>
    onChange(achievements.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  return (
    <div className="max-w-[860px]">
      <button type="button" onClick={startNew} className="pill mb-[18px]">
        Add achievement
      </button>
      <div className="space-y-[24px]">
        {achievements.map((a, i) => (
          <div key={i} className="glass-card glass-achievement rounded-[18px] p-[18px]">
            <div className="grid gap-[12px] sm:grid-cols-2">
              <Field label="Slug" value={a.slug} onChange={(slug) => update(i, { slug })} />
              <Field label="Name" value={a.name} onChange={(name) => update(i, { name })} />
            </div>
            <Field
              className="mt-[12px]"
              label="Detail"
              area
              value={a.detail}
              onChange={(detail) => update(i, { detail })}
            />
            <div className="mt-[12px]">
              <label className="t-caption block text-ash">Linked project (optional)</label>
              <select
                value={a.project ?? ''}
                onChange={(e) => update(i, { project: e.target.value || undefined })}
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
                onClick={() => remove(i)}
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
        The header, hero, contact section, footer and the Ask AI chat all read from this.
        Changes are live everywhere on the next page load.
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

/* ── about & education tab ───────────────────────────────────────────────── */

const EMPTY_EDUCATION: Education = { qualification: '', institution: '', period: '', result: '' };

function AboutTab({
  about,
  education,
  onAbout,
  onEducation,
}: {
  about: string[];
  education: Education[];
  onAbout: (a: string[]) => void;
  onEducation: (e: Education[]) => void;
}) {
  const update = (index: number, patch: Partial<Education>) =>
    onEducation(education.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  const remove = (index: number) => {
    if (!confirm('Remove this education entry?')) return;
    onEducation(education.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-[860px] space-y-[48px]">
      <section>
        <h2 className="t-heading-2xs text-bone">About</h2>
        <ParagraphsField
          className="mt-[12px]"
          label="About paragraphs"
          hint="The About section. Leave a blank line between paragraphs."
          rows={8}
          value={about}
          onChange={onAbout}
        />
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="t-heading-2xs text-bone">Education</h2>
          <button
            type="button"
            onClick={() => onEducation([...education, { ...EMPTY_EDUCATION }])}
            className="pill !py-[8px] !px-[18px]"
          >
            Add education
          </button>
        </div>
        <div className="mt-[18px] space-y-[18px]">
          {education.map((e, i) => (
            <div key={i} className="glass-card rounded-[18px] p-[18px]">
              <div className="grid gap-[12px] sm:grid-cols-2">
                <Field
                  label="Qualification"
                  value={e.qualification}
                  onChange={(qualification) => update(i, { qualification })}
                  placeholder="B.Tech, AI & ML"
                />
                <Field
                  label="Institution"
                  value={e.institution}
                  onChange={(institution) => update(i, { institution })}
                />
                <Field
                  label="Period"
                  value={e.period}
                  onChange={(period) => update(i, { period })}
                  placeholder="2021–2025"
                />
                <Field
                  label="Result"
                  value={e.result}
                  onChange={(result) => update(i, { result })}
                  placeholder="CGPA 7.3/10"
                />
              </div>
              <RowActions
                index={i}
                count={education.length}
                onMove={(to) => onEducation(move(education, i, to))}
                onRemove={() => remove(i)}
              />
            </div>
          ))}
          {education.length === 0 && <p className="t-body text-ash">No education entries.</p>}
        </div>
      </section>
    </div>
  );
}

/* ── skills & stack tab ──────────────────────────────────────────────────── */

function SkillsTab({
  skills,
  stack,
  onSkills,
  onStack,
}: {
  skills: Record<string, string[]>;
  stack: StackRow[];
  onSkills: (s: Record<string, string[]>) => void;
  onStack: (s: StackRow[]) => void;
}) {
  // Skills are stored as { group: items }, edited as an ordered list so a
  // group can be renamed in place without jumping to the end.
  const groups = Object.entries(skills);
  const setGroups = (next: [string, string[]][]) => onSkills(Object.fromEntries(next));
  const updateGroup = (index: number, name: string, items: string[]) =>
    setGroups(groups.map((g, i) => (i === index ? [name, items] : g)));

  const updateRow = (index: number, patch: Partial<StackRow>) =>
    onStack(stack.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="max-w-[860px] space-y-[48px]">
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="t-heading-2xs text-bone">Skills</h2>
            <p className="t-caption mt-[2px] text-ash">The grouped list beside the About text.</p>
          </div>
          <button
            type="button"
            onClick={() => setGroups([...groups, [`New group ${groups.length + 1}`, []]])}
            className="pill !py-[8px] !px-[18px]"
          >
            Add group
          </button>
        </div>
        <div className="mt-[18px] space-y-[18px]">
          {groups.map(([name, items], i) => (
            <div key={i} className="glass-card glass-tech rounded-[18px] p-[18px]">
              <Field label="Group" value={name} onChange={(n) => updateGroup(i, n, items)} />
              <ListField
                className="mt-[12px]"
                label="Skills"
                hint="Comma separated."
                value={items}
                onChange={(next) => updateGroup(i, name, next)}
              />
              <RowActions
                index={i}
                count={groups.length}
                onMove={(to) => setGroups(move(groups, i, to))}
                onRemove={() => {
                  if (confirm(`Remove the "${name}" group?`)) setGroups(groups.filter((_, j) => j !== i));
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="t-heading-2xs text-bone">Stack strips</h2>
            <p className="t-caption mt-[2px] text-ash">
              The scrolling logo rows. A name with a known logo shows the logo; others show as text.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onStack([...stack, { label: 'New row', items: [] }])}
            className="pill !py-[8px] !px-[18px]"
          >
            Add row
          </button>
        </div>
        <div className="mt-[18px] space-y-[18px]">
          {stack.map((r, i) => (
            <div key={i} className="glass-card glass-tech rounded-[18px] p-[18px]">
              <Field label="Row label" value={r.label} onChange={(label) => updateRow(i, { label })} />
              <ListField
                className="mt-[12px]"
                label="Items"
                hint="Comma separated."
                value={r.items}
                onChange={(items) => updateRow(i, { items })}
              />
              <RowActions
                index={i}
                count={stack.length}
                onMove={(to) => onStack(move(stack, i, to))}
                onRemove={() => {
                  if (confirm(`Remove the "${r.label}" row?`)) onStack(stack.filter((_, j) => j !== i));
                }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── numbers & questions tab ─────────────────────────────────────────────── */

function ExtrasTab({
  metrics,
  questions,
  onMetrics,
  onQuestions,
}: {
  metrics: Metric[];
  questions: string[];
  onMetrics: (m: Metric[]) => void;
  onQuestions: (q: string[]) => void;
}) {
  const update = (index: number, patch: Partial<Metric>) =>
    onMetrics(metrics.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <div className="max-w-[860px] space-y-[48px]">
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="t-heading-2xs text-bone">Headline numbers</h2>
            <p className="t-caption mt-[2px] text-ash">
              The big flip-counter numbers in the opening scroll. Four fit one row on desktop.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onMetrics([...metrics, { value: '', label: '' }])}
            className="pill !py-[8px] !px-[18px]"
          >
            Add number
          </button>
        </div>
        <div className="mt-[18px] space-y-[18px]">
          {metrics.map((m, i) => (
            <div key={i} className="glass-card rounded-[18px] p-[18px]">
              <div className="grid gap-[12px] sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Field label="Number" value={m.value} onChange={(value) => update(i, { value })} placeholder="25" />
                <Field
                  label="Label"
                  value={m.label}
                  onChange={(label) => update(i, { label })}
                  placeholder="systems shipped"
                />
              </div>
              <RowActions
                index={i}
                count={metrics.length}
                onMove={(to) => onMetrics(move(metrics, i, to))}
                onRemove={() => onMetrics(metrics.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="t-heading-2xs text-bone">Ask AI suggestions</h2>
        <LinesField
          className="mt-[12px]"
          label="Suggested questions"
          hint="One per line. They rotate in the Ask AI box as hints."
          rows={6}
          value={questions}
          onChange={onQuestions}
        />
      </section>
    </div>
  );
}

/** Move up / down / remove, under each card in the list editors. */
function RowActions({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-[12px] flex gap-[18px]">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        className="tag hover:!text-bone disabled:opacity-30"
      >
        Move up
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        className="tag hover:!text-bone disabled:opacity-30"
      >
        Move down
      </button>
      <button type="button" onClick={onRemove} className="tag hover:!text-saffron">
        Remove
      </button>
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/* ── colors tab ──────────────────────────────────────────────────────────── */

/*
 * One colour set — the site is night only now, so the old dark/light split is
 * gone. Every field shows the colour the live homepage is using right now
 * (your saved override, or the built-in default) and changes it in the live
 * preview beside it as you edit. Nothing reaches visitors until Save.
 */

type Section = 'page' | 'sky' | 'galaxy' | 'graph' | 'cards';
type ColorDef = { key: string; label: string; hint?: string };

const PAGE_FIELDS: ColorDef[] = [
  { key: 'surface', label: 'Page background', hint: 'Behind everything. Also the nav bar and the browser tab colour.' },
  { key: 'surfaceRaised', label: 'Cards & panels', hint: 'The project panel, menus and raised boxes.' },
  { key: 'text', label: 'Headings', hint: 'Your name, section titles, project names.' },
  { key: 'textBody', label: 'Body text', hint: 'Paragraphs.' },
  { key: 'textMuted', label: 'Muted text', hint: 'Captions, labels, nav links.' },
  { key: 'accent', label: 'Accent', hint: 'Buttons, the timeline line and dots, text selection.' },
  { key: 'accentHover', label: 'Accent hover', hint: 'Buttons under the cursor.' },
  { key: 'accentInk', label: 'Text on accent', hint: 'Button labels.' },
  { key: 'emphasis', label: 'Highlight', hint: 'Years, links and small labels (the amber).' },
  { key: 'hairline', label: 'Lines & borders', hint: 'Dividers and card edges. Keeps its transparency.' },
];

const SKY_FIELDS: ColorDef[] = [
  { key: 'center', label: 'Sky centre', hint: 'The backdrop is lightest in the middle of the screen…' },
  { key: 'mid', label: 'Sky middle' },
  { key: 'edge', label: 'Sky edges', hint: '…and darkest at the corners.' },
  { key: 'star', label: 'Faint stars', hint: 'Most of the small background stars.' },
  { key: 'bright', label: 'Bright stars', hint: 'The few large glowing ones.' },
];

const GALAXY_FIELDS: ColorDef[] = [
  { key: 'core', label: 'Core', hint: 'The white-hot centre of the hero galaxy.' },
  { key: 'bulge', label: 'Core glow' },
  { key: 'innerArm', label: 'Inner arms', hint: 'Warm part of the arms near the centre.' },
  { key: 'arm', label: 'Outer arms' },
  { key: 'armB', label: 'Outer arms, second tone' },
  { key: 'haze', label: 'Haze', hint: 'The faint dust between the arms.' },
  { key: 'knot', label: 'Bright knots', hint: 'The small pink spots along the arms.' },
];

const NODE_FIELDS: ColorDef[] = [
  { key: 'person', label: 'You', hint: 'The centre node.' },
  { key: 'role', label: 'Jobs' },
  { key: 'project', label: 'Projects' },
  { key: 'domain', label: 'Domains' },
  { key: 'tech', label: 'Tech' },
  { key: 'achievement', label: 'Achievements' },
  { key: 'link', label: 'Lines between nodes' },
];

const CARD_FIELDS: ColorDef[] = [
  { key: 'base', label: 'General', hint: 'Tint of the glass cards (node info card, Proof cards).' },
  { key: 'project', label: 'Project cards' },
  { key: 'tech', label: 'Tech cards' },
  { key: 'role', label: 'Job cards' },
  { key: 'achievement', label: 'Achievement cards' },
];

const PAGE_DEFAULTS = BASE as unknown as Record<string, string>;
const DEFAULTS: Record<Section, Record<string, string>> = {
  page: PAGE_DEFAULTS,
  sky: BASE.sky as unknown as Record<string, string>,
  galaxy: BASE.galaxy as unknown as Record<string, string>,
  graph: BASE.graph as unknown as Record<string, string>,
  cards: BASE.cardTints as unknown as Record<string, string>,
};

function ColorsTab({
  colors,
  tree,
  onChange,
}: {
  colors: ColorOverrides;
  tree: Tree;
  onChange: (c: ColorOverrides) => void;
}) {
  const valueOf = (section: Section, key: string) =>
    (colors[section] as Record<string, string> | undefined)?.[key] ?? DEFAULTS[section][key];
  const isSet = (section: Section, key: string) =>
    (colors[section] as Record<string, string> | undefined)?.[key] !== undefined;

  const set = (section: Section, key: string, value: string | undefined) => {
    const next = { ...((colors[section] as Record<string, string>) ?? {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    const out: ColorOverrides = { ...colors, [section]: next };
    if (!Object.keys(next).length) delete (out as Record<string, unknown>)[section];
    onChange(out);
  };

  const setList = (which: 'dust' | 'ambient', index: number, value: string | undefined) => {
    const base = BASE.graph[which];
    const list = (colors[which] ?? base).slice();
    list[index] = value ?? base[index];
    const out: ColorOverrides = { ...colors, [which]: list };
    if (list.every((c, i) => c === base[i])) delete out[which];
    onChange(out);
  };

  const group = (title: string, note: string, section: Section, defs: ColorDef[]) => (
    <section>
      <h2 className="t-heading-2xs text-bone">{title}</h2>
      <p className="t-caption mt-[2px] text-ash">{note}</p>
      <div className="mt-[16px] grid gap-[18px] sm:grid-cols-2">
        {defs.map((d) => (
          <ColorField
            key={d.key}
            label={d.label}
            hint={d.hint}
            value={valueOf(section, d.key)}
            fallback={DEFAULTS[section][d.key]}
            isDefault={!isSet(section, d.key)}
            onChange={(v) => set(section, d.key, v)}
            onReset={() => set(section, d.key, undefined)}
          />
        ))}
      </div>
    </section>
  );

  const swatches = (title: string, note: string, which: 'dust' | 'ambient') => {
    const list = colors[which] ?? BASE.graph[which];
    return (
      <section>
        <h2 className="t-heading-2xs text-bone">{title}</h2>
        <p className="t-caption mt-[2px] text-ash">{note}</p>
        <div className="mt-[16px] grid gap-[18px] sm:grid-cols-2">
          {list.map((c, i) => (
            <ColorField
              key={i}
              label={`Colour ${i + 1}`}
              value={c}
              fallback={BASE.graph[which][i]}
              isDefault={c === BASE.graph[which][i]}
              onChange={(v) => setList(which, i, v)}
              onReset={() => setList(which, i, undefined)}
            />
          ))}
        </div>
      </section>
    );
  };

  const linkWidth = colors.linkWidth ?? BASE.graph.linkWidth;
  const changed = Object.keys(colors).length > 0;

  return (
    <div className="grid gap-[36px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-[42px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <p className="t-body max-w-[52ch] text-mist">
            These are the colours on the homepage right now. Change any of them and the preview
            updates as you go. Visitors see it after <span className="text-bone">Save everything</span>.
          </p>
          {changed && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Put every colour back to the built-in defaults?')) onChange({});
              }}
              className="ghost"
            >
              Reset all colours
            </button>
          )}
        </div>

        {group('Page', 'Text, buttons and surfaces.', 'page', PAGE_FIELDS)}
        {group('Night sky', 'The fixed starry backdrop behind every section.', 'sky', SKY_FIELDS)}
        {group('Galaxy', 'The spiral galaxy the page opens on.', 'galaxy', GALAXY_FIELDS)}

        <section>
          {group('Graph nodes', 'The dots of the knowledge graph, by kind.', 'graph', NODE_FIELDS)}
          <div className="mt-[18px] max-w-[420px]">
            <label className="t-caption flex items-center justify-between text-ash">
              <span>Line thickness</span>
              <span className="font-mono text-mist">{linkWidth.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={linkWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                const out: ColorOverrides = { ...colors, linkWidth: v };
                if (v === BASE.graph.linkWidth) delete out.linkWidth;
                onChange(out);
              }}
              className="mt-[8px] w-full accent-iris"
            />
          </div>
        </section>

        {swatches('Sculpture dust', 'The particles the galaxy and the shapes (constellation, eye, butterfly…) are made of.', 'dust')}
        {swatches('Drifting particles', 'The slow motes floating behind the page.', 'ambient')}
        {group('Info cards', 'Glass card tints.', 'cards', CARD_FIELDS)}
      </div>

      <div className="xl:sticky xl:top-[120px] xl:self-start">
        <LivePreview tree={tree} compact />
      </div>
    </div>
  );
}

const HEX6 = /^#[0-9a-f]{6}$/i;

/** '#rrggbb' for the native picker, from a hex or an rgb()/rgba() string. */
function toPickerHex(value: string): string {
  if (HEX6.test(value)) return value.toLowerCase();
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return '#000000';
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

/** The alpha of an rgba() string, or null. Used to keep a translucent default translucent. */
function alphaOf(value: string): number | null {
  const m = value.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i);
  return m ? Number(m[1]) : null;
}

function ColorField({
  label,
  hint,
  value,
  fallback,
  isDefault,
  onChange,
  onReset,
}: {
  label: string;
  hint?: string;
  value: string;
  /** The built-in default, used to keep its transparency when a new colour is picked. */
  fallback: string;
  isDefault: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const id = useId();
  // Typed text is held locally and only committed once it is a valid colour,
  // so half-typed hex ("#8f6") never reaches the preview or the save.
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const alpha = alphaOf(fallback);
  const fromPicker = (hex: string) => {
    if (alpha === null) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  };
  const commitText = (t: string) => {
    setText(t);
    const v = t.trim();
    if (HEX6.test(v) || /^rgba?\([\d\s.,]+\)$/i.test(v)) onChange(v);
  };

  return (
    <div className="flex items-start gap-[12px]">
      <label htmlFor={id} className="relative mt-[2px] shrink-0 cursor-pointer" title="Pick a colour">
        <span
          className="block h-[36px] w-[36px] rounded-full border border-ash/30"
          style={{ background: value }}
        />
        <input
          id={id}
          type="color"
          value={toPickerHex(value)}
          onChange={(e) => onChange(fromPicker(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px]">
          <p className="t-body text-bone">{label}</p>
          <input
            type="text"
            aria-label={`${label} value`}
            value={text}
            onChange={(e) => commitText(e.target.value)}
            onBlur={() => setText(value)}
            spellCheck={false}
            className="w-[200px] rounded-[8px] border border-ash/20 bg-transparent px-[8px] py-[2px] font-mono text-[12px] text-mist outline-none focus:border-iris"
          />
          {!isDefault && (
            <button type="button" onClick={onReset} className="t-caption text-ash underline hover:text-bone">
              Reset
            </button>
          )}
        </div>
        {hint && <p className="t-caption mt-[2px] text-ash">{hint}</p>}
      </div>
    </div>
  );
}

/* ── live preview ────────────────────────────────────────────────────────── */

const PREVIEW_W = 1440;
const PREVIEW_H = 900;

const PREVIEW_STOPS: Array<{ label: string; target: string }> = [
  { label: 'Hero', target: 'top' },
  { label: 'Ask AI', target: '#ask' },
  { label: 'Proof', target: '#proof' },
  { label: 'Work', target: '#work' },
  { label: 'About', target: '#about' },
  { label: 'Contact', target: '#contact' },
];

/**
 * The real homepage in an iframe, fed the panel's UNSAVED tree — colours,
 * projects, everything — so what you see here is exactly what Save would
 * publish. Rendered at desktop size (1440×900) and scaled down to fit, so it
 * shows the desktop layout rather than the phone one a narrow frame would
 * trigger. The page itself can be scrolled inside the frame too.
 */
function LivePreview({ tree, compact = false }: { tree: Tree; compact?: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [ready, setReady] = useState(false);
  const latest = useRef(tree);
  latest.current = tree;

  const post = useCallback((msg: unknown) => {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(box.clientWidth / PREVIEW_W));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The frame announces itself once its content store is listening.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if ((e.data as { type?: string })?.type === PREVIEW_READY) {
        setReady(true);
        post({ type: PREVIEW_MESSAGE, tree: latest.current });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  // Debounced: a colour picker fires many times a second while dragging, and
  // each galaxy colour change rebuilds the graph figures.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => post({ type: PREVIEW_MESSAGE, tree }), 180);
    return () => window.clearTimeout(t);
  }, [tree, ready, post]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px]">
        <span className="t-caption text-saffron">{ready ? 'Live preview' : 'Loading preview…'}</span>
        {PREVIEW_STOPS.map((s) => (
          <button
            key={s.target}
            type="button"
            onClick={() => post({ type: PREVIEW_SCROLL, target: s.target })}
            className="t-caption text-ash underline-offset-[3px] hover:text-bone hover:underline"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        ref={boxRef}
        className="relative mt-[10px] w-full overflow-hidden rounded-[14px] border border-ash/20"
        style={{ height: PREVIEW_H * scale }}
      >
        <iframe
          ref={frameRef}
          title="Live preview of the homepage"
          src="/?preview=1"
          style={{
            width: PREVIEW_W,
            height: PREVIEW_H,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            border: 0,
          }}
        />
      </div>
      {!compact && (
        <p className="t-caption mt-[10px] text-ash">
          Shows your unsaved edits from every tab. Scroll inside the frame, or jump with the links
          above.
        </p>
      )}
    </div>
  );
}

/* ── export ────────────────────────────────────────────────────────────── */

function ExportTab({ code }: { code: string }) {
  return (
    <div className="max-w-[860px]">
      <p className="t-body text-mist">
        Paste this into the <code className="text-saffron">projects</code> array in{' '}
        <code className="text-saffron">src/lib/content.ts</code>. That makes an entry permanent,
        ships it in the static bundle, and means it survives a host with an ephemeral filesystem.
        Only the projects slice is exported — everything else is edited in the panel and lives
        on the backend.
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

/**
 * A text field over structured data (a list, paragraphs, links). Keeps the
 * raw text the user is typing in local state and only pushes the parsed value
 * up — parsing on every keystroke and re-rendering from the parsed value was
 * what made the Tech field eat each comma the moment it was typed (", " →
 * split → trimmed away), so a second item could never be entered.
 */
function ParsedField<T>({
  value,
  onChange,
  format,
  parse,
  ...field
}: {
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  parse: (text: string) => T;
} & FieldShared) {
  const [text, setText] = useState(() => format(value));
  const last = useRef(value);
  // Re-sync only when the value changed from OUTSIDE this field (load, move).
  useEffect(() => {
    if (value !== last.current && JSON.stringify(parse(text)) !== JSON.stringify(value)) {
      setText(format(value));
    }
    last.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field
      {...field}
      value={text}
      onChange={(t) => {
        setText(t);
        const parsed = parse(t);
        last.current = parsed;
        onChange(parsed);
      }}
    />
  );
}

type FieldShared = Omit<FieldProps, 'value' | 'onChange'>;

/** Comma-separated list. */
function ListField(props: FieldShared & { value: string[]; onChange: (v: string[]) => void }) {
  return <ParsedField {...props} format={(v) => v.join(', ')} parse={splitList} />;
}

/** One item per line. */
function LinesField(props: FieldShared & { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <ParsedField
      {...props}
      area
      format={(v) => v.join('\n')}
      parse={(t) => t.split('\n').map((l) => l.trim()).filter(Boolean)}
    />
  );
}

/** Paragraphs separated by a blank line. */
function ParagraphsField(props: FieldShared & { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <ParsedField
      rows={6}
      {...props}
      area
      format={(v) => v.join('\n\n')}
      parse={(t) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)}
    />
  );
}

/** "Label | URL", one per line. A bare URL uses itself as the label. */
function LinksField(
  props: FieldShared & { value: ProjectLink[]; onChange: (v: ProjectLink[]) => void },
) {
  return (
    <ParsedField
      {...props}
      area
      format={(v) => v.map((l) => `${l.label} | ${l.href}`).join('\n')}
      parse={(t) =>
        t
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [label, ...rest] = line.split('|');
            const href = rest.join('|').trim();
            return { label: label.trim(), href: href || label.trim() };
          })
      }
    />
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  area?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
  area = false,
  rows = 3,
  hint,
  placeholder,
  required,
  autoComplete,
  className,
}: FieldProps) {
  // Unique per field: label-derived ids collided as soon as a list showed
  // two "Slug" fields, so clicking a label could focus the wrong input.
  const id = useId();
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
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} mt-[6px] resize-y`}
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