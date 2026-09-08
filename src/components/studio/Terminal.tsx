'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVisible } from '@/components/core/WhenVisible';
import { profile } from '@/lib/content';

type Line = { kind: 'cmd' | 'fail' | 'arrow'; text: string; short?: string };

/**
 * The right showpiece for an AI engineer: nearly free (it is DOM text) and it
 * carries voice. Plays once and settles — a looping typing animation feels
 * cheap the second time you land on the page.
 *
 * Timing note: only the commands type character by character. Output lines
 * print whole, with a short stagger, because that is what a real terminal does
 * — and because typing all 214 characters at 45ms left the name and the CTAs
 * invisible for eleven seconds. This page has sixty seconds to make its case;
 * it cannot spend a fifth of them on an animation. It now settles in about four.
 */
const LINES: Line[] = [
  {
    kind: 'cmd',
    text: 'recall --device=snapdragon-x-elite --check-vector-db',
    short: 'recall --check-vector-db',
  },
  { kind: 'fail', text: 'qdrant       no win_arm64 wheel' },
  { kind: 'fail', text: 'chromadb     no win_arm64 wheel' },
  { kind: 'fail', text: 'sqlite-vec   no win_arm64 wheel' },
  { kind: 'cmd', text: 'ishant --solve' },
  {
    kind: 'arrow',
    text: 'wrote int8-quantized KNN in numpy + sqlite. 2:47am.',
    short: 'int8 KNN in numpy + sqlite. 2:47am.',
  },
  { kind: 'arrow', text: 'shipped.' },
];

const TYPE_MS = 34;   // per character, commands only
const PRINT_MS = 190; // per output line
const PAUSE_MS = 420; // beat before the next command

export function Terminal() {
  const visible = useVisible();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);
  const [done, setDone] = useState(false);
  const [small, setSmall] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    setSmall(window.innerWidth < 768);
  }, []);

  const lines = useMemo(
    () => LINES.map((l) => ({ ...l, text: small && l.short ? l.short : l.text })),
    [small],
  );

  useEffect(() => {
    if (!visible || started.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLine(lines.length);
      setDone(true);
      return;
    }
    started.current = true;

    let li = 0;
    let ci = 0;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      if (li >= lines.length) {
        setDone(true);
        return;
      }
      const current = lines[li];

      if (current.kind === 'cmd' && ci < current.text.length) {
        ci += 1;
        setChars(ci);
        timer = setTimeout(step, TYPE_MS);
        return;
      }

      li += 1;
      ci = 0;
      setLine(li);
      setChars(0);
      const next = lines[li];
      timer = setTimeout(step, next?.kind === 'cmd' ? PAUSE_MS : PRINT_MS);
    };

    timer = setTimeout(step, 300);
    return () => clearTimeout(timer);
  }, [visible, lines]);

  return (
    <div>
      {/* Height is reserved so the name below never jumps as lines arrive. */}
      <div className="min-h-[200px] font-mono text-[13px] leading-[1.9] md:min-h-[220px] md:text-[15px]">
        {lines.map((l, i) => {
          if (i > line) return null;
          const typing = i === line && l.kind === 'cmd';
          if (typing && chars === 0) return null;
          const shown = typing ? l.text.slice(0, chars) : l.text;
          return (
            <div key={i} className="flex gap-[10px]">
              <span
                className={
                  l.kind === 'cmd' ? 'text-iris' : l.kind === 'fail' ? 'text-saffron' : 'text-verdant'
                }
                aria-hidden
              >
                {l.kind === 'cmd' ? '$' : l.kind === 'fail' ? '✗' : '→'}
              </span>
              <span className={`whitespace-pre ${l.kind === 'cmd' ? 'text-bone' : 'text-mist'}`}>
                {shown}
                {typing && <span className="caret text-iris">▌</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="mt-[36px] transition-opacity duration-700"
        style={{ opacity: done ? 1 : 0 }}
        aria-hidden={!done}
      >
        <h1 className="t-heading-lg font-sans text-bone">{profile.name}</h1>
        <p className="t-body mt-[12px] max-w-[52ch] font-sans text-mist">{profile.positioning}</p>
        <div className="mt-[24px] flex flex-wrap items-center gap-x-[30px] gap-y-[6px] font-sans">
          <a href="#ask" className="pill" tabIndex={done ? 0 : -1}>
            Ask my AI about me
          </a>
          <a href={profile.resume} download className="ghost" tabIndex={done ? 0 : -1}>
            Download resume
          </a>
        </div>
      </div>
    </div>
  );
}
