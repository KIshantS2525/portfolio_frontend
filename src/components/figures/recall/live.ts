// src/components/figures/recall/live.ts
import { slabOf, solidSvg, translateAlong } from '../iso/iso-kit';
import { MODEL } from './art.generated';
import { stillness, watch } from '../loop';

/**
 * The drawer's motion, from its model.
 *
 * The query is a point along the pointer's travel between three preset
 * queries, quantized per dimension to the same integer levels the cards are
 * stored at (Recall stored int8; the drawing uses six levels). Every frame the
 * whole table is compared with it at once — squared L2, then the k smallest —
 * exactly the vectorised pass Recall runs in NumPy. The k nearest cards rise
 * on springs; the rest settle back into the drawer.
 */
const { P, ROWS, QUERIES, TOP_K, LIFT, Z0, CARD_H, CARD_T, TAB_D, TAB_UNIT, TAB_Y, HOLDER_X } = MODEL;

const quantize = (t: number) => {
  const i = Math.min(QUERIES.length - 2, Math.floor(t));
  const f = t - i;
  return QUERIES[i].map((v, d) => Math.round(v + (QUERIES[i + 1][d] - v) * f));
};
const dist2 = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, d) => s + (v - b[d]) ** 2, 0);

/** np.sum((mat - q) ** 2, axis=1), then argsort[:k]. Ties keep row order, as argsort's stable kind does. */
function search(q: number[]) {
  const d = ROWS.map((row) => dist2(row, q));
  const order = d.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { d, top: order.slice(0, TOP_K).map(([, i]) => i) };
}

export function mount(stage: HTMLElement, readout: HTMLElement | null) {
  const svg = stage.querySelector('svg')!;
  const cards = [...svg.querySelectorAll<SVGGElement>('[data-card]')];
  const queryTabs = svg.querySelector<SVGGElement>('[data-part="query"] [data-tabs]')!;

  let t = 0;
  let target = 0;
  let touring = true;
  let clock = 0;
  let idle = 0;
  const lift = ROWS.map(() => ({ at: 0, rate: 0 }));
  const shown = QUERIES[0].map((v) => v); // the query tab heights as drawn, eased
  let q = quantize(0);
  let result = search(q);
  let said = '';

  const tourAt = (time: number) => Math.floor(time / 3.2) % QUERIES.length;

  function drawQuery() {
    queryTabs.innerHTML = shown
      .map((v, i) =>
        solidSvg(slabOf({ x: HOLDER_X - CARD_T / 2, y: TAB_Y[i], w: CARD_T, d: TAB_D, r: 0.5 }, Z0 + CARD_H, Math.max(0.3, v * TAB_UNIT), P, 2), {
          tone: 'hi',
          crease: 'lo',
          lit: true,
        }),
      )
      .join('');
  }

  function draw() {
    cards.forEach((g, i) => {
      g.toggleAttribute('data-top', result.top.includes(i));
      const z = lift[i].at;
      if (z < 0.01) g.removeAttribute('transform');
      else g.setAttribute('transform', translateAlong(P, [0, 0, z]));
    });
    const text = `top ${TOP_K} of ${ROWS.length} · ` + result.top.map((i) => `#${i + 1}`).join(' ') + ` · d² ` + result.top.map((i) => result.d[i]).join(' ');
    if (readout && readout.textContent !== text) readout.textContent = text;
    if (text !== said) {
      said = text;
      stage.setAttribute('aria-valuenow', String(Math.round(t) + 1));
      stage.setAttribute('aria-valuetext', `Query ${q.join(', ')}: nearest rows ${result.top.map((i) => i + 1).join(', ')}`);
    }
  }

  const loop = watch(stage, (dt, calm) => {
    if (touring) {
      clock += dt;
      target = tourAt(clock);
    }
    t = calm ? target : t + (target - t) * (1 - Math.exp(-dt / 0.35));
    if (Math.abs(target - t) < 0.002) t = target;

    const next = quantize(t);
    if (next.join() !== q.join()) {
      q = next;
      result = search(q);
    }
    let moving = t !== target;
    let tabsMoved = false;
    shown.forEach((v, i) => {
      const n = calm ? q[i] : v + (q[i] - v) * (1 - Math.exp(-dt / 0.12));
      shown[i] = Math.abs(n - q[i]) < 0.005 ? q[i] : n;
      if (shown[i] !== v) tabsMoved = true;
      if (shown[i] !== q[i]) moving = true;
    });
    if (tabsMoved) drawQuery();

    lift.forEach((s, i) => {
      const want = result.top.includes(i) ? LIFT : 0;
      const stiff = 120;
      const drag = calm ? 2 * Math.sqrt(stiff) : 17;
      for (let n = 0; n < 4; n++) {
        s.rate += (((want - s.at) * stiff - s.rate * drag) * dt) / 4;
        s.at += (s.rate * dt) / 4;
      }
      s.at = Math.max(0, s.at);
      if (Math.abs(want - s.at) < 0.004 && Math.abs(s.rate) < 0.004) {
        s.at = want;
        s.rate = 0;
      } else moving = true;
    });
    draw();
    return touring || moving;
  });

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  function steer(next: number) {
    touring = false;
    target = clamp(next, 0, QUERIES.length - 1);
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      touring = !stillness();
      clock = Math.round(target) * 3.2;
      loop.kick();
    }, 3600);
    loop.kick();
  }
  const onMove = (e: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    const share = clamp(((e.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1);
    steer(share * (QUERIES.length - 1));
  };
  const onKey = (e: KeyboardEvent) => {
    const here = Math.round(target);
    let to: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = Math.min(QUERIES.length - 1, here + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = Math.max(0, here - 1);
    if (e.key === 'Home') to = 0;
    if (e.key === 'End') to = QUERIES.length - 1;
    if (to === null) return;
    e.preventDefault();
    steer(to);
  };
  if (stillness()) touring = false;
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onMove);
  stage.addEventListener('keydown', onKey);
  draw();
  loop.kick();

  return () => {
    loop.stop();
    window.clearTimeout(idle);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onMove);
    stage.removeEventListener('keydown', onKey);
  };
}
