// src/lib/figures.ts
/**
 * Which figure heads each project's sheet.
 *
 * Two kinds. `anatomy` figures are bespoke machines built for the three
 * flagship projects (see src/components/figures). Everything else gets one of
 * Hairline's stock line figures, picked because the way it answers the
 * pointer echoes something the project actually does — not as decoration.
 *
 * `title` sits in the plate's top-right corner, so keep it to two or three
 * words. A project missing from this map falls back to `Riffle`.
 */

export type HairlineName =
  | 'riffle' | 'terrain' | 'exploded' | 'phosphor' | 'slow' | 'turntable' | 'keyboard'
  | 'elevator' | 'phone' | 'laptop' | 'terminal' | 'cabinet' | 'branches' | 'vault'
  | 'lockers' | 'padlock' | 'patch' | 'dish' | 'router' | 'loupe' | 'sieve' | 'rail'
  | 'plug' | 'query' | 'drawer' | 'basket' | 'plot' | 'hub' | 'relay' | 'settle'
  | 'format' | 'rebuild' | 'stack';

export type AnatomyName = 'recall' | 'omnitrace' | 'diagramstudio';

export type FigureSpec =
  | { kind: 'anatomy'; name: AnatomyName }
  | { kind: 'hairline'; name: HairlineName; title: string };

const h = (name: HairlineName, title: string): FigureSpec => ({ kind: 'hairline', name, title });

const FIGURES: Record<string, FigureSpec> = {
  recall: { kind: 'anatomy', name: 'recall' },
  omnitrace: { kind: 'anatomy', name: 'omnitrace' },
  diagramstudio: { kind: 'anatomy', name: 'diagramstudio' },

  'email-admin-system': h('lockers', 'Delegated access'), // one door opens, nobody holds the master key
  vibecheck: h('query', 'Honest feedback'),
  'hrtal-copilot': h('hub', 'Model routing'), // one orchestrator, many models
  'ppe-compliance': h('dish', 'Live feeds'), // a sensor that follows what it watches
  'engine-test-forecasting': h('plot', 'Forecast'),
  'asc-cadence': h('settle', 'Design loop'), // a crooked draft settles into a design
  auranova: h('turntable', 'Multi-view'), // one object, seen from every side
  'hr-copilot': h('drawer', 'Handbook only'), // answers only from what is in the drawer
  'rust-detection': h('loupe', 'Inspection'),
  anuvaad: h('relay', 'Fourteen languages'), // one source, fanned out hop by hop
  'uoons-seller': h('basket', 'Marketplace'),
  'dark-pattern-buster': h('exploded', 'UI dissected'), // the page pulled apart into its layers
  'skin-disease-detection': h('sieve', 'Segmentation'),
  'barcode-ocr': h('riffle', 'Reading codes'),
  'kisaan-vani': h('terrain', 'Soil profile'),
  'handwriting-ocr': h('format', 'Clean lines'), // crooked handwriting snaps square
  depixelation: h('phosphor', 'Pixel matrix'),
  'e-samadhan': h('elevator', 'Civic services'), // one building, many departments
  'qr-bridge': h('phone', 'Laptop to phone'),
  'llm-fit-checker': h('cabinet', 'Memory budget'), // blades pulled out, gigabyte by gigabyte
  'cocacola-intelligence': h('rail', 'Shelf presence'),
  'e-raksha': h('padlock', 'Safety platform'),
  grid: h('branches', 'Backend & QA'),
  'sandbox-system': h('vault', 'Isolated demo'),
};

export const figureFor = (slug: string): FigureSpec => FIGURES[slug] ?? h('riffle', 'Project');
