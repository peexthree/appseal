/**
 * Sound effects for the 404 cyber-bug easter egg. Real recorded SFX (mp3 in
 * /sound/) for hits and the death splat, plus a synthesized robo-squeak for
 * panic as fallback/keep. Files are fetched and decoded through an
 * OfflineAudioContext on mount - decoding needs no user gesture, so the
 * buffers are ready by the first click (autoplay policies only gate audible
 * playback, which happens through the lazily-unlocked real AudioContext).
 * If a file fails to load the synthesized voice covers it - the game never
 * breaks audibly. Hit sounds rotate round-robin so repeated smacking stays
 * interesting instead of hammering one sample.
 */

const SOUND_BASE = "/sound/";

const HIT_SOUNDS = [
  "freesound_community-accidentally-punching-the-floor-99814.mp3",
  "homemade_sfx-slap-hurt-pain-sound-effect-262618.mp3",
  "freesound_community-ough-47202.mp3",
  "freesound_community-homemadeoof-47509.mp3",
];

const SPLAT_SOUND = "freesound_community-splash-death-splash-46048.mp3";

const STORAGE_KEY = "appseal-sfx";

export type SfxName = "panic" | "hit" | "splat";

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private on = true;
  private hitBuffers: AudioBuffer[] = [];
  private splatBuffer: AudioBuffer | null = null;
  private hitIdx = 0;
  private loading = false;
  private loaded = false;

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

  /**
   * Fetch + decode the mp3 set. Safe to call before any gesture (offline
   * decoding makes no sound); idempotent and fail-soft per file.
   */
  preload(): void {
    if (this.loaded || this.loading || typeof window === "undefined") return;
    const OfflineCtor: typeof OfflineAudioContext | undefined =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OfflineCtor) return;
    this.loading = true;
    // 1-sample offline context exists purely to host decodeAudioData
    const offline = new OfflineCtor(1, 1, 44100);
    const decode = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(SOUND_BASE + url);
        if (!res.ok) return null;
        const raw = await res.arrayBuffer();
        return await offline.decodeAudioData(raw);
      } catch {
        return null;
      }
    };
    void Promise.all([...HIT_SOUNDS.map(decode), decode(SPLAT_SOUND)]).then((all) => {
      this.hitBuffers = all.slice(0, HIT_SOUNDS.length).filter((b): b is AudioBuffer => !!b);
      this.splatBuffer = all[all.length - 1];
      this.loaded = true;
    });
  }

  /** Create/resume the audible context - call only from a user gesture handler. */
  unlock(): void {
    this.preload();
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
    this.hitBuffers = [];
    this.splatBuffer = null;
    this.loaded = false;
    this.loading = false;
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private playBuffer(buffer: AudioBuffer, gain: number, rate = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g).connect(this.master!);
    src.start();
  }

  /** Recorded hit from the rotation pool, slight pitch jitter for life. */
  private hit(): void {
    if (this.hitBuffers.length > 0) {
      const buf = this.hitBuffers[this.hitIdx % this.hitBuffers.length];
      this.hitIdx += 1;
      this.playBuffer(buf, 0.5, 0.96 + Math.random() * 0.08);
      return;
    }
    // fallback: dull metallic knock on chitin
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

  /** Recorded death splash; the boss pops deeper and slower. */
  private splat(boss: boolean): void {
    if (this.splatBuffer) {
      this.playBuffer(this.splatBuffer, boss ? 0.9 : 0.75, boss ? 0.82 : 1);
      return;
    }
    // fallback: two-layer synth - sub "chpok" + acid hiss
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

  /** Robo-squeak: sawtooth sweeping up then collapsing, ~0.25s (kept synth). */
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
}
