// src/components/figures/diagramstudio/DiagramStudioFigure.tsx
import { AnatomyPlate } from '../AnatomyPlate';
import { META, SVG } from './art.generated';
import { mount } from './live';

/** DiagramStudio's "the DSL text is the document", as a tape reader and layout board. See figures/diagramstudio/build.mjs. */
export default function DiagramStudioFigure({ fig }: { fig: string }) {
  return <AnatomyPlate fig={fig} svg={SVG} meta={META} readout="line 8 · db -> cache · 4n 4e" mount={mount} />;
}
