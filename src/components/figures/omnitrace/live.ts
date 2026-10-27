// src/components/figures/omnitrace/live.ts
import { translateAlong } from '../iso/iso-kit';
import { MODEL } from './art.generated';
import { stillness, watch } from '../loop';

/**
 * The bench's motion, from its model.
 *
 * The carriage follows a target with exponential easing. While it is moving
 * the four plungers are held up (a real gauge head lifts before the part
 * indexes); once it stops they drop on springs onto whatever is under them —
 * a document block, a bare seat, the fixture or the carriage. The rule lamp is
 * a comparison of what the plunger reads with what the span asked for, the
 * same comparison the real rule makes between two recorded numbers.
 */
const { P, SPANS, SEAT_Y, FIX_W, DOC_W, CAR_TOP, FIX_TOP, DOC_TOP, TIP_R, LOWEST, RETRACT, START, REACH, RULE_COUNT, K } = MODEL;
const STOPS = SPANS.map((s) => -s.c); // carriage offsets that put each span under the head
const SNAP = 9;

/** What a tip at seat row `row` touches when the carriage sits at `x`. */
function heightUnder(x: number, row: number) {
  let top = CAR_TOP;
  for (const span of SPANS) {
    const c = span.c + x;
    if (Math.abs(c) <= FIX_W / 2 + TIP_R) {
      top = Math.max(top, FIX_TOP);
      if (span.got[row] && Math.abs(c) <= DOC_W / 2 + TIP_R) top = Math.max(top, DOC_TOP);
    }
  }
  return top;
}

/** The span sitting squarely under the head, or -1. */
const spanUnder = (x: number) => SPANS.findIndex((s) => Math.abs(s.c + x) < 1.2);

export function mount(stage: HTMLElement, readout: HTMLElement | null) {
  const svg = stage.querySelector('svg')!;
  const layer = svg.querySelector<SVGGElement>('[data-layer]')!;
  const carriage = svg.querySelector<SVGGElement>('[data-part="carriage"]')!;
  const fixtures = [...svg.querySelectorAll<SVGGElement>('[data-fixture]')];
  const plungerGroup = svg.querySelector<SVGGElement>('[data-part="plungers"]')!;
  const head = svg.querySelector<SVGGElement>('[data-part="head"]')!;
  const plungers = [...svg.querySelectorAll<SVGGElement>('[data-plunger]')];
  const lamp = svg.querySelector<SVGGElement>(`[data-lamp="${RULE_COUNT}"]`)!;
  const lampRing = lamp.querySelector('path')!;

  let x = START;
  let target = START;
  const tips = SEAT_Y.map(() => ({ at: DOC_TOP, rate: 0 }));
  let touring = true;
  let clock = 0;
  let idle = 0;
  let front = '';
  let said = '';

  const tourAt = (t: number) => STOPS[Math.floor(t / 3.4) % STOPS.length];

  /** Fixtures wholly in front of the plungers paint after them; the rest before. */
  function sort() {
    const key = fixtures.map((_, i) => (SPANS[i].c - FIX_W / 2 + x > TIP_R ? '1' : '0')).join('');
    if (key === front) return;
    front = key;
    const frag = document.createDocumentFragment();
    frag.append(carriage);
    fixtures.forEach((f, i) => key[i] === '0' && frag.append(f));
    frag.append(plungerGroup, head);
    fixtures.forEach((f, i) => key[i] === '1' && frag.append(f));
    layer.append(frag);
  }

  function describe() {
    const moving = Math.abs(target - x) > 0.3;
    const i = spanUnder(x);
    if (moving) return 'indexing · probes up';
    if (i < 0) return 'between spans';
    const got = SPANS[i].got.reduce((a, b) => a + b, 0);
    const settled = tips.every((t) => Math.abs(t.rate) < 2);
    if (!settled) return `span ${i + 1} · probing`;
    return got < K
      ? `span ${i + 1} · asked ${K}, got ${got} · rule 0${RULE_COUNT + 1} fires`
      : `span ${i + 1} · asked ${K}, got ${got} · clean`;
  }

  function draw() {
    const move = translateAlong(P, [x, 0, 0]);
    carriage.setAttribute('transform', move);
    fixtures.forEach((f) => f.setAttribute('transform', move));
    plungers.forEach((g, r) => g.setAttribute('transform', translateAlong(P, [0, 0, tips[r].at - LOWEST])));
    sort();

    const i = spanUnder(x);
    const firing = i >= 0 && SPANS[i].got.some((g, r) => !g && tips[r].at < FIX_TOP + 0.6);
    if (firing !== lamp.hasAttribute('data-on')) {
      lamp.toggleAttribute('data-on', firing);
      lampRing.setAttribute('data-tone', firing ? 'lit' : 'lo');
    }
    const text = describe();
    if (readout && readout.textContent !== text) readout.textContent = text;
    if (text !== said && !text.includes('ing')) {
      said = text;
      stage.setAttribute('aria-valuenow', String(Math.max(1, i + 1)));
      stage.setAttribute('aria-valuetext', text);
    }
  }

  const loop = watch(stage, (dt, calm) => {
    if (touring) {
      clock += dt;
      target = tourAt(clock);
    }
    x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / 0.32));
    if (Math.abs(target - x) < 0.01) x = target;
    const moving = Math.abs(target - x) > 0.3;
    let rest = true;
    tips.forEach((tip, r) => {
      const want = moving ? RETRACT : heightUnder(x, r);
      // A gauge plunger on its return spring: stiff, a touch under critical.
      const stiff = 340;
      const drag = calm ? 2 * Math.sqrt(stiff) : 30;
      for (let s = 0; s < 4; s++) {
        tip.rate += (((want - tip.at) * stiff - tip.rate * drag) * dt) / 4;
        tip.at += (tip.rate * dt) / 4;
      }
      tip.at = Math.max(LOWEST, tip.at);
      if (Math.abs(want - tip.at) < 0.004 && Math.abs(tip.rate) < 0.004) {
        tip.at = want;
        tip.rate = 0;
      } else rest = false;
    });
    draw();
    return touring || x !== target || !rest;
  });

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  function steer(next: number) {
    touring = false;
    const near = STOPS.find((s) => Math.abs(s - next) < SNAP);
    target = clamp(near ?? next, REACH[0], REACH[1]);
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      touring = !stillness();
      clock = STOPS.indexOf(target) >= 0 ? STOPS.indexOf(target) * 3.4 : 0;
      loop.kick();
    }, 3600);
    loop.kick();
  }

  const onMove = (e: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    const share = clamp(((e.clientX - box.left) / box.width - 0.2) / 0.6, 0, 1);
    steer(REACH[0] + share * (REACH[1] - REACH[0]));
  };
  const onKey = (e: KeyboardEvent) => {
    const here = STOPS.reduce((best, s, i) => (Math.abs(s - target) < Math.abs(STOPS[best] - target) ? i : best), 0);
    let to: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = Math.min(STOPS.length - 1, here + 1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = Math.max(0, here - 1);
    if (e.key === 'Home') to = 0;
    if (e.key === 'End') to = STOPS.length - 1;
    if (to === null) return;
    e.preventDefault();
    steer(STOPS[to]);
  };
  if (stillness()) touring = false;
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onMove);
  stage.addEventListener('keydown', onKey);
  draw();

  return () => {
    loop.stop();
    window.clearTimeout(idle);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onMove);
    stage.removeEventListener('keydown', onKey);
  };
}
