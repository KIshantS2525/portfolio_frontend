// frontend/src/components/diagramstudio/DocsDemo.tsx
import { useState } from 'react';
import { DOCS } from './showcase';
import { SpotlightPanel } from './SpotlightPanel';
import './diagramstudio.css';

/** The "02 — Documents" block from diagramstudio.in: TDD / PRD / API. */
type Doc = keyof typeof DOCS;
const TABS: Doc[] = ['TDD', 'PRD', 'API'];

export function DocsDemo() {
  const [tab, setTab] = useState<Doc>('TDD');
  const doc = DOCS[tab];

  return (
    <div className="ds-docs-grid">
      <div>
        <p className="t-caption uppercase tracking-[0.12em] text-saffron">Documents</p>
        <h3 className="t-heading-sm mt-[12px] text-bone">
          The same prompt also writes
          <br />
          the docs nobody wants to write.
        </h3>
        <p className="t-body mt-[16px] max-w-[46ch] text-mist">
          Generate full technical documents from a single description: TDDs, PRDs, API references, ADRs,
          postmortems, RFCs, runbooks and onboarding guides, each with diagrams generated into the sections
          that need them.
        </p>
        <div className="ds-theme mt-[28px] flex gap-[8px]" role="tablist" aria-label="Document types">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              className={`ds-doc-tab ${t === tab ? 'is-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <SpotlightPanel glow="var(--emphasis)" className="ds-theme ds-window">
        <div className="ds-bar ds-bar-right">
          <span className="ds-filename">{doc.filename}</span>
          <span className="ds-auto">auto-generated</span>
        </div>
        <pre key={tab} className="ds-doc">{doc.code}</pre>
      </SpotlightPanel>
    </div>
  );
}