// src/components/figures/recall/RecallFigure.tsx
import { AnatomyPlate } from '../AnatomyPlate';
import { META, SVG } from './art.generated';
import { mount } from './live';

/** Recall's brute-force vector search, as a card-catalogue drawer. See figures/recall/build.mjs. */
export default function RecallFigure({ fig }: { fig: string }) {
  return <AnatomyPlate fig={fig} svg={SVG} meta={META} readout="top 3 of 10" mount={mount} />;
}
