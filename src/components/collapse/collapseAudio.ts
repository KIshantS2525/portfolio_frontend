// src/components/collapse/collapseAudio.ts

/**
 * The sound of the collapse, synthesised.
 *
 * No files. The handover has slice 11 waiting on assets, and waiting was the
 * wrong call for what this needs: an earthquake, an impact, a grinding rise and
 * wind are noise and filters, which the Web Audio API makes out of thin air in
 * a few hundred lines — and nothing here has to be shipped, cached, licensed or
 * kept in sync with the visuals it accompanies. A recorded slam would also be a
 * fixed length; this one is generated to the beat it lands on.
 *
 * ── Everything hangs off one gate ──
 *
 * A single master gain, started at zero. Browsers refuse to run an AudioContext
 * that was not created inside a user gesture, so the context is built on the
 * button click and every later beat only opens and closes gains on it. That
 * also makes the exit trivial: fade the master and nothing is left playing over
 * a page that has gone back to being a page.
 *
 * ── Why it is quiet ──
 *
 * This starts without warning on a portfolio. Loud is the one thing it must not
 * be — the level is set so it reads as a rumble under the animation rather than
 * an autoplaying video, and MASTER is the single number to change if it needs to
 * be quieter still.
 */

/** Everything is scaled by this. Deliberately low. */
const MASTER = 0.34;

export type CollapseAudio = {
  /** The long low build while the sheet pulls away. */
  rumble: (intensity: number) => void;
  /** The impact. Call it on the frame the sheet lands. */
  slam: () => void;
  /** Stone grinding upward, for the rise. Fades itself out over `seconds`. */
  grind: (seconds: number) => void;
  /** Open-ground wind, for as long as the player is walking. */
  wind: (on: boolean) => void;
  /** Fades everything out and closes the context. */
  dispose: () => void;
};

export function createCollapseAudio(): CollapseAudio | null {
  type Ctor = typeof AudioContext;
  const Ctx: Ctor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctx) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);

  /*
   * One noise buffer, shared by everything.
   *
   * Four seconds of pink-ish noise, looped. Pink rather than white because white
   * noise is all hiss and reads as static; the low end is what makes filtered
   * noise sound like mass moving. Generating it once and reusing it for the
   * rumble, the wind and the grind costs one buffer instead of three.
   */
  const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  {
    const data = noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
  }

  function noiseSource(loop = true) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = loop;
    return src;
  }

  /* ── The rumble: noise under a low-pass, plus a sub-bass drone ── */

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0;
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 90;
  rumbleFilter.Q.value = 0.7;
  rumbleFilter.connect(rumbleGain).connect(master);
  const rumbleSrc = noiseSource();
  rumbleSrc.connect(rumbleFilter);

  const droneOsc = ctx.createOscillator();
  droneOsc.type = 'sine';
  droneOsc.frequency.value = 33;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneOsc.connect(droneGain).connect(master);

  /* ── Wind: noise through a band-pass that drifts, so it never sits still ── */

  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 480;
  windFilter.Q.value = 0.6;
  windFilter.connect(windGain).connect(master);
  const windSrc = noiseSource();
  windSrc.connect(windFilter);

  const windLfo = ctx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.07;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 260;
  windLfo.connect(windLfoGain).connect(windFilter.frequency);

  let started = false;
  function ensureStarted() {
    if (started) return;
    started = true;
    void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    rumbleSrc.start(t);
    windSrc.start(t);
    windLfo.start(t);
    droneOsc.start(t);
  }

  let disposed = false;

  return {
    rumble(intensity) {
      if (disposed) return;
      ensureStarted();
      const t = ctx.currentTime;
      const v = Math.max(0, Math.min(1, intensity));
      rumbleGain.gain.cancelScheduledValues(t);
      rumbleGain.gain.setTargetAtTime(v * 0.5, t, 0.35);
      droneGain.gain.setTargetAtTime(v * 0.22, t, 0.5);
      /* The filter opens as it builds: more of the noise gets through, so it grows in size, not just volume. */
      rumbleFilter.frequency.setTargetAtTime(70 + v * 220, t, 0.4);
    },

    slam() {
      if (disposed) return;
      ensureStarted();
      const t = ctx.currentTime;

      /*
       * Three things at once, which is what an impact is: a broadband crack for
       * the surface, a pitch-dropping sine for the mass behind it, and a tail of
       * filtered noise for the room. Any one alone sounds like a sound effect.
       */
      const crackSrc = noiseSource(false);
      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'lowpass';
      crackFilter.frequency.setValueAtTime(3200, t);
      crackFilter.frequency.exponentialRampToValueAtTime(220, t + 0.5);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.9, t);
      crackGain.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
      crackSrc.connect(crackFilter).connect(crackGain).connect(master);
      crackSrc.start(t);
      crackSrc.stop(t + 1.6);

      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(110, t);
      thump.frequency.exponentialRampToValueAtTime(24, t + 0.7);
      const thumpGain = ctx.createGain();
      thumpGain.gain.setValueAtTime(0.85, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
      thump.connect(thumpGain).connect(master);
      thump.start(t);
      thump.stop(t + 1.9);

      /* The rumble ducks and then settles: the earthquake is over, the dust is not. */
      rumbleGain.gain.cancelScheduledValues(t);
      rumbleGain.gain.setTargetAtTime(0.18, t, 0.6);
      droneGain.gain.setTargetAtTime(0.05, t, 0.8);
    },

    grind(seconds) {
      if (disposed) return;
      ensureStarted();
      const t = ctx.currentTime;
      const src = noiseSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, t);
      filter.frequency.linearRampToValueAtTime(420, t + seconds * 0.6);
      filter.frequency.linearRampToValueAtTime(120, t + seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
      src.connect(filter).connect(gain).connect(master);
      src.start(t);
      src.stop(t + seconds + 0.2);
      rumbleGain.gain.setTargetAtTime(0.3, t, 0.5);
      rumbleGain.gain.setTargetAtTime(0.08, t + seconds, 1.2);
    },

    wind(on) {
      if (disposed) return;
      ensureStarted();
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(on ? 0.16 : 0, t, on ? 2.5 : 0.6);
      if (on) {
        rumbleGain.gain.setTargetAtTime(0.05, t, 2);
        droneGain.gain.setTargetAtTime(0.03, t, 2);
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      const t = ctx.currentTime;
      /*
       * Faded, not cut. Stopping a context outright clicks, and a click is the
       * last thing the visitor hears as the page comes back.
       */
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0, t, 0.2);
      window.setTimeout(() => {
        try {
          rumbleSrc.stop();
          windSrc.stop();
          windLfo.stop();
          droneOsc.stop();
        } catch {
          /* Never started: nothing to stop. */
        }
        void ctx.close().catch(() => {});
      }, 900);
    },
  };
}