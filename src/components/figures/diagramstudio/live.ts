// src/components/figures/diagramstudio/live.ts
import { lineOnTop, slabOf, solidSvg, translateAlong } from '../iso/iso-kit';
import { MODEL } from './art.generated';
import { stillness, watch } from '../loop';

/**
 * The reader's motion, from its model.
 *
 * `s` is how many lines of tape have passed the reader (0 … 8). Everything on
 * the board is computed from `s` alone — which nodes stand, which edges are
 * drawn — so the canvas is a pure function of the text read so far, the way
 * DiagramStudio rebuilds its AST, layout and canvas from the DSL. Winding the
 * tape back is the same function at a smaller `s`.
 */
const { P, NODES, LINES, ROW, HOLE_R, NODE_AT, NODE, NODE_H, BOARD_TOP, CAP, CAP_R, CAP_Z, LIFT } = MODEL;
const END = LINES.length;

/** The document read up to `s`: which nodes and edges exist. */
function parse(s: number) {
  const nodes = new Set<number>();
  const edges = new Set<string>();
  let last = -1;
  LINES.forEach((line, i) => {
    if (i + 0.8 > s) return; // read as the row arrives under the pins
    last = i;
    if (line.holes.length === 1) nodes.add(line.holes[0]);
    // An edge only resolves between nodes that already exist — the resolver's rule.
    else if (line.holes.every((h) => nodes.has(h))) edges.add(line.holes.join('-'));
  });
  return { nodes, edges, last };
}

export function mount(stage: HTMLElement, readout: HTMLElement | null) {
  const svg = stage.querySelector('svg')!;
  const holes = svg.querySelector<SVGGElement>('[data-part="holes"]')!;
  const pins = [...svg.querySelectorAll<SVGGElement>('[data-pin]')];
  const tells = [...svg.querySelectorAll<SVGPathElement>('[data-tell]')];
  const nodes = [...svg.querySelectorAll<SVGGElement>('[data-node]')];
  const edges = [...svg.querySelectorAll<SVGGElement>('[data-edge]')];
  const capstan = svg.querySelector<SVGPathElement>('[data-part="capstan"]')!;

  // Open on the finished diagram; the tour then winds back and reads it again.
  let s = END;
  let target = END;
  let touring = true;
  let clock = END * 1.1;
  let idle = 0;
  const height = NODE_AT.map(() => ({ at: NODE_H, rate: 0 }));
  const pinAt = pins.map(() => LIFT);
  let said = '';

  // Tour: read one line every 1.1s, rest on the finished diagram, wind back.
  const tourAt = (t: number) => {
    const cycle = END * 1.1 + 2.4 + 1.6;
    const u = t % cycle;
    if (u < END * 1.1) return Math.min(END, Math.floor(u / 1.1) + 1);
    if (u < END * 1.1 + 2.4) return END;
    return 0;
  };

  function draw() {
    // Tape: row i sits under the pins when s = i + 1, and the capstan turns with it.
    const offset = s * ROW;
    holes.setAttribute('transform', translateAlong(P, [offset, 0, 0]));
    capstan.setAttribute('d', lineOnTop([CAP[0], CAP[1]], [CAP[0] + Math.cos(-offset / CAP_R) * (CAP_R - 1.4), CAP[1] + Math.sin(-offset / CAP_R) * (CAP_R - 1.4)], CAP_Z + 7, P));
    pins.forEach((g, t) => {
      g.setAttribute('transform', translateAlong(P, [0, 0, pinAt[t]]));
      tells[t].toggleAttribute('data-on', pinAt[t] < LIFT * 0.4);
    });
    const doc = parse(s);
    const lastLine = LINES[doc.last];
    const fresh = lastLine && lastLine.holes.length === 1 ? lastLine.holes[0] : -1;
    nodes.forEach((g, i) => {
      const h = height[i].at;
      if (h < 0.05) {
        if (g.childElementCount) g.replaceChildren();
        return;
      }
      const [x, y] = NODE_AT[i];
      g.innerHTML = solidSvg(slabOf({ x: x - NODE.w / 2, y: y - NODE.d / 2, w: NODE.w, d: NODE.d, r: 1.2 }, BOARD_TOP, h, P, 3, 0.5), {
        tone: 'hi',
        crease: 'lo',
        lit: i === fresh, // the node the reader has just declared
      });
    });
  }

  function report() {
    const doc = parse(s);
    const line = doc.last >= 0 ? `line ${doc.last + 1} · ${LINES[doc.last].text}` : 'line 0 · empty';
    const text = `${line} · ${doc.nodes.size}n ${doc.edges.size}e`;
    if (readout && readout.textContent !== text) readout.textContent = text;
    edges.forEach((g) => g.toggleAttribute('data-on', doc.edges.has(g.dataset.edge!)));
    if (text !== said) {
      said = text;
      stage.setAttribute('aria-valuenow', String(doc.last + 1));
      stage.setAttribute('aria-valuetext', `${line}. ${doc.nodes.size} nodes: ${[...doc.nodes].map((n) => NODES[n]).join(', ') || 'none'}; ${doc.edges.size} edges.`);
    }
  }

  const loop = watch(stage, (dt, calm) => {
    if (touring) {
      clock += dt;
      target = tourAt(clock);
    }
    // Winding back is quicker than reading forward.
    const tau = target < s - 1 ? 0.22 : 0.3;
    s = calm ? target : s + (target - s) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - s) < 0.002) s = target;
    let moving = s !== target;

    const doc = parse(s);
    // A pin drops when a hole on its track is under it.
    pinAt.forEach((z, t) => {
      const overHole = LINES.some((line, i) => line.holes.includes(t) && Math.abs((s - i - 1) * ROW) < HOLE_R - 0.6);
      const want = overHole ? 0 : LIFT;
      const n = calm ? want : z + (want - z) * (1 - Math.exp(-dt / 0.05));
      pinAt[t] = Math.abs(n - want) < 0.01 ? want : n;
      if (pinAt[t] !== want) moving = true;
    });
    height.forEach((h, i) => {
      const want = doc.nodes.has(i) ? NODE_H : 0;
      const stiff = 160;
      const drag = calm ? 2 * Math.sqrt(stiff) : 19;
      for (let n = 0; n < 4; n++) {
        h.rate += (((want - h.at) * stiff - h.rate * drag) * dt) / 4;
        h.at += (h.rate * dt) / 4;
      }
      h.at = Math.max(0, h.at);
      if (Math.abs(want - h.at) < 0.004 && Math.abs(h.rate) < 0.004) {
        h.at = want;
        h.rate = 0;
      } else moving = true;
    });
    draw();
    report();
    return touring || moving;
  });

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  function steer(next: number) {
    touring = false;
    target = clamp(next, 0, END);
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      touring = !stillness();
      clock = target * 1.1;
      loop.kick();
    }, 3600);
    loop.kick();
  }
  const onMove = (e: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    const share = clamp(((e.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1);
    // Land on whole lines: a reader stops between rows, not halfway through one.
    steer(Math.round(share * END));
  };
  const onKey = (e: KeyboardEvent) => {
    let to: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = Math.round(target) + 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = Math.round(target) - 1;
    if (e.key === 'Home') to = 0;
    if (e.key === 'End') to = END;
    if (to === null) return;
    e.preventDefault();
    steer(to);
  };
  if (stillness()) {
    touring = false;
    target = END;
  }
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onMove);
  stage.addEventListener('keydown', onKey);
  draw();
  report();
  loop.kick();

  return () => {
    loop.stop();
    window.clearTimeout(idle);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onMove);
    stage.removeEventListener('keydown', onKey);
  };
}
