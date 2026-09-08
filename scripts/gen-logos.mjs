/**
 * Writes src/lib/logos.generated.ts from the simple-icons package.
 *
 * Only the icons the stack rows actually use are emitted, so nothing else from
 * a 3000-icon package reaches the bundle. Anything without an official mark
 * falls back to a wordmark in the site's own face — no invented paths.
 *
 * simple-icons is a devDependency; this runs at build time only.
 */
import * as si from 'simple-icons';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** label shown on the site -> candidate simple-icons slugs, best first */
const MAP = {
  PyTorch: ['pytorch'],
  TensorFlow: ['tensorflow'],
  Keras: ['keras'],
  OpenCV: ['opencv'],
  'Hugging Face': ['huggingface'],
  'ONNX Runtime': ['onnx'],
  ONNX: ['onnx'],
  'scikit-learn': ['scikitlearn'],
  LangChain: ['langchain'],
  YOLOv8: ['yolo'],
  YOLO: ['yolo'],
  NumPy: ['numpy'],
  pandas: ['pandas'],
  Gemini: ['googlegemini'],
  'Qualcomm QNN': ['qualcomm'],
  Python: ['python'],
  FastAPI: ['fastapi'],
  PostgreSQL: ['postgresql'],
  SQLite: ['sqlite'],
  Neo4j: ['neo4j'],
  Docker: ['docker'],
  Redis: ['redis'],
  Linux: ['linux'],
  Caddy: ['caddy'],
  Git: ['git'],
  'GitHub Actions': ['githubactions'],
  Jenkins: ['jenkins'],
  MLflow: ['mlflow'],
  PySpark: ['apachespark'],
  OpenTelemetry: ['opentelemetry'],
  Arduino: ['arduino'],
  React: ['react'],
  TypeScript: ['typescript'],
  JavaScript: ['javascript'],
  Flutter: ['flutter'],
  Dart: ['dart'],
  Vite: ['vite'],
  Tailwind: ['tailwindcss'],
  Firebase: ['firebase'],
  D3: ['d3'],
  'Next.js': ['nextdotjs'],
};

const key = (slug) => 'si' + slug.charAt(0).toUpperCase() + slug.slice(1);

const entries = [];
const missing = [];
for (const [label, slugs] of Object.entries(MAP)) {
  const found = slugs.map(key).find((k) => si[k]);
  if (found) entries.push([label, si[found].path]);
  else missing.push(label);
}

const body = entries
  .map(([label, path]) => `  ${JSON.stringify(label)}: '${path}',`)
  .join('\n');

writeFileSync(
  join(root, 'src/lib/logos.generated.ts'),
  `/* GENERATED FILE — DO NOT EDIT.
 * Written by scripts/gen-logos.mjs from the simple-icons package.
 * Every path is the official mark; nothing here is drawn by hand.
 * Labels with no official icon fall back to a wordmark in Marquee.
 */

/** 24x24 viewBox path data, keyed by the label used in content.ts. */
export const LOGO_PATHS: Record<string, string> = {
${body}
};
`,
  'utf8',
);

console.log(
  `gen-logos: ${entries.length} icons written` +
    (missing.length ? `; wordmark fallback for ${missing.join(', ')}` : ''),
);
