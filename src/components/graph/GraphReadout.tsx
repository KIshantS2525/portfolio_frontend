// src/components/graph/GraphReadout.tsx
'use client';

import { useEffect, useRef } from 'react';
import { projects, projectBySlug, roles, achievements } from '@/lib/content';
import type { GraphNode } from '@/lib/graph';
import { usePalette } from '@/lib/useTheme';

/**
 * A force graph nobody can interact with is a screensaver. Selecting a node
 * answers with real content read from content.ts — the same source the work
 * list uses, so the two can never drift.
 *
 * Second version. The first was an inline slide-down block that lived inside
 * Hero's copy column and expanded the page when a node was selected; that
 * doesn't work once the graph is a full-viewport sticky element that stays
 * on screen for multiple sections (Ask AI, Metrics, Proof), because the
 * inline block is only rendered under Hero and is invisible any time the
 * graph is anywhere else. It's now a proper floating card, rendered by
 * GraphJourney at the top level of the section, positioned bottom-right, and
 * dismissable three ways: the X in the corner, clicking anywhere outside the
 * card, and the Escape key.
 *
 * "Anywhere outside" specifically means the backdrop this component itself
 * renders — a full-viewport transparent capture layer *below* the card in
 * paint order. That's the only pointer-events-safe way to catch "clicks
 * elsewhere on the page" that also works while <GraphJourney>'s content
 * blocks above have `pointer-events-none` and the WebGL canvas beneath
 * captures node clicks. Trying to attach a `mousedown` listener to `document`
 * instead would race the node-click handler on every graph tap and close the
 * card the same frame it opens.
 */
export function GraphReadout({
  node,
  onDismiss,
  onPick,
}: {
  node: GraphNode | null;
  onDismiss: () => void;
  onPick?: (slug: string) => void;
}) {
  const palette = usePalette();
  const body = node ? resolve(node) : null;
  const cardRef = useRef<HTMLDivElement>(null);

  /** Escape to close. Only bound when a card is actually open. */
  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onDismiss]);

  if (!body || !node) return null;

  return (
    <>
      {/*
        Backdrop. Full-viewport, sits ABOVE the graph canvas so a click on
        empty space is dismiss (not a new node selection), and BELOW the card
        so clicks on the card itself land on the card. `bg-transparent` — we
        don't want the graph to grey out, we just want the click target.
      */}
      <div
        className="fixed inset-0 z-[80] bg-transparent"
        onMouseDown={onDismiss}
        aria-hidden
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Details for ${body.title}`}
        data-lenis-prevent
        className={`glass-card ${glassKindClass(node.kind)} fixed bottom-[24px] right-[24px] z-[90] w-[min(560px,calc(100vw-48px))] max-h-[70vh] overflow-auto overscroll-contain rounded-[16px] p-[24px] shadow-2xl`}
        // Stop clicks inside the card from bubbling to the backdrop above.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close details"
          className="absolute right-[12px] top-[12px] flex h-[32px] w-[32px] items-center justify-center rounded-full text-ash transition-colors hover:bg-ash/10 hover:text-bone"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-[6px] pr-[36px]">
          <span className="t-caption" style={{ color: palette.graph[node.kind] }}>
            {kindLabel(node.kind)}
          </span>
          <h3 className="t-heading-2xs text-bone">{body.title}</h3>
          {body.meta && <span className="t-caption text-ash">{body.meta}</span>}
        </div>

        <div className="mt-[18px] space-y-[18px]">
          {body.blocks.map((b) => (
            <div key={b.head}>
              <p className="t-caption mb-[6px] text-ash">{b.head}</p>
              <p className="t-body text-mist">{b.text}</p>
            </div>
          ))}
        </div>

        {body.related && body.related.length > 0 && (
          <div className="mt-[18px] flex flex-wrap gap-x-[12px] gap-y-[6px]">
            {body.related.map((r) => (
              <button
                key={r.slug}
                type="button"
                onClick={() => onPick?.(r.slug)}
                className="tag text-saffron transition-opacity hover:opacity-70"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Maps a graph node's kind to the matching `.glass-*` tint modifier; role/domain/person fall back to the general card tint. */
function glassKindClass(kind: GraphNode['kind']): string {
  if (kind === 'project') return 'glass-project';
  if (kind === 'tech' || kind === 'domain') return 'glass-tech';
  if (kind === 'role') return 'glass-role';
  if (kind === 'achievement') return 'glass-achievement';
  return '';
}

function kindLabel(kind: GraphNode['kind']) {
  return { person: 'Me', role: 'Where', project: 'Project', domain: 'Domain', tech: 'Technology', achievement: 'Recognition' }[
    kind
  ];
}

type Body = {
  title: string;
  meta?: string;
  blocks: { head: string; text: string }[];
  related?: { slug: string; name: string }[];
};

function resolve(node: GraphNode): Body | null {
  const raw = node.id.split(':').slice(1).join(':');

  if (node.kind === 'project') {
    const p = projectBySlug(raw);
    if (!p) return null;
    const blocks = [
      p.challenge && { head: 'Challenge', text: p.challenge },
      p.approach && { head: 'Approach', text: p.approach },
      p.outcome && { head: 'Outcome', text: p.outcome },
    ].filter(Boolean) as Body['blocks'];
    return {
      title: p.name,
      meta: `${p.context}, ${p.year}`,
      blocks: blocks.length ? blocks : [{ head: 'What it is', text: p.blurb }],
    };
  }

  if (node.kind === 'role') {
    const r = roles.find((x) => x.slug === raw);
    if (!r) return null;
    return {
      title: r.company,
      meta: `${r.title}, ${r.period}`,
      blocks: [{ head: 'What I do there', text: r.summary }],
      related: r.projects.map((s) => ({ slug: s, name: projectBySlug(s)?.name ?? s })),
    };
  }

  if (node.kind === 'achievement') {
    const a = achievements.find((x) => x.slug === raw);
    if (!a) return null;
    return { title: a.name, blocks: [{ head: 'What it was', text: a.detail }] };
  }

  if (node.kind === 'tech' || node.kind === 'domain') {
    const used = projects.filter((p) =>
      (node.kind === 'tech' ? p.tech : p.domains).some(
        (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === raw,
      ),
    );
    return {
      title: node.label,
      meta: `${used.length} ${used.length === 1 ? 'project' : 'projects'}`,
      blocks: [
        {
          head: 'Where it shows up',
          text: used.map((p) => p.name).join(', ') || 'Not currently linked to a listed project.',
        },
      ],
      related: used.map((p) => ({ slug: p.slug, name: p.name })),
    };
  }

  return {
    title: node.label,
    blocks: [
      {
        head: 'The graph',
        text: 'Every node here is generated from the same content file the rest of this page reads. Tap a project to see what it took to build, or a technology to see everywhere it turns up.',
      },
    ],
  };
}