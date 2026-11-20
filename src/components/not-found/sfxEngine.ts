/**
 * Synthesized sound effects for the 404 cyber-bug easter egg. Zero audio
 * files - everything is Web Audio API oscillators + one procedural noise
 * buffer. The AudioContext is created lazily inside the first pointerdown
 * (autoplay policies on Safari/Chrome), never at module import, and is
 * closed on unmount. Kept deliberately quiet: accent, not assault.
 */

const STORAGE_KEY = "appseal-sfx";

export type SfxName = "panic" | "hit" | "splat";

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private on = true;

  constructor() {
    // default ON, remembered toggle; storage may be unavailable in private mode
    try {
      this.on = localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      this.on = true;
    }
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(value: boolean): void {
    this.on = value;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 1 : 0, this.ctx.currentTime, 0.01);
    }
    try {
      localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      /* private mode */
    }
  }

  /** Create/resume the context - call only from a user gesture handler. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.on ? 1 : 0;
        this.master.connect(this.ctx.destination);
        this.noise = this.buildNoise(this.ctx);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* audio unavailable - the game stays fully playable silently */
      this.ctx = null;
      this.master = null;
    }
  }

  play(name: SfxName, boss = false): void {
    if (!this.ctx || !this.master || !this.on) return;
    try {
      if (name === "panic") this.panic(boss);
      else if (name === "hit") this.hit();
      else this.splat(boss);
    } catch {
      /* never let audio break the game loop */
    }
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Robo-squeak: sawtooth sweeping up then collapsing, ~0.25s. */
  private panic(boss: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    const base = boss ? 150 : 300;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(boss ? 640 : 920, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(boss ? 110 : 160, t + 0.24);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  /** Dull metallic knock on chitin: triangle dropping fast, ~0.13s. */
  private hit(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.11);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** Two-layer splat: juicy sub "chpok" down to ~32Hz + acid hiss (bandpass noise). */
  private splat(boss: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = boss ? 0.45 : 0.35;

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(boss ? 140 : 160, t);
    thump.frequency.exponentialRampToValueAtTime(boss ? 26 : 32, t + dur);
    thumpGain.gain.setValueAtTime(0.0001, t);
    thumpGain.gain.exponentialRampToValueAtTime(boss ? 0.34 : 0.28, t + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    thump.connect(thumpGain).connect(this.master!);
    thump.start(t);
    thump.stop(t + dur + 0.05);

    if (!this.noise) return;
    const hiss = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const hissGain = ctx.createGain();
    hiss.buffer = this.noise;
    band.type = "bandpass";
    band.frequency.setValueAtTime(boss ? 700 : 950, t);
    band.frequency.exponentialRampToValueAtTime(280, t + dur);
    band.Q.value = 1.1;
    hissGain.gain.setValueAtTime(0.0001, t);
    hissGain.gain.exponentialRampToValueAtTime(boss ? 0.2 : 0.15, t + 0.02);
    hissGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    hiss.connect(band).connect(hissGain).connect(this.master!);
    hiss.start(t);
    hiss.stop(t + dur + 0.05);
  }
}
