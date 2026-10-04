// src/components/ask/AskChat.tsx
'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SUGGESTED_QUESTIONS } from '@/lib/content';
import { ASK_EVENT } from '@/lib/ask';
import './AskChat.css';

/**
 * Ask about me, as a little space sequence around a real conversation.
 *
 *   1. A pill: type a question and send it.
 *   2. The pill rolls up into a textured, turning planet. A UFO flies in,
 *      hovers over it and sweeps it with a tractor beam while the answer is
 *      fetched ("Searching my history…").
 *   3. When the answer arrives the UFO zooms off and the planet opens out into
 *      a chat card holding the whole conversation, the answer streaming in.
 *   4. A follow-up rolls the card back into the planet, the UFO returns to
 *      scan, and the card reopens with the new answer added to the thread.
 *
 * The full history goes with every question, so follow-ups work. The graph is
 * told when an answer starts and finishes so it can light what was cited, and
 * graph nodes / project sheets prime the input through ASK_EVENT.
 */

type Msg = { role: 'user' | 'assistant'; content: string };

const LABELS = ['Searching my history', 'Scanning projects', 'Connecting the dots'];
const MAX_HISTORY = 16;

/* ── tiny markdown: paragraphs, bullet lists, bold, italic, code, links ── */

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      out.push(
        <a key={k} href={mm[2]} target="_blank" rel="noreferrer">
          {mm[1]}
        </a>,
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split('\n').filter((l) => l.trim());
        if (!lines.length) return null;
        const isList = lines.every((l) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#{1,6}\s+/, ''), `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/* ── planet texture ── */

function lattice(a: number, b: number) {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/** Value noise that wraps horizontally every `px` lattice cells, so the texture tiles as it spins. */
function noise(x: number, y: number, px: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (i: number) => ((i % px) + px) % px;
  const a = lattice(w(xi), yi);
  const b = lattice(w(xi + 1), yi);
  const c = lattice(w(xi), yi + 1);
  const d = lattice(w(xi + 1), yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, px: number, oct = 5) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * noise(x * f, y * f, px * f);
    a *= 0.5;
    f *= 2;
  }
  return s;
}

/**
 * A gas-and-rock world in the site's own colours: violet and indigo bands
 * swirled by turbulence, a pale storm, a few craters on the darker belts.
 * Painted once at 512×256 and tiled horizontally, so scrolling it reads as
 * the planet turning.
 */
let planetTexture: string | null = null;
function getPlanetTexture() {
  if (planetTexture) return planetTexture;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(W, H);
  const P = 8; // noise period in lattice cells across the width
  const stops: [number, number, number][] = [
    [34, 28, 92],
    [74, 66, 178],
    [128, 112, 232],
    [96, 150, 240],
    [176, 160, 250],
    [60, 46, 140],
  ];
  const pick = (t: number) => {
    const x = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = stops[i];
    const b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x / W) * P;
      const ny = (y / H) * 4;
      const turb = fbm(nx * 1.0, ny * 1.5, P, 5);
      const band = 0.5 + 0.5 * Math.sin(ny * 6.2 + turb * 5.5);
      const fine = fbm(nx * 4, ny * 8, P * 4, 3);
      let [r, g, b] = pick(band * 0.85 + fine * 0.2);
      // A pale oval storm.
      const sx = Math.min(Math.abs(x - 330), W - Math.abs(x - 330)) / 46;
      const sy = (y - 158) / 18;
      const storm = Math.exp(-(sx * sx + sy * sy));
      r += (236 - r) * storm * 0.75;
      g += (220 - g) * storm * 0.75;
      b += (255 - b) * storm * 0.75;
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Craters on the darker belts.
  const rand = (() => {
    let s = 0x2ab1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  for (let k = 0; k < 26; k++) {
    const x = rand() * W;
    const y = 30 + rand() * (H - 60);
    const r = 2 + rand() * 7;
    const grd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grd.addColorStop(0, 'rgba(10,8,40,0.55)');
    grd.addColorStop(0.75, 'rgba(10,8,40,0.25)');
    grd.addColorStop(0.9, 'rgba(220,210,255,0.35)');
    grd.addColorStop(1, 'rgba(220,210,255,0)');
    ctx.fillStyle = grd;
    for (const dx of [0, -W, W]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  planetTexture = c.toDataURL('image/png');
  return planetTexture;
}

/* ── the UFO ── */

function UfoArt() {
  return (
    <svg viewBox="0 0 140 150" className="ap-ufo-svg" overflow="visible" aria-hidden>
      <defs>
        <linearGradient id="ap-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6a8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff6a8" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path className="ap-beam" d="M54 64 L86 64 L118 150 L22 150 Z" fill="url(#ap-beam)" />
      <path className="ap-dome" d="M38 52 Q40 14 70 14 Q100 14 102 52 Z" />
      <g className="ap-pilot">
        <path className="ap-ant" d="M62 30 L58 20 M78 30 L82 20" />
        <circle className="ap-ant-tip" cx="58" cy="19" r="2.6" />
        <circle className="ap-ant-tip" cx="82" cy="19" r="2.6" />
        <ellipse className="ap-head" cx="70" cy="40" rx="15" ry="13" />
        <ellipse className="ap-eye" cx="64" cy="38" rx="4.2" ry="5" />
        <ellipse className="ap-eye" cx="76" cy="38" rx="4.2" ry="5" />
        <circle className="ap-pupil" cx="65" cy="40" r="2" />
        <circle className="ap-pupil" cx="77" cy="40" r="2" />
      </g>
      <path className="ap-glint" d="M48 40 Q50 24 62 20" />
      <ellipse className="ap-under" cx="70" cy="62" rx="40" ry="9" />
      <ellipse className="ap-disc" cx="70" cy="54" rx="62" ry="14" />
      <path className="ap-seam" d="M10 54 Q70 66 130 54" />
      <circle className="ap-light l1" cx="26" cy="57" r="4" />
      <circle className="ap-light l2" cx="48" cy="61" r="4" />
      <circle className="ap-light l3" cx="70" cy="62.5" r="4" />
      <circle className="ap-light l1" cx="92" cy="61" r="4" />
      <circle className="ap-light l2" cx="114" cy="57" r="4" />
    </svg>
  );
}

/* ── the component ── */

/** pill: empty, waiting · planet: thinking, UFO scanning · chat: the conversation. */
type Mode = 'pill' | 'planet' | 'chat';
/** Where the UFO is: away (off-frame), arriving/scanning over the planet, or leaving. */
type UfoState = 'away' | 'scan' | 'leave';

const MIN_SCAN_MS = 2600;

export function AskChat({ note }: { note?: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('pill');
  const [ufo, setUfo] = useState<UfoState>('away');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(0);
  const [hint, setHint] = useState(0);
  const [tex, setTex] = useState('');
  /** True once the shell has finished growing into the card; the chat text waits for it. */
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (mode !== 'chat') {
      setOpened(false);
      return;
    }
    // Fallback in case transitionend never fires (interrupted or reduced motion).
    const t = window.setTimeout(() => setOpened(true), 820);
    return () => window.clearTimeout(t);
  }, [mode]);

  const pillRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);

  const busy = mode === 'planet' || streaming;
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    setTex(getPlanetTexture());
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      abortRef.current?.abort();
    };
  }, []);

  // Graph nodes and project sheets prime whichever input is showing.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q !== 'string') return;
      setInput(q);
      requestAnimationFrame(() =>
        (modeRef.current === 'chat' ? chatInputRef.current : pillRef.current)?.focus({ preventScroll: true }),
      );
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);

  useEffect(() => {
    if (mode !== 'planet') return;
    setLabel(0);
    const id = window.setInterval(() => setLabel((l) => (l + 1) % LABELS.length), 1250);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (input || mode === 'planet') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setHint((h) => (h + 1) % SUGGESTED_QUESTIONS.length), 3600);
    return () => window.clearInterval(id);
  }, [input, mode]);

  // Thread follows the newest text unless the reader has scrolled up.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const el = threadRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      setError(null);
      setInput('');
      stick.current = true;
      window.dispatchEvent(new CustomEvent('askai:start'));

      const history: Msg[] = [...messages, { role: 'user', content: q }];
      setMessages([...history, { role: 'assistant', content: '' }]);

      // Roll into the planet; the UFO arrives once it has formed.
      setMode('planet');
      setUfo('away');
      later(() => setUfo('scan'), 520);
      const t0 = performance.now();

      const ac = new AbortController();
      abortRef.current = ac;
      let acc = '';
      let opened = false;
      const open = () => {
        if (opened) return;
        opened = true;
        const wait = Math.max(0, MIN_SCAN_MS - (performance.now() - t0));
        later(() => {
          setUfo('leave');
          later(() => {
            setMode('chat');
            later(() => chatInputRef.current?.focus({ preventScroll: true }), 650);
          }, 420);
          later(() => setUfo('away'), 1400);
        }, wait);
      };
      const write = (text: string) =>
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { role: 'assistant', content: text };
          return next;
        });

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error('bad response');
        setStreaming(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const piece = decoder.decode(value, { stream: true });
          if (!piece) continue;
          acc += piece;
          window.dispatchEvent(new CustomEvent('askai:stream', { detail: acc }));
          write(acc);
          open();
        }
        if (!acc.trim()) throw new Error('empty');
        window.dispatchEvent(new CustomEvent('askai:done', { detail: acc }));
        open();
      } catch {
        if (ac.signal.aborted) return;
        setError('The answer did not come through. Try asking again.');
        setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -2)));
        setUfo('leave');
        later(() => setUfo('away'), 900);
        later(() => setMode(history.length > 1 ? 'chat' : 'pill'), 400);
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setStreaming(false);
      }
    },
    [busy, messages],
  );

  const reset = () => {
    abortRef.current?.abort();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setMessages([]);
    setError(null);
    setStreaming(false);
    setUfo('away');
    setMode('pill');
    window.dispatchEvent(new CustomEvent('askai:start'));
    later(() => pillRef.current?.focus({ preventScroll: true }), 500);
  };

  const asked = useMemo(
    () => new Set(messages.filter((m) => m.role === 'user').map((m) => m.content)),
    [messages],
  );
  // Suggestions not yet asked, rotating as the placeholder; Tab takes the one showing.
  const pool = SUGGESTED_QUESTIONS.filter((q) => !asked.has(q));
  const suggestion = pool.length ? pool[hint % pool.length] : '';
  const last = messages.length - 1;
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.content;

  return (
    <div className="ap" data-mode={mode} data-open={opened ? '' : undefined}>
      <div className="ap-intro" aria-hidden={mode !== 'pill'}>
        <h2 className="t-heading-lg text-bone">Ask about me</h2>
        <p className="t-body mt-[8px] text-mist">It knows my work, and says when it doesn&rsquo;t.</p>
      </div>

      <div className="ap-stage">
        {/* The UFO lives outside the shell so it can fly in from off-frame. */}
        <div className="ap-ufo" data-state={ufo}>
          <UfoArt />
        </div>

        <div
          className="ap-shell"
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && e.propertyName === 'height' && mode === 'chat') setOpened(true);
          }}
        >
          {/* Planet surface: shown while the shell is round. */}
          <div className="ap-planet" aria-hidden>
            <div className="ap-planet-tex" style={tex ? { backgroundImage: `url(${tex})` } : undefined} />
            <div className="ap-planet-shade" />
            <div className="ap-scan" />
          </div>

          {/* Pill. */}
          <form
            className="ap-pill"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            autoComplete="off"
          >
            <svg className="ap-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 3.5l1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7L10 3.5z" />
              <path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
            </svg>
            <input
              id="ask-input"
              ref={pillRef}
              value={mode === 'pill' ? input : ''}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey && !input) {
                  e.preventDefault();
                  setInput(suggestion);
                }
              }}
              placeholder={suggestion}
              aria-label="Ask a question about Ishant"
              maxLength={400}
              tabIndex={mode === 'pill' ? 0 : -1}
            />
            {!input && suggestion && <kbd className="ap-tab">Tab</kbd>}
            <button type="submit" className="ap-send" aria-label="Ask" data-ready={input.trim() ? '' : undefined} tabIndex={mode === 'pill' ? 0 : -1}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5" />
                <path d="M5.5 11.5L12 5l6.5 6.5" />
              </svg>
            </button>
          </form>

          {/* Chat. */}
          <div className="ap-chat" aria-hidden={mode !== 'chat'}>
            <div className="ap-chat-head">
              <span className="ap-chat-title">
                <i aria-hidden /> Ask about me
              </span>
              <button type="button" className="ap-new" onClick={reset} tabIndex={mode === 'chat' ? 0 : -1}>
                New conversation
              </button>
            </div>
            <div ref={threadRef} className="ap-thread" data-lenis-prevent aria-live="polite">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="ap-q">
                    {m.content}
                  </div>
                ) : m.content ? (
                  <div key={i} className="ap-a">
                    <div className="ap-md">
                      <Markdown text={m.content} />
                      {streaming && i === last && <span className="ap-caret" />}
                    </div>
                    {i === last && !streaming && note && <p className="ap-note">{note}</p>}
                  </div>
                ) : null,
              )}
            </div>
            {error && (
              <p role="alert" className="ap-error">
                {error}
              </p>
            )}
            <form
              className="ap-chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                ref={chatInputRef}
                rows={1}
                value={mode === 'chat' ? input : ''}
                maxLength={400}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  } else if (e.key === 'Tab' && !e.shiftKey && !input && suggestion) {
                    e.preventDefault();
                    setInput(suggestion);
                  }
                }}
                placeholder={suggestion || 'Ask a follow-up…'}
                aria-label="Ask a follow-up question"
                tabIndex={mode === 'chat' ? 0 : -1}
              />
              {!input && suggestion && <kbd className="ap-tab">Tab</kbd>}
              <button type="submit" className="ap-send" aria-label="Send" data-ready={input.trim() ? '' : undefined} disabled={busy} tabIndex={mode === 'chat' ? 0 : -1}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 19V5" />
                  <path d="M5.5 11.5L12 5l6.5 6.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        {/* Under the planet: what it is asking, and what it is doing. */}
        <div className="ap-status" aria-hidden={mode !== 'planet'}>
          <p className="ap-status-q">{lastQuestion}</p>
          <p className="ap-status-l">
            {LABELS[label]}
            <span className="ap-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </p>
        </div>
      </div>

      {mode === 'pill' && error && (
        <p role="alert" className="ap-error ap-error-intro">
          {error}
        </p>
      )}
    </div>
  );
}
