// src/components/archive/TerminalChat.tsx
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The kit room terminal: a real one, not the site's chat in green.
 *
 * ── Why this is not AskAI ──
 *
 * The first attempt reused AskAI and skinned it with CSS. That was the right
 * instinct — one component, one endpoint, no duplication — and it produced
 * something that was unmistakably a web chat widget painted green: a boxed
 * textarea floating at the top, a row of rounded suggestion chips, a send
 * button, and a large empty rectangle underneath where the conversation had
 * not happened yet.
 *
 * None of that is fixable with styling, because the problem is the *shape*. A
 * chat UI fills from the top and puts its controls in a panel. A terminal
 * fills from the bottom and has no controls at all: there is a scrollback, a
 * prompt, and a cursor, and the prompt is the last line of the scrollback
 * rather than a separate box below it. Those are different layouts, and
 * fighting one into the other with `!important` was going to lose.
 *
 * So this is about ninety lines that duplicate the fetch-and-stream from
 * AskAI, and that duplication is the cheaper mistake. It is the same endpoint
 * and the same wire format, and it emits the same `askai:stream` /
 * `askai:done` events, so the room's citation machinery — doors opening, the
 * wall chart lighting — works identically without knowing which client asked.
 *
 * ── The teletype ──
 *
 * The stream arrives in chunks of many characters at once, which on screen
 * looks like text being pasted in lumps. Characters are buffered and released
 * at a rate that scales with the backlog, so short answers type at a readable
 * clip and long ones accelerate rather than falling minutes behind. The
 * effect is a machine printing, which is the point; the mechanism is a queue,
 * which means it never drops or reorders anything.
 */

type Line = { role: 'user' | 'bot'; text: string };

const API = `${import.meta.env.VITE_API_URL ?? ''}/api/chat`;

export function TerminalChat({ subject }: { subject: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  /** Characters received but not yet printed. */
  const pending = useRef('');
  const linesRef = useRef<Line[]>([]);
  linesRef.current = lines;

  /* ── the print head ──────────────────────────────────────────────────
   * One interval for the life of the component, appending from the buffer to
   * the last line. Rate rises with backlog: two characters a tick when idle,
   * up to a twelfth of whatever is waiting, so a four-hundred-word answer
   * does not take four minutes to appear.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!pending.current) return;
      const take = Math.max(2, Math.floor(pending.current.length / 12));
      const piece = pending.current.slice(0, take);
      pending.current = pending.current.slice(take);
      setLines((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.role !== 'bot') return prev;
        next[next.length - 1] = { ...last, text: last.text + piece };
        return next;
      });
    }, 16);
    return () => window.clearInterval(id);
  }, []);

  // Follow the output down. `scrollTop = scrollHeight` every frame is fine
  // here because the element is short and the alternative — only sticking
  // when already at the bottom — is a feature a terminal does not have.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  /*
   * Keep the prompt focused, always.
   *
   * The field used to carry `disabled={busy}` while an answer streamed, which
   * is the reflex for "do not let them submit twice" and is the wrong tool: a
   * disabled input is blurred by the browser and is not given focus back when
   * it is re-enabled. So every answer ended with the caret gone and the
   * keyboard dead until you clicked the glass — on the one surface in the
   * whole site where reaching for the mouse is a break in character.
   *
   * The guard belongs in `send`, which already has it. The field stays live,
   * so you can type your next question while the current answer is still
   * printing, exactly as you can at a real prompt. This effect only has to
   * cover the case where something else stole focus — the cited-lockers
   * button, a click on the room behind.
   */
  useEffect(() => {
    if (!busy) field.current?.focus();
  }, [busy]);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      setInput('');
      setCaret(0);
      setBusy(true);

      const history = [
        ...linesRef.current.map((l) => ({
          role: l.role === 'user' ? 'user' : 'assistant',
          content: l.text,
        })),
        { role: 'user', content: q },
      ];
      setLines((prev) => [...prev, { role: 'user', text: q }, { role: 'bot', text: '' }]);

      let acc = '';
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-10) }),
        });
        if (!res.body) throw new Error('empty');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const piece = decoder.decode(value, { stream: true });
          if (!piece) continue;
          acc += piece;
          pending.current += piece;
          // The room listens to this: it is what opens the lockers.
          window.dispatchEvent(new CustomEvent('askai:stream', { detail: acc }));
        }
        window.dispatchEvent(new CustomEvent('askai:done', { detail: acc }));
      } catch {
        pending.current += '\n[ LINK DROPPED — ASK AGAIN ]';
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape belongs to the room, which uses it to step back from the counter.
    if (e.key === 'Escape') return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      // Ignored rather than queued while an answer prints. Queueing reads as
      // the terminal swallowing a question; ignoring it leaves the text in
      // the prompt, where the visitor can see it and press enter again.
      if (!busy) void send(input);
    }
  };

  /*
   * The caret is rendered, not the browser's.
   *
   * `caret-color: transparent` hides the system one and a block is drawn at
   * the character index instead, so it is the right shape, the right colour
   * and it blinks on a hard step. Splitting the value at `selectionStart`
   * rather than always parking the block at the end means arrow keys move a
   * visible cursor — the detail that separates a prompt from a text box with
   * a rectangle stuck on the end.
   */
  const sync = (e: { currentTarget: HTMLInputElement }) =>
    setCaret(e.currentTarget.selectionStart ?? input.length);

  const before = input.slice(0, caret);
  const at = input.slice(caret, caret + 1);
  const after = input.slice(caret + 1);

  return (
    <div
      className="flex h-full min-h-0 flex-col px-[20px] py-[14px] text-[13px] leading-[1.85]"
      // Anywhere on the glass is the prompt. A terminal has no click target.
      onMouseDown={() => field.current?.focus()}
    >
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-[8px]">
        {lines.map((l, i) => (
          <p
            key={i}
            className="whitespace-pre-wrap break-words"
            style={{ color: l.role === 'user' ? 'var(--crt-hot)' : 'var(--crt-body)' }}
          >
            {l.role === 'user' ? `> ${l.text}` : l.text}
          </p>
        ))}
        {/* Live region so a screen reader hears the answer; the visual
            teletype is decoration and is not announced character by character. */}
        <p aria-live="polite" className="sr-only">
          {busy ? 'Answering' : lines[lines.length - 1]?.text}
        </p>
      </div>

      <div className="relative shrink-0 pt-[6px]">
        {lines.length === 0 && (
          <p className="pb-[4px]" style={{ color: 'var(--crt-dim)' }}>
            Ask anything about {subject}&rsquo;s work. Enter to send.
          </p>
        )}
        <p className="whitespace-pre-wrap break-words" style={{ color: 'var(--crt-hot)' }}>
          {/* The chevron dims while output is printing — the prompt is still
              live and still typeable, it just is not the machine's turn. */}
          <span style={{ opacity: busy ? 0.4 : 1 }}>&gt; </span>
          <span>{before}</span>
          <span className="crt-block">{at || ' '}</span>
          <span>{after}</span>
          {busy && <span className="crt-caret" style={{ marginLeft: '0.6em', opacity: 0.5 }} />}
        </p>
        <input
          ref={field}
          autoFocus
          value={input}
          onChange={(e) => { setInput(e.target.value); sync(e); }}
          onKeyDown={onKey}
          onKeyUp={sync}
          onClick={sync}
          aria-label="Ask a question"
          className="absolute inset-0 w-full bg-transparent opacity-0 outline-none"
        />
      </div>
    </div>
  );
}