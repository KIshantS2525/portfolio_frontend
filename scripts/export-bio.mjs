/**
 * Writes backend/biography.txt from lib/content.ts.
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

const out = join(root, '..', 'backend');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'biography.txt'), SYSTEM_PROMPT, 'utf8');

console.log(`export-bio: wrote backend/biography.txt (${SYSTEM_PROMPT.length} chars)`);
