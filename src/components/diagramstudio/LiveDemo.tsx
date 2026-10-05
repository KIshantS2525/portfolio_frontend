// frontend/src/components/diagramstudio/LiveDemo.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SHOWCASE } from './showcase';
import { SpotlightPanel } from './SpotlightPanel';
import { PromptTyper } from './PromptTyper';
import { DslBlock } from './DslBlock';
import { AnimatedDiagram } from './AnimatedDiagram';
import './diagramstudio.css';

/**
 * The "See it work" window from diagramstudio.in: the prompt types itself out
 * on the left, then the canvas on the right builds the real export —
 * groups, then nodes, then edges.
 */
const FRAME_HEIGHT = { wide: 400, square: 480, tall: 560 } as const;
type Stage = 'prompt' | 'dsl';

export function LiveDemo() {
  const [activeId, setActiveId] = useState(SHOWCASE[0].id);
  const [stage, setStage] = useState<Stage>('prompt');
  const [ready, setReady] = useState(false);
  const item = useMemo(() => SHOWCASE.find((s) => s.id === activeId) ?? SHOWCASE[0], [activeId]);
  const frame = FRAME_HEIGHT[item.ratio];

  const pickTab = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    setStage('prompt');
    setReady(false);
  };
  const pickStage = (next: Stage) => {
    setStage(next);
    if (next === 'dsl') setReady(true);
  };
  const onTyped = useCallback(() => setReady(true), []);

  // Nothing starts until the window is on screen, so the typing and the
  // build are actually seen rather than finished before anyone scrolls here.
  const rootRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div className="ds-theme" ref={rootRef}>
      <div className="ds-tabs" role="tablist" aria-label="Diagram types">
        {SHOWCASE.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === activeId}
            className={`ds-tab ${s.id === activeId ? 'is-active' : ''}`}
            onClick={() => pickTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <SpotlightPanel glow="var(--accent)" className="ds-window mt-[32px]">
        <div className="ds-live-grid">
          {/* Left: what was typed, and what it compiled to */}
          <div className="ds-pane ds-pane-left">
            <div className="ds-bar ds-bar-left">
              <span className="ds-dot" style={{ background: '#ff5f57' }} />
              <span className="ds-dot" style={{ background: '#febc2e' }} />
              <span className="ds-dot" style={{ background: '#28c840' }} />
              <div className="ds-files">
                <button type="button" className={`ds-file ${stage === 'prompt' ? 'is-active' : ''}`} onClick={() => pickStage('prompt')}>
                  prompt.txt
                </button>
                <button type="button" className={`ds-file ${stage === 'dsl' ? 'is-active' : ''}`} onClick={() => pickStage('dsl')}>
                  diagram.dsl
                </button>
              </div>
            </div>
            <div className="ds-left-body" style={{ minHeight: frame }}>
              {stage === 'prompt' ? (
                seen && <PromptTyper key={item.id} prompt={item.prompt} meta={item.meta} onDone={onTyped} />
              ) : (
                <DslBlock key={item.id} dsl={item.dsl} maxHeight={frame - 2} />
              )}
            </div>
          </div>

          {/* Right: the canvas */}
          <div className="ds-pane">
            <div className="ds-bar ds-bar-right">
              <span className="ds-filename">{item.filename}</span>
              <span className="ds-live">live</span>
            </div>
            <div className={`ds-canvas is-${item.ratio}`} style={{ minHeight: frame }}>
              <AnimatedDiagram
                key={item.id}
                svg={item.svg}
                play={ready}
                label={`${item.title} example: ${item.dsl.split('\n')[0].replace(/^title\s+/, '')}`}
              />
              {!ready && (
                <div className="ds-generating">
                  <div className="ds-spinner" />
                  <span>Generating diagram…</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </SpotlightPanel>
    </div>
  );
}