// src/routes/Archive.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { PullCord } from 'pullcord';
import 'pullcord/pullcord.css';
import { buildRoom, type LockerRoom, type Locker } from '@/components/archive/lockerScene';
import { WritingPad } from '@/components/archive/WritingPad';
import { TerminalBoot } from '@/components/archive/TerminalBoot';
import { TerminalChat } from '@/components/archive/TerminalChat';
import { boardRows, type ContactRow } from '@/components/archive/NoticeBoard';
import '@/components/archive/archive.css';
import { buildChart } from '@/components/archive/wallchart';
import { buildMatcher, sameSet } from '@/components/archive/cite';
import { buildGraph } from '@/lib/graph';
import {
  useAchievements,
  useProfile,
  useProjects,
  useRoles,
} from '@/lib/useContent';

/**
 * /archive — the locker room.
 *
 * Lazy-split in App.tsx exactly like /admin, so a visitor who never opens the
 * door downloads none of it. That is the whole bargain of a second experience:
 * it can be as maximal as it likes because it costs the default reader nothing.
 *
 * The scene is a plain module. React owns the element, the loop, the listeners
 * and every piece of text; three.js owns the geometry, the lights and the
 * camera, and never learns React exists.
 *
 * ── Why all of the type IS in the scene ──
 *
 * It was not, for three passes. Locker names, the notice board and the
 * doorway sign were HTML positioned by projecting a world anchor through the
 * camera each frame, on the reasoning that DOM type inherits the site's
 * fonts, stays crisp at any pixel ratio and can be read aloud.
 *
 * All true, and all beaten by one fact: a screen-parallel element cannot sit
 * on a surface that is not. Walking a corridor means every card on it is
 * steeply foreshortened, so the names slid off their own doors onto their
 * neighbours'; the notice board ended up with two sets of cards, its own and
 * a web widget floating in front; and ARCHIVE clipped through the header beam
 * because HTML has no depth and cannot be occluded.
 *
 * Everything is painted into textures now — see paintChit, paintNote and
 * paintSign in lockerScene. The accessibility argument survives in the
 * sr-only list at the bottom of this file, which is where it was doing the
 * work all along.
 *
 * The terminal is the one exception, and a principled one: a conversation
 * needs a caret, a scrollback, selection, an IME and a keyboard. That is a
 * user interface, not a label.
 *
 * ── Why the door opens before the pad arrives ──
 *
 * A click that summons a panel instantly is a button. A click that swings a
 * door, and then hands you what was inside, is a place. The 380ms gap below
 * is the difference, and it is roughly how long the hinge takes to clear.
 */
