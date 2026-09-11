// src/components/archive/TerminalBoot.tsx
import { useEffect, useRef, useState } from 'react';

/**
 * The boot sequence the terminal runs before it hands you a prompt.
 *
 * ── Why a delay is worth adding to something already fast ──
 *
 * Every instinct in interface work says remove waiting. This adds about two
 * and a half seconds of it, on purpose, and it is the cheapest atmosphere in
 * the whole room.
 *
 * A panel that appears instantly, fully formed, is a modal — you have opened a
 * dialog. A machine that counts its memory, finds its link and reports what it
 * is holding is a machine you have switched on, and the two feel nothing alike
 * despite differing only in timing. The content is honest too: the locker and
 * node counts are the real ones from the live store, so the boot is reporting
 * the room rather than performing at you.
 *
 * It runs once per visit. Re-booting on every open would turn a flourish into
 * a toll, which is the line between a detail and an annoyance.
 *
 * ── The typing ──
 *
 * Per-character, at a rate that varies slightly line to line, with a longer
 * pause after the leader dots. Constant-rate typing reads as an animation;
 * uneven typing reads as a device doing work of differing difficulty. The
 * `…OK` on the end of a line lands a beat after the dots for the same reason.
 */

type Line = { text: string; speed: number; pause: number };

export function TerminalBoot({
  lockers,
  nodes,
  onDone,
}: {
  lockers: number;
  nodes: number;
  onDone: () => void;
}) {
  const [shown, setShown] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const lines: Line[] = [
      { text: 'ARCHIVE KIT ROOM — TERMINAL 2.6', speed: 12, pause: 200 },
      { text: 'MEMORY ....................... 640K OK', speed: 9, pause: 90 },
      { text: `INDEX ........................ ${lockers} LOCKERS / ${nodes} NODES`, speed: 9, pause: 90 },
      { text: 'LINK /api/chat ............... ESTABLISHED', speed: 9, pause: 220 },
      { text: '', speed: 0, pause: 60 },
      { text: 'ASK ANYTHING ABOUT THE WORK.', speed: 16, pause: 120 },
    ];

    /*
     * Reduced motion skips the whole thing rather than speeding it up. Someone
     * who has asked for less movement does not want the same animation faster;
     * they want the terminal.
     */
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(lines.map((l) => l.text));
      const t = window.setTimeout(() => done.current(), 300);
      return () => window.clearTimeout(t);
    }

    let li = 0;
    let ci = 0;
    let timer = 0;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const line = lines[li];
      if (!line) {
        done.current();
        return;
      }
      if (ci < line.text.length) {
        ci += 1;
        setCurrent(line.text.slice(0, ci));
        timer = window.setTimeout(step, line.speed);
        return;
      }
      // Line finished: commit it and move on after its own pause.
      setShown((prev) => [...prev, line.text]);
      setCurrent('');
      li += 1;
      ci = 0;
      timer = window.setTimeout(step, line.pause);
    };

    timer = window.setTimeout(step, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lockers, nodes]);

  return (
    <div className="px-[20px] py-[26px] text-[13px] leading-[1.9] sm:px-[32px]">
      {shown.map((l, i) => (
        <p key={i} className="whitespace-pre text-[var(--crt-body)]">
          {l || '\u00a0'}
        </p>
      ))}
      <p className="crt-caret whitespace-pre text-[var(--crt-body)]">{current}</p>
    </div>
  );
}