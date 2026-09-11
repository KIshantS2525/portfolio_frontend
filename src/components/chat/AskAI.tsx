// src/components/chat/AskAI.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SUGGESTED_QUESTIONS } from '@/lib/content';
import { ASK_EVENT } from '@/lib/ask';
import { Markdown } from '@/components/chat/Markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

/**
 * Minimal ambient typing for the Web Speech API — it's still non-standard
 * enough that TypeScript's lib.dom doesn't ship it, and the vendor-prefixed
 * `webkitSpeechRecognition` is what every shipping browser actually exposes.
 * Kept local to this file rather than a global .d.ts since nothing else uses it.
 */
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AskAI({ heading = true }: { heading?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported = useMemo(() => getSpeechRecognition() !== null, []);

  /* Selecting a node in the graph primes this box. */
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q === 'string') {
        setInput(q);
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);

  /* Auto-scroll, but stop the moment the reader scrolls up themselves. */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });

  /* Stop any live mic session on unmount, so it never keeps listening after the card's gone. */
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;

      setError(null);
      setInput('');
      stickRef.current = true;

      const history: Msg[] = [...messages, { role: 'user', content: q }];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setBusy(true);

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!res.body) throw new Error('empty response');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        /*
         * The answer, broadcast as it arrives.
         *
         * Deliberately a window event rather than a prop or a callback: this
         * component is mounted on the homepage, in the studio, and on the
         * counter of the locker room, and only one of those three cares what
         * is being said. An optional `onStream` prop would have to be threaded
         * through every call site to serve the one that does.
         *
         * Nothing listens by default, so everywhere else this is two extra
         * statements that cost nothing and change no behaviour.
         */
        let acc = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const piece = decoder.decode(value, { stream: true });
          if (!piece) continue;
          acc += piece;
          window.dispatchEvent(new CustomEvent('askai:stream', { detail: acc }));
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + piece };
            return next;
          });
        }
        window.dispatchEvent(new CustomEvent('askai:done', { detail: acc }));
      } catch {
        setError('The connection dropped before the answer finished. Try asking again.');
        setMessages((prev) => prev.filter((m) => m.content !== '' || m.role === 'user'));
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  /** Wipes the conversation back to the empty state — suggestions and all. */
  const clearAll = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setMessages([]);
    setInput('');
    setError(null);
    stickRef.current = true;
  }, []);

  /** Toggles the mic. Dictation replaces whatever's currently typed, like every other voice-to-text field. */
  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening]);

  const empty = messages.length === 0;

  /*
   * Follow-up questions: the site used to hide the suggested-question chips
   * the instant the first answer arrived, leaving free-typing as the only
   * way to keep going. They now stay available for the rest of the
   * conversation (minus anything already asked), so "ask a follow-up" has an
   * obvious affordance instead of just an empty text box.
   */
  const askedAlready = useMemo(
    () => new Set(messages.filter((m) => m.role === 'user').map((m) => m.content)),
    [messages],
  );
  const remainingSuggestions = SUGGESTED_QUESTIONS.filter((q) => !askedAlready.has(q));

  return (
    <section className="scroll-mt-[96px] p-[20px] sm:p-[32px]">
      {heading && (
        <div className="mx-auto max-w-[560px] text-center">
          <h2 className="t-heading-lg text-bone">Ask about me</h2>
          <p className="t-body mx-auto mt-[12px] max-w-[46ch] text-mist">
            Ask me anything about the work. It has my full history and nothing else, and it
            will tell you when it doesn&rsquo;t know.
          </p>
        </div>
      )}

      <div className="mx-auto mt-[30px] max-w-[720px]">
        {!empty && (
          <div className="mb-[12px] flex items-center justify-end">
            <button
              type="button"
              onClick={clearAll}
              className="t-caption text-ash underline decoration-ash/40 underline-offset-4 transition-colors hover:text-bone hover:decoration-bone"
            >
              Clear conversation
            </button>
          </div>
        )}

        {!empty && (
          <div
            ref={listRef}
            data-lenis-prevent
            className="mb-[18px] max-h-[46vh] space-y-[18px] overflow-y-auto overscroll-contain pr-[6px]"
          >
            {messages.map((m, i) => (
              <div key={i}>
                {m.role === 'user' ? (
                  <p className="t-heading-2xs text-bone">{m.content}</p>
                ) : m.content ? (
                  <Markdown content={m.content} />
                ) : busy && i === messages.length - 1 ? (
                  <span className="inline-flex items-center gap-[6px] text-ash">
                    <span className="pulse-dot inline-block h-[6px] w-[6px] rounded-full bg-iris" />
                    <span className="t-caption">Thinking</span>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="group relative rounded-[24px] border border-ash/25 transition-colors duration-300 focus-within:border-iris">
            <label htmlFor="ask-input" className="sr-only">
              Ask a question about Ishant
            </label>
            <textarea
              id="ask-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              maxLength={600}
              placeholder={listening ? 'Listening…' : 'What has he actually shipped?'}
              className={`t-body w-full resize-none rounded-[24px] bg-transparent px-[24px] py-[18px] text-bone outline-none placeholder:text-ash ${
                speechSupported ? 'pr-[172px]' : 'pr-[128px]'
              }`}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                aria-pressed={listening}
                aria-label={listening ? 'Stop voice input' : 'Ask by voice'}
                title={listening ? 'Stop voice input' : 'Ask by voice'}
                className={`absolute bottom-[12px] right-[102px] flex h-[38px] w-[38px] items-center justify-center rounded-full border transition-colors ${
                  listening
                    ? 'border-saffron/60 text-saffron'
                    : 'border-ash/25 text-ash hover:border-ash/60 hover:text-bone'
                }`}
              >
                {listening && (
                  <span className="pulse-dot absolute inset-0 rounded-full bg-saffron/15" aria-hidden />
                )}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="relative">
                  <path
                    d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M19 11a7 7 0 0 1-14 0M12 18v3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="pill absolute bottom-[12px] right-[12px] !px-[18px] !py-[10px] disabled:pointer-events-none disabled:opacity-40"
            >
              {busy ? 'Thinking' : 'Ask'}
            </button>
          </div>
        </form>

        {remainingSuggestions.length > 0 && (
          <div className="mt-[18px] flex flex-wrap justify-center gap-[6px]">
            {remainingSuggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={busy}
                className="rounded-full border border-ash/25 px-[15px] py-[8px] text-[13px] font-[200] text-mist transition-colors duration-200 hover:border-ash/60 hover:text-bone disabled:pointer-events-none disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="t-caption mt-[12px] text-saffron">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}