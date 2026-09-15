// src/components/game/audio.ts

/**
 * Sound, synthesised rather than shipped.
 *
 * Every sound here is generated from noise buffers and oscillators at
 * runtime. That's a deliberate choice over sampling: audio files would be
 * hundreds of kilobytes on a route that currently costs ~30KB gzipped, and
 * any Minecraft-like sample pack you find online is Mojang's audio. Filtered
 * noise makes a convincing wind and a convincing footstep, and a pair of
 * detuned oscillators makes a passable bird.
 *
 * Nothing starts until the player clicks to enter, because browsers suspend
 * an AudioContext created without a gesture — and rightly so.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private nightGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private birdTimer = 0;
  private cricketTimer = 0;
  private stepTimer = 0;
  private started = false;
  muted = false;
  /** True while the game is paused (pointer unlocked, dead, or off-screen) — every sound is gated on this too. */
  private paused = false;

  /** Must be called from a user gesture (the click that locks the pointer). */
  start() {
    if (this.started) return;
    type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
    if (!Ctor) return;
    this.started = true;

    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(ctx.destination);

    // One second of white noise, looped. Reused by wind, footsteps and hits —
    // a single buffer rather than one per sound.
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // Wind: looped noise through a lowpass, with the cutoff wandering so it
    // breathes instead of hissing at one pitch.
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.10;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    lfo.start();

    // A low drone that only comes up at night, for the "something changed" cue.
    this.nightGain = ctx.createGain();
    this.nightGain.gain.value = 0;
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 58;
    const droneShape = ctx.createGain();
    droneShape.gain.value = 0.16;
    drone.connect(droneShape).connect(this.nightGain).connect(this.master);
    drone.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  /**
   * Suspends (or resumes) the whole AudioContext. Nothing here previously
   * reacted to the game being paused — stepping out with Esc, dying, or the
   * tab losing the pointer lock all left the wind, drone, footsteps and
   * ambience running exactly as if play had never stopped. `suspend()` stops
   * *all* audio processing (cheap and instant), not just gain-to-zero, which
   * also stops the CPU work of running the graph while nothing is meant to
   * be audible.
   */
  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    if (!this.ctx) return;
    if (p) void this.ctx.suspend();
    else if (!this.muted) void this.ctx.resume();
  }

  private env(node: AudioNode, gain: GainNode, attack: number, decay: number, peak: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    void node;
  }

  /** A short filtered-noise burst — the basis for footsteps and impacts. */
  private burst(freq: number, q: number, attack: number, decay: number, peak: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.master || this.muted || this.paused) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    src.connect(filt).connect(g).connect(this.master);
    this.env(src, g, attack, decay, peak);
    src.start();
    src.stop(ctx.currentTime + attack + decay + 0.02);
  }

  /** A short pitched blip — birds, crickets, UI. */
  private tone(freq: number, dur: number, peak: number, type: OscillatorType = 'sine', slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.paused) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(t + dur + 0.02);
  }

  footstep(inWater: boolean) {
    if (inWater) this.burst(700, 0.7, 0.005, 0.16, 0.12, 'lowpass');
    else this.burst(240 + Math.random() * 120, 1.4, 0.004, 0.09, 0.14);
  }

  mine() { this.burst(320 + Math.random() * 80, 2.0, 0.003, 0.07, 0.16); }
  place() { this.burst(180, 1.2, 0.003, 0.10, 0.18, 'lowpass'); }
  hit() { this.burst(520, 0.9, 0.002, 0.13, 0.22); }
  hurt() { this.tone(300, 0.22, 0.2, 'square', 140); }
  pickup() { this.tone(880, 0.09, 0.10, 'triangle', 1320); }
  open() { this.tone(420, 0.16, 0.10, 'triangle', 620); }

  /**
   * Ambience. Birds by day, crickets by night, wind always, drone at night.
   * Called every frame; the timers keep the calls sparse.
   */
  update(dt: number, nightFactor: number, moving: boolean, inWater: boolean) {
    if (!this.ctx || this.muted || this.paused) return;
    if (this.nightGain) this.nightGain.gain.value = nightFactor * 0.55;
    if (this.windGain) this.windGain.gain.value = 0.07 + nightFactor * 0.07;

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.6 + Math.random() * 4.5;
      if (nightFactor < 0.35) {
        // Two or three quick chirps, slightly different each time.
        const base = 1700 + Math.random() * 900;
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          window.setTimeout(() => this.tone(base * (1 + i * 0.06), 0.07, 0.035, 'sine', base * 1.35), i * 95);
        }
      }
    }

    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 0.28 + Math.random() * 0.5;
      if (nightFactor > 0.55) this.tone(2400 + Math.random() * 300, 0.035, 0.018, 'triangle');
    }

    if (moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.42;
        this.footstep(inWater);
      }
    } else {
      this.stepTimer = 0;
    }
  }

  dispose() {
    this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