export default function Archive() {
  const host = useRef<HTMLDivElement>(null);
  const roomRef = useRef<LockerRoom | null>(null);
  const lockersRef = useRef<Locker[]>([]);
  const padTimer = useRef<number | null>(null);
  /** The scene effect's `go`, exposed so callbacks outside it can walk. */
  const walkRef = useRef<((t: number) => void) | null>(null);
  /*
   * A ref shadowing `atTerminal`, for the listeners in the scene effect below.
   *
   * Those listeners are registered once and close over the first render's
   * values forever, so reading the state directly inside them would be stale
   * from the second render on and every guard would be wrong. Putting
   * `atTerminal` in the effect's deps instead would tear down and rebuild the
   * whole room — geometry, textures, lights, canvases — every time the
   * terminal opened, which is an absurd price for a boolean.
   *
   * Declared up here rather than beside the state it mirrors, because it is
   * read a hundred lines before that point and a const referenced above its
   * own declaration is legal, confusing, and exactly the sort of thing that
   * survives review and then breaks when someone reorders two hooks.
   */
  const termRef = useRef(false);

  const profile = useProfile();
  const { projects } = useProjects();
  const roles = useRoles();
  const achievements = useAchievements();

  /*
   * The same graph the homepage constellation is built from, laid out flat.
   *
   * Built here rather than in the scene because it is content, not geometry:
   * it comes from the live store, so a project added in the admin panel shows
   * up as a node on the wall and as a locker in the corridor from one edit.
   * The scene is handed a finished layout and never learns what a role is.
   */
  const chart = useMemo(
    () => buildChart(buildGraph(true, projects, { roles, achievements, profile })),
    [projects, roles, achievements, profile],
  );

  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [lit, setLit] = useState(true);
  const [atTerminal, setAtTerminal] = useState(false);
  useEffect(() => { termRef.current = atTerminal; }, [atTerminal]);
  /** Projects the current answer named, in the order the chart has them. */
  const [citedSlugs, setCitedSlugs] = useState<string[]>([]);
  /*
   * Once per visit, not once per open. A boot sequence is a flourish the first
   * time and a toll every time after it.
   */
  const [booted, setBooted] = useState(false);
  const [depth, setDepth] = useState(0);
  const [title, setTitle] = useState({ amount: 1, facing: 0 });

  const entries = useMemo(
    () => projects.map((p) => ({ slug: p.slug, label: p.name })),
    [projects],
  );
  const rows = useMemo<ContactRow[]>(() => boardRows(profile), [profile]);
  const bySlug = useMemo(() => new Map(projects.map((p) => [p.slug, p])), [projects]);
  const open = openSlug ? bySlug.get(openSlug) ?? null : null;

  const close = useCallback(() => {
    if (padTimer.current) window.clearTimeout(padTimer.current);
    setOpenSlug(null);
    roomRef.current?.setOpen(null);
  }, []);

  const leaveTerminal = useCallback(() => {
    setAtTerminal(false);
    roomRef.current?.setTerminal(false);
  }, []);

  /**
   * Step back from the counter and walk to the first locker the answer named.
   * The doors are already open — this only turns the reader around to see it.
   */
  const goToCited = useCallback(() => {
    const r = roomRef.current;
    const slug = citedSlugs[0];
    if (!r || !slug) return;
    const target = r.lockers.find((x) => x.slug === slug);
    setAtTerminal(false);
    r.setTerminal(false);
    if (target) walkRef.current?.(r.progressFor(target.id));
  }, [citedSlugs]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    /*
     * ACES tone mapping, which the rest of the site has no use for and this
     * room cannot do without. Point lights close to dark metal blow out to
     * flat white in linear output — you lose the whole roll-off from the
     * strip down the door, which is the only reason the room looks lit rather
     * than coloured in. Tone mapping is what keeps a highlight a highlight.
     */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    el.appendChild(renderer.domElement);

    const r = buildRoom({
      entries,
      board: rows,
      title: profile.name,
      chart,
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    roomRef.current = r;
    lockersRef.current = r.lockers;
    r.resize(el.clientWidth, el.clientHeight);

    /*
     * Scroll without a scrollbar. There is no tall page here — the document is
     * one viewport and the depth is in the room — so wheel and touch deltas are
     * integrated into a 0..1 walk by hand. Which also means the same number is
     * drivable from the keyboard, and the room is walkable with no pointer.
     */
    let t = 0;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const go = (v: number) => { t = clamp(v); r.setProgress(t); setDepth(t); };
    walkRef.current = go;
    const nudge = (d: number) => go(t + d);

    const onWheel = (e: WheelEvent) => {
      // Scrolling while seated must not walk the camera backwards out of the
      // chat. The panel has its own scroll and handles its own wheel.
      if (termRef.current) return;
      e.preventDefault();
      nudge(e.deltaY * 0.00042);
    };
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (termRef.current) return;
      const y = e.touches[0].clientY;
      nudge((lastY - y) * 0.0018);
      lastY = y;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); leaveTerminal(); return; }
      /*
       * Every other key is ignored while the terminal is open. Without this,
       * typing a question into the chat would also walk the camera: the space
       * bar in "how did you build it" is a page-down to this handler.
       */
      if (termRef.current) return;
      const step =
        e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' ? 0.04
        : e.key === 'ArrowUp' || e.key === 'PageUp' ? -0.04
        : e.key === 'Home' ? -1 : e.key === 'End' ? 1 : 0;
      if (!step) return;
      e.preventDefault();
      nudge(step);
    };

    const toNdc = (cx: number, cy: number) => {
      const b = el.getBoundingClientRect();
      return [((cx - b.left) / b.width) * 2 - 1, -(((cy - b.top) / b.height) * 2 - 1)] as const;
    };
    const onPointerMove = (e: PointerEvent) => {
      const [nx, ny] = toNdc(e.clientX, e.clientY);
      if (termRef.current) { el.style.cursor = ''; return; }
      r.setLook(nx, ny);
      const id = r.pick(nx, ny);
      // Hover only tints the door and repaints the chart, both in the scene.
      // React never needs to know, which keeps setState off every pointermove.
      r.setHover(id);
      const node = r.pickChart(nx, ny);
      r.setChartHover(node?.id ?? null);
      const hit =
        id !== null || node !== null || r.pickNote(nx, ny) || r.pickTerminal(nx, ny);
      el.style.cursor = hit ? 'pointer' : '';
    };
    const onClick = (e: PointerEvent) => {
      if (termRef.current) return;
      const [nx, ny] = toNdc(e.clientX, e.clientY);
      if (r.pickTerminal(nx, ny)) {
        close();
        setAtTerminal(true);
        r.setTerminal(true);
        return;
      }
      /*
       * A node on the wall chart that stands for a project walks you back to
       * its locker and opens it.
       *
       * This is the join between the two halves of the room — the map and the
       * thing the map is of. Clicking a project on the chart is the same
       * gesture as clicking its door, so the chart is not an illustration of
       * the corridor, it is an index into it. Nodes with no locker behind them
       * (roles, technologies, the person) light their neighbourhood and do
       * nothing else, which is the honest answer: there is nowhere to send you.
       */
      const node = r.pickChart(nx, ny);
      if (node) {
        if (node.kind !== 'project' || !node.ref) return;
        const target = r.lockers.find((x) => x.slug === node.ref);
        if (!target) return;
        r.setOpen(target.id);
        go(r.progressFor(target.id));
        padTimer.current = window.setTimeout(() => setOpenSlug(target.slug), 380);
        return;
      }
      // The notice board next: its notes sit on the lobby wall, where no door
      // can be, so those two picks can never both hit.
      const href = r.pickNote(nx, ny);
      if (href) {
        window.open(href, href.startsWith('http') ? '_blank' : '_self', 'noreferrer');
        return;
      }
      const id = r.pick(nx, ny);
      if (padTimer.current) window.clearTimeout(padTimer.current);
      if (id === null) { close(); return; }
      const l = r.lockers.find((x) => x.id === id);
      if (!l) return;
      r.setOpen(id);
      // Walk to the locker as it opens, so you are never reading a file for a
      // door that is behind you.
      go(r.progressFor(id));
      // The door first, the contents after. See the header note.
      padTimer.current = window.setTimeout(() => setOpenSlug(l.slug), 380);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('click', onClick as EventListener);
    window.addEventListener('keydown', onKey);

    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      r.resize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      r.tick(dt);
      renderer.render(r.scene, r.camera);

      /*
       * The only thing left for React to know each frame.
       *
       * This loop used to project three world anchors into screen space every
       * tick — the chits, the notice board and the sign — because all three
       * were HTML floating over the room. All three are painted into the
       * scene now, so the projection maths, the Vector3 scratch and the
       * per-frame position state went with them, and what remains is one
       * number that decides which hint line sits at the bottom of the screen.
       */
      setTitle({ amount: r.titleProximity(), facing: r.facingBoard() });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (padTimer.current) window.clearTimeout(padTimer.current);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('click', onClick as EventListener);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      walkRef.current = null;
      r.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      roomRef.current = null;
    };
  }, [entries, rows, chart, profile.name, close, leaveTerminal]);

  // The switch on the wall. Kept out of the scene rebuild deliberately —
  // flicking the lights must never re-merge the geometry.
  useEffect(() => { roomRef.current?.setLit(lit); }, [lit]);


  /*
   * The room listens to the answer.
   *
   * Runs against the whole accumulated text on every chunk, which sounds
   * wasteful and is not: a hundred short regexes over two thousand characters
   * is microseconds, and the alternative — matching only the newest chunk —
   * misses every name that arrives split across a token boundary, which for
   * streamed text is most of the long ones.
   *
   * `sameSet` is what makes it cheap. The match is identical on nearly every
   * chunk, so acting only on change means the chart repaints and the doors
   * move once per new name rather than forty times per answer.
   */
  useEffect(() => {
    const match = buildMatcher(chart);
    let last = new Set<string>();

    const onStream = (e: Event) => {
      const text = (e as CustomEvent<string>).detail ?? '';
      const ids = match(text);
      if (sameSet(ids, last)) return;
      last = ids;
      roomRef.current?.setCited(ids);
      setCitedSlugs(
        chart.nodes
          .filter((n) => n.kind === 'project' && n.ref && ids.has(n.id))
          .map((n) => n.ref as string),
      );
    };

    window.addEventListener('askai:stream', onStream);
    return () => window.removeEventListener('askai:stream', onStream);
  }, [chart]);

  const citedNames = citedSlugs
    .map((slug) => projects.find((p) => p.slug === slug)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="locker-room fixed inset-0 bg-[var(--surface)]">
      <div ref={host} className="h-full w-full touch-none" />

      {/*
        The light switch. Same Verlet rope the homepage uses for the theme,
        which is the right kind of reuse — the gesture already means "turn the
        light on" to anyone who has been on the site for ten seconds. Hung on
        the left in here so it never fouls the writing pad, which comes in from
        the right on a wide screen.
      */}
      <PullCord
        pulled={!lit}
        onPull={() => setLit((v) => !v)}
        ariaLabel={lit ? 'Turn the lights off' : 'Turn the lights on'}
        className="lights-pullcord"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-[24px]">
        <Link
          to="/"
          className="locker-label pointer-events-auto text-white/45 transition-colors hover:text-white/80"
        >
          ← Leave
        </Link>
        <p className="locker-label text-white/30">
          {Math.round(depth * 100)}% · {projects.length} lockers
        </p>
      </div>

      {!open && !atTerminal && (
        <p className="locker-label pointer-events-none absolute inset-x-0 bottom-[26px] text-center text-white/30">
          {title.amount > 0.4
            ? 'Scroll to enter'
            : title.facing > 0.55
              ? 'Pick a note to get in touch'
              : 'Scroll to walk · open a locker · use the terminal at the counter'}
        </p>
      )}

      <WritingPad project={open} onClose={close} />

      {/*
        The terminal.

        TerminalChat, not AskAI.

        This panel reused the site's chat component for two passes, skinned
        green. It was the right instinct — one component, one endpoint — and
        it kept producing a web chat widget painted green, because the problem
        was the shape rather than the colour: a chat UI fills from the top and
        puts its controls in a panel, a terminal fills from the bottom and its
        prompt IS the last line of the scrollback. TerminalChat duplicates the
        ninety lines of fetch-and-stream and emits the same events, so the
        citation machinery upstairs does not know or care which client asked.

        Still DOM, and unapologetically. Everything else in this room was moved
        off HTML and into the scene because it was type on a surface — but a
        conversation needs a caret, a scrollback, selection, an IME and a
        keyboard. That is a user interface, not a label, and painting it into
        a texture would cost all of those to gain a perspective nobody asked
        for.
      */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-[12px] sm:p-[22px]"
        style={{
          opacity: atTerminal ? 1 : 0,
          visibility: atTerminal ? 'visible' : 'hidden',
          transition: 'opacity 420ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div
          /*
           * A monitor, not a dialog. It takes most of the viewport because
           * that is what sitting down at a terminal is — the previous 760px
           * box floated in the middle of the room with the answer scrolling
           * through a slot, which reads as a widget pasted over a 3D scene.
           * Capped in px as well as vw so it does not become a billboard on
           * an ultrawide.
           */
          className="terminal-screen pointer-events-auto relative flex w-full max-w-[1120px] flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface)]"
          style={{
            height: 'min(88vh, 880px)',
            boxShadow: 'var(--shadow-card), 0 0 110px rgba(127,214,168,0.14)',
            transform: atTerminal ? 'scale(1)' : 'scale(0.96)',
            transition: 'transform 420ms cubic-bezier(0.16,1,0.3,1)',
          }}
          data-lenis-prevent
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-[18px] py-[11px]">
            {/*
              The bar has to say what the machine is FOR.

              It read "KIT ROOM · TERMINAL", which names the furniture and not
              the function — a visitor who walked up to a green screen in a
              locker room had nothing telling them it would answer questions
              about a person. The fiction is worth keeping, so it stays as the
              dim right-hand half; the job goes first, in the bright colour,
              where it is read first.
            */}
            <p className="locker-num">
              <span style={{ color: 'var(--crt-hot)' }}>
                ASK ABOUT {profile.name.split(' ')[0].toUpperCase()}
              </span>
              <span className="hidden sm:inline" style={{ color: 'var(--crt-dim)' }}>
                {' '}· KIT ROOM TERMINAL
              </span>
            </p>
            <button
              type="button"
              onClick={leaveTerminal}
              className="locker-label text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              Step back (esc)
            </button>
          </div>
          {/*
            One scroller, inside TerminalChat, and nothing here.

            The version of this that reused AskAI had two: the component keeps
            its message list in its own `max-h-[46vh] overflow-y-auto`, and
            this wrapper added a second. On any conversation past a couple of
            turns both appeared at once, a centimetre apart, and a wheel
            gesture scrolled the inner one to its end and then silently handed
            the rest to the outer. Nested scroll containers are almost never
            intended; they are what you get when two components each solve
            overflow without knowing the other exists.
          */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {booted ? (
              <TerminalChat subject={profile.name.split(' ')[0]} />
            ) : (
              <TerminalBoot
                lockers={projects.length}
                nodes={chart.nodes.length}
                onDone={() => setBooted(true)}
              />
            )}
          </div>

          {/*
            What the answer opened.

            The reader is facing the counter with the corridor behind them, so
            the doors swinging and the map lighting up happen entirely out of
            shot. Yanking the camera round mid-answer would be worse than
            saying nothing — it drags them off the text they are reading. So
            the room reports what it did, and offers to take them there when
            they are ready. The consequence is immediate; only the view of it
            waits for permission.
          */}
          {booted && citedNames.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-[14px] gap-y-[8px] border-t border-[var(--hairline)] px-[18px] py-[11px]">
              <p className="locker-label text-[var(--text-muted)]">
                Opened {citedNames.length === 1 ? 'locker' : 'lockers'}:{' '}
                <span className="text-[var(--accent-text)]">{citedNames.join(' · ')}</span>
              </p>
              <button
                type="button"
                onClick={goToCited}
                className="locker-label ml-auto text-[var(--accent-text)] underline underline-offset-4 transition-opacity hover:opacity-70"
              >
                Step back and look →
              </button>
            </div>
          )}
        </div>
      </div>

      {/*
        The accessible and crawlable copy of the room. A canvas is opaque to
        screen readers and to anything without a GPU, so without this the
        archive is an empty div to a large share of what will ever look at it.
        Built from the same store the geometry is, so it cannot drift — and
        these are real buttons, which is what makes every locker openable from
        the keyboard.
      */}
      <nav className="sr-only" aria-label="Locker room contents">
        <h1>Archive — locker room</h1>
        <ul>
          {projects.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() => {
                  const r = roomRef.current;
                  const l = lockersRef.current.find((x) => x.slug === p.slug);
                  if (!r || !l) return;
                  r.setOpen(l.id);
                  r.setProgress(r.progressFor(l.id));
                  setOpenSlug(p.slug);
                }}
              >
                Open locker: {p.name}
              </button>
            </li>
          ))}
        </ul>
        <h2>Reach me</h2>
        <ul>
          {rows.map((row: ContactRow) => (
            <li key={row.label}>
              {row.label}: {row.value}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}