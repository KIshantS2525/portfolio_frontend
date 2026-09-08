/**
 * Compiles src/lib/theme.ts into src/styles/theme.generated.css.
 *
 * theme.ts is the only place colours are written. This turns it into real CSS
 * custom properties so there is no runtime injection and no flash of the wrong
 * colours — the values are in the stylesheet before the first paint.
 *
 * Runs automatically on `npm run dev` and `npm run build`.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const tmp = join(root, 'node_modules', '.theme-export.mjs');

await build({
  entryPoints: [join(root, 'src/lib/theme.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: tmp,
  logLevel: 'silent',
  alias: { '@': join(root, 'src') },
});

const { THEMES } = await import(new NodeURL(`file://${tmp}`).href);
rmSync(tmp, { force: true });

const vars = (p) =>
  [
    ['--surface', p.surface],
    ['--surface-raised', p.surfaceRaised],
    ['--text', p.text],
    ['--text-body', p.textBody],
    ['--text-muted', p.textMuted],
    ['--accent', p.accent],
    ['--accent-hover', p.accentHover],
    ['--accent-ink', p.accentInk],
    ['--accent-text', p.accentText],
    ['--emphasis', p.emphasis],
    ['--tertiary', p.tertiary],
    ['--hairline', p.hairline],
    ['--shadow-card', p.shadow],
    ['--scrollbar-thumb', p.scrollbarThumb],
    ['--scrollbar-thumb-hover', p.scrollbarThumbHover],
    ['--toggle-band-1', p.toggle.band[0]],
    ['--toggle-band-2', p.toggle.band[1]],
    ['--graph-link-alpha', p.graph.linkAlpha],
    ['--graph-dim-alpha', p.graph.dimAlpha],
    ['--graph-ambient-scale', p.graph.ambientScale],
    ['--glass-tint-base', p.cardTints.base],
    ['--glass-tint-project', p.cardTints.project],
    ['--glass-tint-tech', p.cardTints.tech],
    ['--glass-tint-role', p.cardTints.role],
    ['--glass-tint-achievement', p.cardTints.achievement],
  ]
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

const css = `/* GENERATED FILE — DO NOT EDIT.
 * Written by scripts/gen-theme.mjs from src/lib/theme.ts.
 * Change colours there; this file is overwritten on every dev start and build.
 */

:root {
  color-scheme: dark;
${vars(THEMES.dark)}
}

[data-theme='light'] {
  color-scheme: light;
${vars(THEMES.light)}
}
`;

mkdirSync(join(root, 'src/styles'), { recursive: true });
writeFileSync(join(root, 'src/styles/theme.generated.css'), css, 'utf8');
console.log('gen-theme: wrote src/styles/theme.generated.css');
