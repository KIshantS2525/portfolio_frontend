# Project figures

The plate at the top of every project sheet.

- **24 projects** use a stock line figure from [Hairline](https://github.com/lucasmarkes/hairline) (`@lucasmarkes/hairline`). The project → figure map is `src/lib/figures.ts`. Change a figure or its title there.
- **Recall, OmniTrace and DiagramStudio** use bespoke machines built with the [Anatomy](https://github.com/wheresryan22/anatomy) kit (MIT, vendored in `kit/`):
  - `omnitrace/`: a go/no-go inspection bench for the 14-rule engine.
  - `recall/`: a card-catalogue drawer for the brute-force int8 vector search.
  - `diagramstudio/`: a punched-tape reader for "the DSL text is the document".

Each `build.mjs` precomputes the drawing and writes `src/components/figures/<name>/art.generated.ts`. The motion lives in `src/components/figures/<name>/live.ts`. The browser does no geometry.

```sh
npm run figures                        # rebuild all three after editing a build.mjs
node figures/page.mjs omnitrace        # standalone check page → figures/out/omnitrace.html
CHROME_PATH=… node figures/scripts/capture.mjs figures/out/omnitrace.html --out figures/shots/ot.png
CHROME_PATH=… node figures/scripts/lines.mjs figures/out/omnitrace.html   # must print "line ends: 0"
```

To make a new figure, install the skill (`npx skills add wheresryan22/anatomy`) and ask for one with `/anatomy`, telling it to use this folder's layout and the navy tokens in `src/components/figures/plate.css`.
