// frontend/src/components/diagramstudio/PromptTyper.tsx
import { useEffect, useRef, useState } from 'react';

/** Types the prompt out at 22ms a character, then shows the green meta line. */
export function PromptTyper({ prompt, meta, onDone }: { prompt: string; meta: string; onDone?: () => void }) {
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setTyped('');
    setDone(false);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(prompt);
      setDone(true);
      doneRef.current?.();
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setTyped(prompt.slice(0, i));
      if (i >= prompt.length) {
        window.clearInterval(id);
        setDone(true);
        doneRef.current?.();
      }
    }, 22);
    return () => window.clearInterval(id);
  }, [prompt]);

  return (
    <div className="ds-typer">
      <p className="ds-typer-text">
        {typed}
        {!done && <span className="ds-caret">{'​'}</span>}
      </p>
      {done && (
        <div className="ds-meta">
          <span className="ds-meta-dot" />
          <span>{meta}</span>
        </div>
      )}
    </div>
  );
}
