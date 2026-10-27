// src/components/figures/loop.ts
/**
 * The frame loop every Anatomy figure runs on: time-based (dt clamped to
 * 1/30s so a background tab never jumps), running only while the stage is on
 * screen and the tick says something is still moving, and calm under
 * prefers-reduced-motion — the tick gets `calm = true` and jumps to targets.
 */
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const stillness = reduced;

export function watch(stage: Element, tick: (dt: number, calm: boolean) => boolean) {
  let frame = 0;
  let last = 0;
  let visible = false;
  let stopped = false;

  const step = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const going = tick(dt, reduced());
    frame = visible && going && !stopped ? requestAnimationFrame(step) : 0;
  };
  const kick = () => {
    if (!frame && visible && !stopped) {
      last = 0;
      frame = requestAnimationFrame(step);
    }
  };
  // Read the newest entry: leave-and-return between two callbacks arrives as both, oldest first.
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) kick();
    },
    { rootMargin: '120px 0px' },
  );
  io.observe(stage);

  return {
    kick,
    stop() {
      stopped = true;
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
