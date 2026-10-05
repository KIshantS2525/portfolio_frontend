// frontend/src/components/diagramstudio/DslBlock.tsx
import { Fragment, type ReactNode } from 'react';

/**
 * The DiagramDSL a prompt compiled to, with light syntax colouring:
 * keywords, "quoted names", [attributes] and arrows.
 */
const KEYWORDS = /^(title|direction|colorMode|styleMode|typeface|participant|actor|lane|group|layer|note)\b/;

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const kw = line.trimStart().match(KEYWORDS);
  let rest = line;
  if (kw) {
    const lead = line.length - line.trimStart().length;
    out.push(line.slice(0, lead), <span key="k" className="ds-tk-kw">{kw[0]}</span>);
    rest = line.slice(lead + kw[0].length);
  }
  const re = /("[^"]*")|(\[[^\]]*\])|(<>|-->|->|<-|>|<|\{|\})|(\/\/.*$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(rest))) {
    if (m.index > last) out.push(rest.slice(last, m.index));
    const cls = m[1] ? 'ds-tk-str' : m[2] ? 'ds-tk-attr' : m[3] ? 'ds-tk-op' : 'ds-tk-cmt';
    out.push(<span key={n++} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < rest.length) out.push(rest.slice(last));
  return out;
}

export function DslBlock({ dsl, maxHeight }: { dsl: string; maxHeight: number }) {
  const lines = dsl.split('\n');
  return (
    <pre className="ds-dsl" style={{ maxHeight }}>
      {lines.map((l, i) => (
        <Fragment key={i}>
          <span className="ds-dsl-ln">{i + 1}</span>
          {highlight(l)}
          {'\n'}
        </Fragment>
      ))}
    </pre>
  );
}
