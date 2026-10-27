// figures/page.mjs — a standalone page for one Anatomy figure, for the skill's
// capture / drive / lines checks. It bundles the figure's real art and live
// module from src/, so what is checked here is exactly what ships in the sheet.
//
//   node figures/page.mjs omnitrace        → figures/out/omnitrace.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "components", "figures");
const name = process.argv[2];
if (!name) throw new Error("usage: node figures/page.mjs <figure>");

const entry = `
import { SVG, META } from ${JSON.stringify(join(SRC, name, "art.generated.ts"))};
import { mount } from ${JSON.stringify(join(SRC, name, "live.ts"))};
const stage = document.querySelector(".fig-stage");
stage.innerHTML = SVG;
for (const [k, v] of Object.entries(META.stage)) stage.setAttribute(k, v);
document.querySelector('[data-corner="title"]').textContent = META.title;
document.querySelector('[data-corner="hint"]').textContent = META.hint;
mount(stage, document.querySelector("[data-readout]"));
`;
const out = await build({ stdin: { contents: entry, resolveDir: HERE, loader: "ts" }, bundle: true, write: false, format: "iife", minify: false });
const css = readFileSync(join(SRC, "iso", "iso.css"), "utf8") + readFileSync(join(SRC, "plate.css"), "utf8");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title><style>
:root{--surface-raised:#0a0f28;--hairline:rgba(154,154,154,.28);--accent-text:#ffb829;color-scheme:dark}
body{margin:0;background:#0a0f28;font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:40px 16px}
main{width:100%;max-width:540px}
${css}
.iso-plate{padding:0;box-shadow:inset 0 0 0 1px var(--hairline);background:var(--fig-well)}
</style></head><body><main>
<figure class="fig-plate iso iso-plate"><span class="fig-corner" data-corner="fig">Fig 01</span><span class="fig-corner" data-corner="title"></span><span class="fig-corner" data-corner="hint"></span><span class="fig-corner" data-corner="readout" data-readout></span>
<div class="fig-stage fig-anatomy"></div></figure>
</main><script>${out.outputFiles[0].text}</script></body></html>`;
mkdirSync(join(HERE, "out"), { recursive: true });
writeFileSync(join(HERE, "out", `${name}.html`), html);
console.log("wrote figures/out/" + name + ".html");
