// src/components/figures/ProjectFigure.tsx
import { lazy, Suspense } from 'react';
import type { Project } from '@/lib/content';
import { figureFor, type AnatomyName } from '@/lib/figures';
import { HairlinePlate } from './HairlinePlate';

/*
 * Each Anatomy figure is its own chunk: a few hundred precomputed paths and a
 * small live loop, fetched only when that project's sheet is opened.
 */
const ANATOMY: Record<AnatomyName, React.LazyExoticComponent<(p: { fig: string }) => React.JSX.Element>> = {
  recall: lazy(() => import('./recall/RecallFigure')),
  omnitrace: lazy(() => import('./omnitrace/OmniTraceFigure')),
  diagramstudio: lazy(() => import('./diagramstudio/DiagramStudioFigure')),
};

/** The plate at the head of a project sheet. */
export function ProjectFigure({ project, index }: { project: Project; index: number }) {
  const spec = figureFor(project.slug);
  const fig = `Fig ${String(index + 1).padStart(2, '0')}`;

  if (spec.kind === 'anatomy') {
    const Figure = ANATOMY[spec.name];
    return (
      <Suspense fallback={<div className="fig-plate" style={{ aspectRatio: '600 / 430' }} aria-hidden />}>
        <Figure fig={fig} />
      </Suspense>
    );
  }

  return (
    <HairlinePlate
      key={project.slug}
      name={spec.name}
      fig={fig}
      title={spec.title}
      label={`${project.name}: an interactive line drawing that answers the pointer.`}
    />
  );
}
