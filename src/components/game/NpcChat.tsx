// src/components/game/NpcChat.tsx
import { useCallback, useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };

/**
 * The NPC's side of the conversation: a Pokémon-style "press E to talk"
 * exchange, built out of two pieces that already exist elsewhere in the
 * codebase in spirit —
 *
 *   · a compact question bar at the bottom (opens the moment you talk to
 *     the guide, so typing is the very next thing you do)
 *   · a slide-in panel on the right for the actual answer, the same slot
 *     the archive's WritingPad occupies for a project file — except themed
 *     for this room's dark, bevelled HUD instead of the archive's paper
 *
 * It reuses the exact `/api/chat` contract AskAI already talks to (a
 * streamed POST of the running message history) rather than inventing a
 * second endpoint, so answering "as the guide" is really just answering the
 * same question the homepage's Ask AI box would.
 *
 * Deliberately renders answers as plain wrapped text rather than through the
 * site's `Markdown` component: that component's styling is tuned for the
 * light/dark *site* theme, not this room's always-dark voxel HUD, and a
 * guide's spoken answer doesn't need tables or headings anyway.
 */
export function NpcChat({
  open,
  npcName,
  onClose,
  onBubble,
}: {
  open: boolean;
  npcName: string;
  onClose: () => void;
  /** Drives the little speech bubble over the NPC's head — see Game.tsx. */
  onBubble: (text: string | null) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bubbleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // The bubble is this component's side-effect on the world, not its own
  // UI — clear any pending "clear the bubble" timer on unmount so a closed
  // chat can't reach back in a few seconds later and blank out whatever the
  // player is doing next.
  useEffect(() => () => {
    if (bubbleTimerRef.current != null) window.clearTimeout(bubbleTimerRef.current);
  }, []);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setError(null);
      setInput('');

      const history: Msg[] = [...messages, { role: 'user', content: q }];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setBusy(true);
      onBubble('Let me think…');

      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        });
        if (!res.body) throw new Error('empty response');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const piece = decoder.decode(value, { stream: true });
          if (!piece) continue;
          acc += piece;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: acc };
            return next;
          });
        }

        // A short, generic acknowledgement over the NPC's head — the real
        // answer lives in the panel; the bubble is just "look over there."
        onBubble("Here's the answer to your question!");
        if (bubbleTimerRef.current != null) window.clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = window.setTimeout(() => onBubble(null), 4000);
      } catch {
        setError('Lost the connection before that finished — try asking again.');
        setMessages((prev) => prev.filter((m) => m.content !== '' || m.role === 'user'));
        onBubble("Sorry, I didn't catch that.");
        if (bubbleTimerRef.current != null) window.clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = window.setTimeout(() => onBubble(null), 3000);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, onBubble],
  );

  const close = useCallback(() => {
    setMessages([]);
    setInput('');
    setError(null);
    setBusy(false);
    onBubble(null);
    onClose();
  }, [onClose, onBubble]);

  return (
    <>
      {/* The bottom question bar — opens the instant you talk to the guide. */}
      <div
        aria-hidden={!open}
        className="voxel-npc-bar"
        style={{ display: open ? 'flex' : 'none' }}
      >
        <span className="voxel-npc-bar-name">{npcName}</span>
        <form
          className="voxel-npc-bar-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={280}
            placeholder={busy ? 'Thinking…' : `Ask ${npcName} about the work…`}
            className="voxel-npc-bar-input"
          />
          <button type="submit" disabled={busy || !input.trim()} className="voxel-npc-bar-send">
            {busy ? '…' : 'Ask'}
          </button>
          <button type="button" onClick={close} className="voxel-npc-bar-close" aria-label="Stop talking">
            ✕
          </button>
        </form>
      </div>

      {/* The answer panel — the writing-pad slot, themed for this room. */}
      <div
        aria-hidden={messages.length === 0}
        className="voxel-npc-panel"
        style={{
          opacity: messages.length ? 1 : 0,
          transform: messages.length ? 'translateX(0)' : 'translateX(24px)',
          pointerEvents: messages.length ? 'auto' : 'none',
        }}
      >
        <div className="voxel-npc-panel-head">
          <span>{npcName}</span>
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="voxel-npc-panel-clear">
              Clear
            </button>
          )}
        </div>
        <div ref={listRef} data-lenis-prevent className="voxel-npc-panel-body">
          {messages.map((m, i) => (
            <p key={i} className={m.role === 'user' ? 'voxel-npc-msg-you' : 'voxel-npc-msg-them'}>
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </p>
          ))}
        </div>
        {error && <p className="voxel-npc-panel-error">{error}</p>}
      </div>
    </>
  );
}