// src/components/figures/omnitrace/OmniTraceFigure.tsx
import { AnatomyPlate } from '../AnatomyPlate';
import { META, SVG } from './art.generated';
import { mount } from './live';

/** OmniTrace's fourteen deterministic rules, as a go/no-go inspection bench. See figures/omnitrace/build.mjs. */
export default function OmniTraceFigure({ fig }: { fig: string }) {
  return <AnatomyPlate fig={fig} svg={SVG} meta={META} readout="span 1 · asked 4, got 4 · clean" mount={mount} />;
}
