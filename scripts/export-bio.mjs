// frontend/scripts/export-bio.mjs
/**
 * Writes backend/biography.txt from lib/content.ts, and backend/content.seed.json
 * — the same compiled content as plain JSON.
 *
 * The seed is what lets the chat answer from the ADMIN-edited content: the
 * backend rebuilds the biography from the live store on every question, and
 * fills any section the store doesn't have yet (one saved before the panel
 * could edit it) from this seed. biography.txt is the fallback for when
 * there is no store at all.
 *
 * The backend is Python and cannot import TypeScript, but the spec is emphatic
 * that there is one content layer and that nothing is authored twice. So the
 * biography is generated here at build time and handed to the backend as a
 * plain text file. Edit lib/content.ts; never edit biography.txt.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmp = join(root, 'node_modules', '.bio-export.mjs');

await build({
  entryPoints: [join(root, 'src/lib/context.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: tmp,
  logLevel: 'silent',
  alias: { '@': join(root, 'src') },
});

const { SYSTEM_PROMPT } = await import(new NodeURL(`file://${tmp}`).href);
rmSync(tmp, { force: true });

const tmpContent = join(root, 'node_modules', '.content-export.mjs');
await build({
  entryPoints: [join(root, 'src/lib/content.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: tmpContent,
  logLevel: 'silent',
  alias: { '@': join(root, 'src') },
});
const c = await import(new NodeURL(`file://${tmpContent}`).href);
rmSync(tmpContent, { force: true });
const seed = {
  profile: c.profile,
  roles: c.roles,
  projects: c.projects,
  achievements: c.achievements,
  education: c.education,
  skills: c.skills,
  about: c.about,
  stack: c.stackRows,
  metrics: c.metrics,
  questions: c.SUGGESTED_QUESTIONS,
};

const out = join(root, '..', 'backend');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'biography.txt'), SYSTEM_PROMPT, 'utf8');
writeFileSync(join(out, 'content.seed.json'), JSON.stringify(seed, null, 2), 'utf8');

console.log(
  `export-bio: wrote backend/biography.txt (${SYSTEM_PROMPT.length} chars) and backend/content.seed.json`,
);
