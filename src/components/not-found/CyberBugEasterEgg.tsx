"use client";

import { useEffect, useRef, useState } from "react";
import { CyberBugSvg } from "./CyberBugSvg";
import { SfxEngine } from "./sfxEngine";
import {
  A11Y_SUFFIX,
  BALANCE,
  BITE_PHRASES,
  BUG_TYPES,
  CODE_FRAGMENTS,
  FX_BY_TYPE,
  FX_NORMAL,
  GAMEOVER,
  HUNT_CLOUD,
  HUD_LABELS,
  POWERUP_TOAST,
  POWERUPS,
  SHIELD_BLOCK_PHRASE,
  SWARM_ANNOUNCE,
  SWARM_BITE_DIST,
  SWARM_CHARGED,
  SWARM_ROACH_HIT_R,
  SWARM_ROACH_SPEED,
  SWARM_ROACH_SPEED_CHARGED,
  SWARM_SIZE,
  SWARM_VICTORY,
  WORLD_RECORD_PHRASE,
  SKIN_UNLOCK_LABEL,
  TOTAL_KEY,
  TYPE_NAMES,
  UNLOCKS_KEY,
  WAVE_ANNOUNCE,
  biteAfterFor,
  cardSpawnPose,
  clampToast,
  headingToRotation,
  hitSizeFor,
  hpForType,
  killPhraseFor,
  panicBounds,
  panicCloud,
  particleCount,
  pickPowerup,
  pickType,
  rageCloud,
  respawnGapFor,
  skinFor,
  splashCount,
  turnToward,
  typeSpeedFor,
  walkCycleFor,
  wanderTarget,
  waveFor,
  type BugType,
  type FxPalette,
  type ParticleKind,
  type PowerupKind,
  type Roach,
} from "./constants";
import { ymGoal } from "@/components/yandex-metrika";
import { useLang } from "@/lib/use-lang";

/**
 * Interactive easter egg for the 404: a cyber-bug with a splat-the-bug
 * arcade loop. The 404 page itself must stay fully static (no headers(),
 * no dynamic APIs - see app/not-found.tsx), so this component renders a
 * neutral SSR shell and does all measurement/positioning in effects; the
 * game loop mutates only refs and DOM (zero re-renders per frame).
 */

type BugMode = "idle" | "panic" | "peek" | "respawn" | "dying" | "hunt";

interface BugState {
  mode: BugMode;
  x: number;
  y: number;
  tx: number;
  ty: number;
  heading: number;
  hp: number;
  maxHp: number;
  boss: boolean;
  type: BugType;
  hits: number;
  /** boss blink-dash armed flag (the SVG rig shows full rage at last HP) */
  raged: boolean;
  turnAt: number;
  trailAt: number;
  /** next idle-stroll timestamp (ms); the tick() wander branch reads this */
  wanderAt: number;
  /** next ghost-teleport / lightning-hop timestamp (ms) */
  abilityAt: number;
  /** patience deadline: past it the bug hunts the 404 card for a bite */
  biteAt: number;
  kills: number;
}

interface Particle {
  kind: ParticleKind;
  /** fx palette captured at spawn so mid-flight recolors stay impossible */
  pal: FxPalette;
  /** code-fragment glyph, picked once at spawn (per-frame rerolls strobe) */
  char?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  age: number;
}

interface Splat {
  x: number;
  y: number;
  drops: { dx: number; dy: number; r: number }[];
  chips: { dx: number; dy: number; rot: number; s: number }[];
  /** pre-rendered stain: one drawImage per frame instead of ~40 path fills */
  sprite: HTMLCanvasElement | null;
  /** logical sprite size (sprite is centered and drawn square) */
  size: number;
  born: number;
  life: number;
  pal: FxPalette;
}

interface Ripple {
  x: number;
  y: number;
  r0: number;
  r1: number;
  born: number;
  life: number;
  pal: FxPalette;
}

interface BugView {
  boss: boolean;
  type: BugType;
  hp: number;
  maxHp: number;
  legs: "idle" | "step" | "panic";
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** logical sprite size for a pre-rendered splat stain (34px drop offset + 15px radius + chips) */
const SPLAT_SPRITE = 128;

const BEST_KEY = "appseal-bug-best";
// TOTAL_KEY / UNLOCKS_KEY live in constants.ts (lifetime progress + skins)

/**
 * Paints one splat stain (drops + gloss + embedded chips) centered at the
 * origin. Used both for the per-stain offscreen sprite (hot path) and as the
 * vector fallback in renderFx when sprite construction is unavailable.
 */
const drawSplatPaint = (
  ctx: CanvasRenderingContext2D,
  drops: { dx: number; dy: number; r: number }[],
  chips: { dx: number; dy: number; rot: number; s: number }[],
  pal: FxPalette,
) => {
  for (const d of drops) {
    ctx.fillStyle = pal.meat;
    ctx.beginPath();
    ctx.arc(d.dx, d.dy, d.r, 0, Math.PI * 2);
    ctx.fill();
    // gloss highlight
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(d.dx - d.r * 0.28, d.dy - d.r * 0.3, d.r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of chips) {
    ctx.save();
    ctx.translate(c.dx, c.dy);
    ctx.rotate(c.rot);
    ctx.fillStyle = pal.chipBody;
    ctx.fillRect(-c.s / 2, -c.s / 2.6, c.s, c.s / 1.3);
    ctx.strokeStyle = pal.chipPin;
    ctx.lineWidth = 1;
    ctx.strokeRect(-c.s / 2, -c.s / 2.6, c.s, c.s / 1.3);
    ctx.beginPath();
    ctx.moveTo(-c.s / 2 + 2, -c.s / 2.6 - 3);
    ctx.lineTo(-c.s / 2 + 2, -c.s / 2.6);
    ctx.moveTo(c.s / 2 - 2, -c.s / 2.6 - 3);
    ctx.lineTo(c.s / 2 - 2, -c.s / 2.6);
    ctx.stroke();
    ctx.restore();
  }
};

/** Paranoia spawn if the 404 card is somehow missing: a free roam point. */
const fallbackPose = (v: { w: number; h: number }) => {
  const b = panicBounds(v);
  const x = rand(b.minX, b.maxX);
  const y = rand(b.minY, b.maxY);
  return { x, y, tx: x, ty: y, heading: rand(0, Math.PI * 2) };
};

export function CyberBugEasterEgg() {
  const lang = useLang();
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const [view, setView] = useState<BugView>({ boss: false, type: "normal", hp: 3, maxHp: 3, legs: "idle" });
  // HUD is visible from the first paint: the visitor sees the reward system
  // before the first splat; total/best fill in from localStorage on mount
  const [hud, setHud] = useState({ kills: 0, best: 0, total: 0, wave: 1, lives: 3, shield: false, sfxOn: true });
  // game over: the bugs ate the page through all 404 lives
  const [gameOver, setGameOver] = useState(false);
  // touch device -> bigger hitbox + slower panic (set once on mount)
  const [isTouch, setIsTouch] = useState(false);
  // aria-live mirror of the last kill toast (DOM toasts are silent to SRs)
  const [live, setLive] = useState("");
  // unlocked carapace skin color; the boss always stays crimson
  const [skinColor, setSkinColor] = useState("");

  const bugEl = useRef<HTMLDivElement>(null);
  const bugRot = useRef<HTMLDivElement>(null);
  const hitbox = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const phraseLayer = useRef<HTMLDivElement>(null);
  const toastLayer = useRef<HTMLDivElement>(null);
  const svgFlash = useRef<HTMLDivElement>(null);
  const bossFlashEl = useRef<HTMLDivElement>(null);
  const freezeEl = useRef<HTMLDivElement>(null);
  const redEl = useRef<HTMLDivElement>(null);
  const dropLayer = useRef<HTMLDivElement>(null);

  const st = useRef<BugState>({
    mode: "idle",
    x: -200,
    y: -200,
    tx: 0,
    ty: 0,
    heading: 0,
    hp: 3,
    maxHp: 3,
    boss: false,
    type: "normal",
    hits: 0,
    raged: false,
    turnAt: 0,
    trailAt: 0,
    wanderAt: 0,
    abilityAt: 0,
    biteAt: 0,
    kills: 0,
  });
  const vp = useRef({ w: 0, h: 0 });
  const cardRect = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const reduced = useRef(false);
  const coarse = useRef(false);
  const engine = useRef<SfxEngine | null>(null);
  const raf = useRef(0);
  const last = useRef(0);
  const dead = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const lastRandom = useRef(-1);
  const lastBossRandom = useRef(-1);
  const toastCount = useRef(0);
  const codeFont = useRef("10px ui-monospace, monospace");
  const best = useRef(0);
  /** lifetime kills across visits (localStorage TOTAL_KEY) */
  const total = useRef(0);
  /** normal-tier palette tinted with the unlocked skin (typed bugs keep theirs) */
  const skinPal = useRef<FxPalette | null>(null);
  /** splitter death chain: pending spawnling respawns before the next bug */
  const chain = useRef(0);
  /** current wave (1-based, +1 per 10 kills) */
  const wave = useRef(1);
  /** the three 404 lives - a bite steals one, at zero the game ends */
  const lives = useRef(3);
  /** shield power-up: absorbs one bite */
  const shield = useRef(false);
  /** freeze power-up: every bug slows to a crawl until this timestamp */
  const frozenUntil = useRef(0);
  /** boss-swarm roaches (canvas-drawn); empty board = no swarm */
  const roaches = useRef<Roach[]>([]);
  /** the 50-kill swarm fires once per run */
  const swarmDone = useRef(false);
  /** de-personalized all-time record across every visitor (server-backed) */
  const worldRec = useRef(0);
  /** the world-record toast fires once per run */
  const worldToasted = useRef(false);
  /** kill hit-stop: the loop serves dt=0 until this timestamp passes */
  const hitStopUntil = useRef(0);
  /** last --cb-walk-speed written to the svg (quantized, avoids style churn) */
  const lastCycle = useRef(0);
  /** first frame-error logged only once - a catch-per-frame must not spam */
  const tickErrorLogged = useRef(false);

  const particles = useRef<Particle[]>([]);
  const splats = useRef<Splat[]>([]);
  const ripples = useRef<Ripple[]>([]);
  const canvasDirty = useRef(false);

  /* ------------------------------ timers ------------------------------ */

  const addTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  };

  /* ------------------------------ canvas ------------------------------ */

  const resizeCanvas = () => {
    const canvas = canvasEl.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    vp.current.w = window.innerWidth;
    vp.current.h = window.innerHeight;
    canvas.width = Math.round(vp.current.w * dpr);
    canvas.height = Math.round(vp.current.h * dpr);
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasDirty.current = true;
    // fresh card geometry: the z-sandwich and spawn poses hang off it
    const card = document.querySelector("[data-nf-card]")?.getBoundingClientRect();
    cardRect.current = card
      ? { left: card.left, top: card.top, width: card.width, height: card.height }
      : null;
    // keep a roaming bug (and its peek target) inside the new bounds
    const s = st.current;
    const b = panicBounds(vp.current);
    s.x = Math.max(b.minX, Math.min(b.maxX, s.x));
    s.y = Math.max(b.minY, Math.min(b.maxY, s.y));
    s.tx = Math.max(b.minX, Math.min(b.maxX, s.tx));
    s.ty = Math.max(b.minY, Math.min(b.maxY, s.ty));
  };

  /* --------------------------- fx spawners ---------------------------- */

  /** FX palette for a bug tier: skinned normal, typed accents, boss crimson. */
  const palFor = (type: BugType): FxPalette =>
    type === "normal" ? (skinPal.current ?? FX_NORMAL) : FX_BY_TYPE[type];

  const spawnSplash = (x: number, y: number, pal: FxPalette) => {
    const n = splashCount();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(90, 240);
      particles.current.push({
        kind: Math.random() < 0.6 ? "meat" : "spark",
        pal,
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(40, 110),
        rot: 0,
        vr: 0,
        size: rand(2, 5),
        life: rand(0.35, 0.7),
        age: 0,
      });
    }
  };

  const spawnTrailDrip = (x: number, y: number, pal: FxPalette) => {
    particles.current.push({
      kind: "meat",
      pal,
      x: x + rand(-6, 6),
      y: y + rand(-4, 8),
      vx: rand(-20, 20),
      vy: rand(10, 60),
      rot: 0,
      vr: 0,
      size: rand(2.5, 5),
      life: rand(0.5, 0.9),
      age: 0,
    });
  };

  const spawnExplosion = (x: number, y: number, pal: FxPalette, big: boolean) => {
    const count = particleCount(big);
    const boost = big ? 1.3 : 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(160, 430) * boost;
      const roll = Math.random();
      const kind: ParticleKind = roll < 0.3 ? "meat" : roll < 0.5 ? "shard" : roll < 0.65 ? "chip" : roll < 0.82 ? "spark" : "code";
      const kindLife: Record<ParticleKind, [number, number]> = {
        meat: [0.7, 1.2],
        shard: [0.8, 1.3],
        chip: [1.0, 1.5],
        spark: [0.35, 0.6],
        code: [0.9, 1.4],
      };
      const [lo, hi] = kindLife[kind];
      particles.current.push({
        kind,
        pal,
        char: kind === "code" ? CODE_FRAGMENTS[Math.floor(Math.random() * CODE_FRAGMENTS.length)] : undefined,
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(60, 150),
        rot: Math.random() * Math.PI * 2,
        vr: rand(-9, 9),
        size: kind === "chip" ? rand(7, 10) : kind === "code" ? rand(9, 13) : kind === "spark" ? rand(8, 16) : rand(2.5, 6.5),
        life: rand(lo, hi),
        age: 0,
      });
    }
    if (particles.current.length > 240) {
      particles.current.splice(0, particles.current.length - 240);
    }
  };

  const spawnSplatStain = (x: number, y: number, pal: FxPalette, dir?: number) => {
    // splash casts away from the strike: most drops bias along the impact
    // vector, the rest scatter; a few far droplets spray further out
    const base = dir ?? rand(0, Math.PI * 2);
    const drops: Splat["drops"] = [];
    const n = 10 + Math.floor(Math.random() * 7); // 10-16 drops
    for (let i = 0; i < n; i++) {
      const biased = Math.random() < 0.7;
      const a = biased ? base + rand(-1.05, 1.05) : Math.random() * Math.PI * 2;
      const d = rand(4, biased ? 40 : 26);
      drops.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, r: rand(4, 15) });
    }
    for (let i = 0; i < 3; i++) {
      // far spray: small droplets flung furthest along the impact vector
      const a = base + rand(-0.5, 0.5);
      const d = rand(32, 48);
      drops.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, r: rand(2, 4) });
    }
    const chips: Splat["chips"] = [];
    const cn = 2 + Math.floor(Math.random() * 3); // 2-4 embedded chips
    for (let i = 0; i < cn; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(0, 26);
      chips.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, rot: Math.random() * Math.PI, s: rand(6, 10) });
    }
    // pre-render the stain once: one drawImage per frame instead of ~40 fills
    let sprite: HTMLCanvasElement | null = null;
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sc = document.createElement("canvas");
      sc.width = Math.round(SPLAT_SPRITE * dpr);
      sc.height = Math.round(SPLAT_SPRITE * dpr);
      const sctx = sc.getContext("2d");
      if (sctx) {
        sctx.scale(dpr, dpr);
        sctx.translate(SPLAT_SPRITE / 2, SPLAT_SPRITE / 2);
        drawSplatPaint(sctx, drops, chips, pal);
        sprite = sc;
      }
    } catch {
      sprite = null; // legacy vector path covers it in renderFx
    }
    splats.current.push({
      x,
      y,
      drops,
      chips,
      sprite,
      size: SPLAT_SPRITE,
      born: performance.now(),
      life: rand(BALANCE.splatKeepMin, BALANCE.splatKeepMax) * 1000,
      pal,
    });
    if (splats.current.length > BALANCE.splatCap) splats.current.shift();
  };

  /* --------------------------- canvas render --------------------------- */

  const renderFx = (dt: number, now: number) => {
    const canvas = canvasEl.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const hadStuff =
      particles.current.length > 0 ||
      splats.current.length > 0 ||
      ripples.current.length > 0 ||
      roaches.current.length > 0;
    if (!hadStuff && !canvasDirty.current) return;
    canvasDirty.current = false;

    ctx.clearRect(0, 0, vp.current.w, vp.current.h);

    // slime stains: pre-rendered blob sprite (vector fallback), fading out
    for (const s of splats.current) {
      const age = now - s.born;
      const fade = age > s.life - 2500 ? Math.max(0, (s.life - age) / 2500) : 1;
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      if (s.sprite) {
        ctx.drawImage(s.sprite, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      } else {
        drawSplatPaint(ctx, s.drops, s.chips, s.pal);
      }
      ctx.globalAlpha = 1;
    }
    splats.current = splats.current.filter((s) => now - s.born < s.life);

    // particles: radial impulse, gravity, drag, spin, fade
    const g = 560;
    const keep: Particle[] = [];
    for (const p of particles.current) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const dragK = p.kind === "spark" ? 2.4 : p.kind === "code" ? 1.4 : p.kind === "chip" ? 1.1 : 1.7;
      const k = Math.exp(-dragK * dt);
      p.vx *= k;
      p.vy = p.vy * k + (p.kind === "spark" ? 140 : g) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const alpha = 1 - p.age / p.life;
      const pal = p.pal;
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.kind === "meat") {
        ctx.fillStyle = pal.meat;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "spark") {
        ctx.strokeStyle = pal.spark;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
        ctx.stroke();
      } else if (p.kind === "chip") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = pal.chipBody;
        ctx.fillRect(-p.size / 2, -p.size / 2.6, p.size, p.size / 1.3);
        ctx.strokeStyle = pal.chipPin;
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.size / 2, -p.size / 2.6, p.size, p.size / 1.3);
        ctx.restore();
      } else if (p.kind === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = pal.shell;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.8, p.size * 0.55);
        ctx.lineTo(-p.size * 0.75, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal.shardEdge;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      } else {
        // code fragment: glyph picked at spawn (per-frame rerolls strobe), font
        // resolved once on mount - canvas ignores var() inside ctx.font
        ctx.fillStyle = pal.meat;
        ctx.font = `${Math.round(p.size)}px ${codeFont.current}`;
        ctx.textAlign = "center";
        ctx.fillText(p.char ?? "404", p.x, p.y);
      }
      keep.push(p);
    }
    particles.current = keep;
    ctx.globalAlpha = 1;

    // boss swarm: procedural roaches (dark shell, six scuttling legs)
    for (const r of roaches.current) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.heading);
      ctx.fillStyle = "#241610";
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(13, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3d2a1c";
      ctx.lineWidth = 1.6;
      for (let leg = 0; leg < 6; leg++) {
        const side = leg < 3 ? -1 : 1;
        const sway = Math.sin(r.phase + leg * 1.1) * 4;
        ctx.beginPath();
        ctx.moveTo((leg % 3) * 6 - 6, 0);
        ctx.lineTo((leg % 3) * 6 - 6 + sway * 0.3, side * 10);
        ctx.stroke();
      }
      ctx.strokeStyle = "#54371f";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(16, -2);
      ctx.lineTo(26, -6 + Math.sin(r.phase) * 2);
      ctx.moveTo(16, 2);
      ctx.lineTo(26, 6 - Math.sin(r.phase) * 2);
      ctx.stroke();
      ctx.restore();
    }

    // shockwaves
    const rKeep: Ripple[] = [];
    for (const r of ripples.current) {
      // clamp t at 0: ripples are born with performance.now() mid-frame while
      // the rAF timestamp is the frame's start - a heavy splat frame can push
      // `born` a frame or two into the "future", and a negative t made the
      // arc radius negative -> canvas threw -> the whole rAF loop died and
      // every later bug stood frozen forever
      const t = Math.max(0, (now - r.born) / r.life);
      if (t >= 1) continue;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 2));
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.pal.ring;
      ctx.lineWidth = 3 - t * 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      rKeep.push(r);
    }
    ripples.current = rKeep;
    ctx.globalAlpha = 1;
  };

  /* --------------------------- bug movement --------------------------- */

  const positionBug = () => {
    const s = st.current;
    const el = bugEl.current;
    if (el) {
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      el.style.opacity = s.mode === "respawn" ? "0" : "1";
      // while ANY part of the bug still overlaps the card it renders UNDER
      // the frosted glass (z 5 < card 10): the part beyond the edge is not
      // covered by the glass and reads crisp, the rest stays a dim silhouette.
      // The old check used only the center point, so a half-emerged bug
      // snapped to the front layer mid-crawl ("half of the body teleports").
      // The flip to z 30 fires only when the bug is FULLY clear of the card,
      // where the layer change is physically invisible - and it is a pure
      // geometry check, so it also holds while panicking or idling.
      const c = cardRect.current;
      const overlap = hitSizeFor(s.type, coarse.current) / 2 + 12;
      const under =
        c !== null &&
        s.x + overlap > c.left &&
        s.x - overlap < c.left + c.width &&
        s.y + overlap > c.top &&
        s.y - overlap < c.top + c.height;
      el.style.zIndex = under ? "5" : "30";
    }
    const rotEl = bugRot.current;
    if (rotEl) {
      rotEl.style.transform = `rotate(${headingToRotation(s.heading)}deg)`;
    }
    // gait follows the actual ground speed: authored 0.42s at panicSpeed,
    // faster when enraged/wounded, slow deliberate steps while crawling.
    // Written straight onto the svg's inline var (React never rewrites keys
    // it does not see changed); quantized to 20ms so the loop does not churn
    // the style engine every frame.
    let speed = 0;
    if (s.mode === "panic") {
      speed = typeSpeedFor(s.type, s.hp, s.maxHp, s.kills, coarse.current);
    } else if (s.mode === "peek") {
      const desired = Math.atan2(s.ty - s.y, s.tx - s.x);
      const align = Math.max(0, Math.cos(desired - s.heading));
      speed = BALANCE.peekSpeed * (0.3 + 0.7 * align);
    }
    if (speed > 0) {
      const cycle = Math.round(walkCycleFor(speed, s.type === "boss") * 50) / 50;
      if (Math.abs(cycle - lastCycle.current) > 0.001) {
        lastCycle.current = cycle;
        svgFlash.current?.querySelector("svg")?.style.setProperty("--cb-walk-speed", `${cycle}s`);
      }
    }
  };

  const stepPanic = (dt: number, now: number) => {
    const s = st.current;
    if (now >= s.turnAt) {
      s.heading += rand(-1.35, 1.35);
      s.turnAt = now + rand(BALANCE.turnMin, BALANCE.turnMax) * 1000;
    }
    const speed = typeSpeedFor(s.type, s.hp, s.maxHp, s.kills, coarse.current);
    s.x += Math.cos(s.heading) * speed * dt;
    s.y += Math.sin(s.heading) * speed * dt;
    const b = panicBounds(vp.current);
    if (s.x < b.minX) {
      s.x = b.minX;
      s.heading = Math.PI - s.heading;
    } else if (s.x > b.maxX) {
      s.x = b.maxX;
      s.heading = Math.PI - s.heading;
    }
    if (s.y < b.minY) {
      s.y = b.minY;
      s.heading = -s.heading;
    } else if (s.y > b.maxY) {
      s.y = b.maxY;
      s.heading = -s.heading;
    }
    // wounded bug drips slime and sparks behind it
    if (s.hp < s.maxHp && now >= s.trailAt) {
      spawnTrailDrip(s.x, s.y, palFor(s.type));
      s.trailAt = now + BALANCE.trailEvery * 1000;
    }
  };

  const stepPeek = (dt: number) => {
    const s = st.current;
    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= BALANCE.peekSpeed * dt + 0.5) {
      s.x = s.tx;
      s.y = s.ty;
      // keep the arrival heading - no snap: the bug faces where it crawled
      s.mode = "idle";
      s.wanderAt = performance.now() + rand(BALANCE.idleWanderMin, BALANCE.idleWanderMax) * 1000;
      setView((v) => ({ ...v, legs: "idle" }));
      return;
    }
    // smooth turn along the shortest arc; the crawl slows while misaligned so
    // the path reads as an arc, not a spin-teleport
    const desired = Math.atan2(dy, dx);
    s.heading = turnToward(s.heading, desired, BALANCE.peekTurnRate * dt);
    const align = Math.max(0, Math.cos(desired - s.heading));
    const speed = BALANCE.peekSpeed * (0.3 + 0.7 * align);
    s.x += Math.cos(s.heading) * speed * dt;
    s.y += Math.sin(s.heading) * speed * dt;
  };

  /** Idle stroll: pick a nearby point and crawl there on the peek machinery. */
  const startWander = () => {
    const s = st.current;
    const t = wanderTarget(s.x, s.y, vp.current);
    s.tx = t.tx;
    s.ty = t.ty;
    s.mode = "peek";
    setView((v) => (v.legs === "step" ? v : { ...v, legs: "step" }));
  };

  /** A bug past its patience crawls to the card, dives under the glass, bites. */
  const stepHunt = (dt: number) => {
    const s = st.current;
    const c = cardRect.current;
    const tx = c ? c.left + c.width / 2 : s.tx;
    const ty = c ? c.top + c.height / 2 : s.ty;
    const desired = Math.atan2(ty - s.y, tx - s.x);
    s.heading = turnToward(s.heading, desired, BALANCE.peekTurnRate * 2 * dt);
    const speed = typeSpeedFor(s.type, s.hp, s.maxHp, s.kills, coarse.current) * 1.5;
    s.x += Math.cos(s.heading) * speed * dt;
    s.y += Math.sin(s.heading) * speed * dt;
    // fully under the glass -> it bites from beneath
    const half = hitSizeFor(s.type, coarse.current) / 2;
    if (
      c &&
      s.x - half > c.left &&
      s.x + half < c.left + c.width &&
      s.y - half > c.top &&
      s.y + half < c.top + c.height
    ) {
      bite();
    }
  };

  /** Ghost blink target: near the card perimeter (plotting a bite), or roam. */
  const ghostTarget = () => {
    const s = st.current;
    const b = panicBounds(vp.current);
    const c = cardRect.current;
    if (!c || Math.random() < 0.35) return wanderTarget(s.x, s.y, vp.current);
    // a point just outside a random card edge - the ghost haunts the glass
    const out = rand(26, 60);
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) { x = c.left - out; y = rand(c.top + 40, Math.max(c.top + 41, c.top + c.height - 40)); }
    else if (edge === 1) { x = c.left + c.width + out; y = rand(c.top + 40, Math.max(c.top + 41, c.top + c.height - 40)); }
    else if (edge === 2) { x = rand(c.left + 40, Math.max(c.left + 41, c.left + c.width - 40)); y = c.top - out; }
    else { x = rand(c.left + 40, Math.max(c.left + 41, c.left + c.width - 40)); y = c.top + c.height + out; }
    return {
      tx: Math.max(b.minX, Math.min(b.maxX, x)),
      ty: Math.max(b.minY, Math.min(b.maxY, y)),
    };
  };

  /** Ghost: flicker telegraph, then blink near the card glass. */
  const ghostTeleport = () => {
    const s = st.current;
    const svg = svgFlash.current?.querySelector("svg");
    if (svg) {
      svg.classList.remove("cb-pre-dash");
      void svg.getBoundingClientRect(); // restart the flicker
      svg.classList.add("cb-pre-dash");
    }
    spawnSplash(s.x, s.y, palFor("ghost"));
    ripples.current.push({ x: s.x, y: s.y, r0: 6, r1: 40, born: performance.now(), life: 0.3, pal: palFor("ghost") });
    canvasDirty.current = true;
    addTimer(() => {
      // the bug may die during the windup - never teleport a corpse
      if (s.mode === "dying" || s.mode === "respawn") return;
      const t = ghostTarget();
      ripples.current.push({ x: t.tx, y: t.ty, r0: 6, r1: 40, born: performance.now(), life: 0.35, pal: palFor("ghost") });
      spawnSplash(t.tx, t.ty, palFor("ghost"));
      s.x = t.tx;
      s.y = t.ty;
      s.tx = t.tx;
      s.ty = t.ty;
      if (s.mode === "panic") {
        s.heading = rand(0, Math.PI * 2);
        s.turnAt = performance.now();
      }
      canvasDirty.current = true;
    }, BALANCE.ghostTelegraphMs);
  };

  /** Lightning: spark charge, then an evasive hop with a glowing trail. */
  const lightningHop = () => {
    const s = st.current;
    spawnSplash(s.x, s.y, palFor("lightning"));
    ripples.current.push({ x: s.x, y: s.y, r0: 4, r1: 28, born: performance.now(), life: 0.3, pal: palFor("lightning") });
    canvasDirty.current = true;
    addTimer(() => {
      if (s.mode === "dying" || s.mode === "respawn") return;
      const b = panicBounds(vp.current);
      const ox = s.x;
      const oy = s.y;
      const a = rand(0, Math.PI * 2);
      const nx = Math.max(b.minX, Math.min(b.maxX, s.x + Math.cos(a) * BALANCE.lightningHop));
      const ny = Math.max(b.minY, Math.min(b.maxY, s.y + Math.sin(a) * BALANCE.lightningHop));
      // glowing trail along the hop line
      for (let i = 1; i <= 4; i++) {
        const p = i / 4;
        particles.current.push({
          kind: "spark",
          pal: palFor("lightning"),
          x: ox + (nx - ox) * p,
          y: oy + (ny - oy) * p,
          vx: 0,
          vy: 0,
          rot: 0,
          vr: 0,
          size: rand(6, 12),
          life: rand(0.25, 0.45),
          age: 0,
        });
      }
      s.x = nx;
      s.y = ny;
      if (s.mode === "panic") {
        s.heading = a;
        s.turnAt = performance.now();
      }
      canvasDirty.current = true;
    }, BALANCE.lightningChargeMs);
  };

  /* ------------------------------ actions ------------------------------ */

  const showPhrase = (text: string, x: number, y: number, color?: string) => {
    const layer = phraseLayer.current;
    if (!layer) return;
    const el = document.createElement("div");
    el.className =
      "nf-phrase absolute whitespace-nowrap rounded-2xl px-3 py-1.5 font-mono text-[11px] font-bold text-slate-100";
    el.textContent = text;
    if (color) el.style.setProperty("--nf-phrase-color", color);
    layer.appendChild(el);
    // left/top are plain left-edge coordinates: no CSS translate helpers here,
    // the clamp below must own the full geometry (no double offsets)
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const v = vp.current;
    el.style.left = `${Math.max(8, Math.min(v.w - w - 8, x - w / 2))}px`;
    el.style.top = `${Math.max(BALANCE.headerSafe + 2, y - 58 - h)}px`;
    addTimer(() => el.classList.add("nf-out"), BALANCE.cloudLife * 1000 * 0.65);
    addTimer(() => el.remove(), BALANCE.cloudLife * 1000);
  };

  /** Announcements float at a fixed central spot (never at the kill point). */
  const showToast = (text: string, tone: "info" | "boss" | "achievement") => {
    const layer = toastLayer.current;
    if (!layer) return;
    const el = document.createElement("div");
    const toneCls = tone === "boss" ? " nf-toast-boss" : tone === "achievement" ? " nf-toast-achieve" : "";
    el.className =
      "nf-toast appseal-glass-card absolute rounded-2xl px-4 py-3 max-w-[min(92vw,440px)] text-[13px] font-medium leading-snug text-slate-100 pointer-events-none z-40" +
      toneCls;
    el.textContent = text;
    layer.appendChild(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const v = vp.current;
    // stack offset: a second toast while one is visible slides below it
    const slot = toastCount.current;
    toastCount.current += 1;
    // the anchor is the screen center; the clamp slides it out of the card's
    // text block so announcements never cover the page copy
    const pos = clampToast(v.w / 2, v.h / 2 + slot * 52, w, h, v, cardRect.current);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    addTimer(() => el.classList.add("nf-out"), (BALANCE.toastLife - 0.5) * 1000);
    addTimer(() => {
      el.remove();
      toastCount.current = Math.max(0, toastCount.current - 1);
    }, BALANCE.toastLife * 1000);
  };

  const shakeCard = () => {
    if (reduced.current) return;
    const el = document.querySelector("[data-nf-shake]");
    if (!el) return;
    el.classList.remove("nf-shake");
    void el.getBoundingClientRect(); // restart the animation
    el.classList.add("nf-shake");
  };

  /** Hit recoil: restarts the cb-hit-flash animation on the bug's svg root. */
  const flashBug = () => {
    const svg = svgFlash.current?.querySelector("svg");
    if (!svg) return;
    svg.classList.remove("cb-hit-flash");
    void svg.getBoundingClientRect(); // restart the animation
    svg.classList.add("cb-hit-flash");
  };

  /** Panic squash-and-stretch on the wrapper (outside the rotation pivot). */
  const squashBug = () => {
    const el = svgFlash.current;
    if (!el || reduced.current) return;
    el.classList.remove("nf-squash");
    void el.getBoundingClientRect(); // restart the animation
    el.classList.add("nf-squash");
  };

  /** Touch feedback: light tap on a landed hit, double pulse on the splat. */
  const buzz = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  };

  /** Bite aftermath: a red page-wide flash + the card shakes (boss flash reuse). */
  const redFlash = () => {
    const el = redEl.current;
    if (!el || reduced.current) return;
    el.classList.remove("nf-flash-on");
    void el.getBoundingClientRect(); // restart the animation
    el.classList.add("nf-flash-on");
  };

  /** A bug fully under the glass bites a life out of the page. */
  const bite = () => {
    const s = st.current;
    if (lives.current <= 0) return; // game already over - roaches can't bite a corpse
    if (shield.current) {
      shield.current = false;
      setHud((h) => ({ ...h, shield: false }));
      showToast(SHIELD_BLOCK_PHRASE[langRef.current], "achievement");
      ymGoal("nf_shield_block");
      // the bug bounces off, patience resets
      s.mode = "panic";
      s.heading = Math.atan2(
        s.y - (cardRect.current?.top ?? s.y),
        s.x - (cardRect.current?.left ?? s.x),
      );
      s.turnAt = performance.now();
      s.trailAt = 0;
      s.biteAt = performance.now() + biteAfterFor(s.kills) * 1000;
      setView((v) => ({ ...v, legs: "panic" }));
      engine.current?.play("panic", s.type === "boss");
      return;
    }
    lives.current -= 1;
    setHud((h) => ({ ...h, lives: lives.current }));
    shakeCard();
    redFlash();
    // the bug visibly chomps: a lunge-squeeze on the shell + red page chunks
    // spray from the bite point - the damage text became an animation
    const chompEl = svgFlash.current;
    if (chompEl && !reduced.current) {
      chompEl.classList.remove("nf-bite-chomp");
      void chompEl.getBoundingClientRect();
      chompEl.classList.add("nf-bite-chomp");
    }
    spawnExplosion(
      s.x,
      s.y,
      { ...FX_NORMAL, meat: "#ef4444", shardEdge: "#ef4444", ring: "#ef4444", spark: "#fca5a5" },
      true,
    );
    canvasDirty.current = true;
    const line = BITE_PHRASES[langRef.current][Math.floor(Math.random() * BITE_PHRASES[langRef.current].length)];
    setLive(`${line} Жизни: ${lives.current}/3`);
    ymGoal("nf_bite");
    if (lives.current <= 0) {
      endGame();
      return;
    }
    // fed bug retreats under the glass; the next one crawls out after a beat
    s.mode = "respawn";
    if (hitbox.current) hitbox.current.style.pointerEvents = "none";
    setView((v) => ({ ...v, legs: "idle", hp: v.maxHp }));
    addTimer(() => {
      spawnBug();
    }, respawnGapFor(s.kills) * 1000);
  };

  /** All 404 lives gone: the board stops, the score screen rises. */
  const endGame = () => {
    const s = st.current;
    s.mode = "respawn";
    if (hitbox.current) hitbox.current.style.pointerEvents = "none";
    // the swarm goes home too: no more bites past the score screen
    roaches.current = [];
    document.querySelector("[data-nf-card]")?.classList.remove("nf-rumble");
    setGameOver(true);
    ymGoal("nf_game_over");
  };

  /* ------------------------------ boss swarm ------------------------------ */

  /** Spawns the 50-kill roach swarm from every screen edge. */
  const spawnSwarm = () => {
    const v = vp.current;
    for (let i = 0; i < SWARM_SIZE; i++) {
      const edge = i % 4;
      const x = edge === 0 ? -20 : edge === 1 ? v.w + 20 : rand(0, v.w);
      const y = edge === 2 ? BALANCE.headerSafe + 10 : edge === 3 ? v.h + 20 : rand(BALANCE.headerSafe + 10, v.h);
      roaches.current.push({
        x,
        y,
        heading: Math.atan2(v.h / 2 - y, v.w / 2 - x),
        phase: rand(0, Math.PI * 2),
        fleeAngle: rand(0, Math.PI * 2),
      });
    }
    shakeCard();
    showToast(SWARM_ANNOUNCE[langRef.current], "boss");
    ymGoal("nf_swarm");
    document.querySelector("[data-nf-card]")?.classList.add("nf-rumble");
  };

  /** One roach down: splat FX, kill counters, victory when the last falls. */
  const killRoach = (idx: number, x: number, y: number) => {
    const r = roaches.current[idx];
    roaches.current.splice(idx, 1);
    spawnSplash(x, y, FX_BY_TYPE.splitter);
    ripples.current.push({ x, y, r0: 4, r1: 34, born: performance.now(), life: 0.3, pal: FX_BY_TYPE.splitter });
    buzz(12);
    canvasDirty.current = true;
    st.current.kills += 1;
    const newKills = st.current.kills;
    total.current += 1;
    try {
      localStorage.setItem(TOTAL_KEY, String(total.current));
      localStorage.setItem(BEST_KEY, String(Math.max(best.current, newKills)));
    } catch {
      /* private mode */
    }
    if (newKills > best.current) best.current = newKills;
    const prevSkin = skinFor(total.current - 1);
    const newSkin = skinFor(total.current);
    applySkin(newSkin.color);
    try {
      const unlocks = JSON.parse(localStorage.getItem(UNLOCKS_KEY) ?? "[]") as number[];
      if (!unlocks.includes(newSkin.kills)) unlocks.push(newSkin.kills);
      localStorage.setItem(UNLOCKS_KEY, JSON.stringify(unlocks));
    } catch {
      /* private mode */
    }
    if (newSkin !== prevSkin) {
      showToast(`${SKIN_UNLOCK_LABEL[langRef.current]} ${newSkin.name[langRef.current]}`, "achievement");
      ymGoal("nf_skin_unlock");
    }
    const newWave = waveFor(newKills);
    if (newWave > wave.current) {
      wave.current = newWave;
      const line = WAVE_ANNOUNCE[langRef.current][newWave];
      if (line) showToast(line, "achievement");
      ymGoal("nf_wave_up");
    }
    setHud((h) => ({
      kills: newKills,
      best: Math.max(h.best, newKills),
      total: total.current,
      wave: wave.current,
      lives: lives.current,
      shield: shield.current,
      sfxOn: engine.current?.enabled ?? true,
    }));
    ymGoal("nf_roach_kill");
    bumpWorld(newKills);
    if (roaches.current.length === 0) {
      swarmDone.current = true;
      document.querySelector("[data-nf-card]")?.classList.remove("nf-rumble");
      const bossFlash = bossFlashEl.current;
      if (bossFlash) {
        bossFlash.classList.remove("nf-flash-on");
        void bossFlash.getBoundingClientRect();
        bossFlash.classList.add("nf-flash-on");
      }
      // confetti of code fragments across the board
      for (let i = 0; i < 5; i++) {
        addTimer(() => spawnExplosion(rand(80, vp.current.w - 80), rand(BALANCE.headerSafe + 60, vp.current.h - 120), FX_BY_TYPE.spawnling, false), i * 180);
      }
      showToast(SWARM_VICTORY[langRef.current], "achievement");
      ymGoal("nf_swarm_victory");
    }
  };

  /** Boids-lite: the swarm steers toward the card, holds together, bites. */
  const stepSwarm = (dt: number) => {
    const alive = roaches.current;
    if (!alive.length) return;
    const v = vp.current;
    const c = cardRect.current;
    const cx = c ? c.left + c.width / 2 : v.w / 2;
    const cy = c ? c.top + c.height / 2 : v.h / 2;
    // centroid for cohesion
    let mx = 0;
    let my = 0;
    for (const r of alive) {
      mx += r.x;
      my += r.y;
    }
    mx /= alive.length;
    my /= alive.length;
    const charged = alive.length >= SWARM_CHARGED;
    const panicked = !charged;
    const lastIdx = alive.length === 1 ? 0 : -1;
    for (let i = 0; i < alive.length; i++) {
      const r = alive[i];
      // steer toward the card, cohesion pull, separation push
      let dx = cx - r.x;
      let dy = cy - r.y;
      const d = Math.hypot(dx, dy) || 1;
      let vx = (dx / d) * 1.0;
      let vy = (dy / d) * 1.0;
      vx += ((mx - r.x) / (Math.hypot(mx - r.x, my - r.y) || 1)) * 0.5;
      vy += ((my - r.y) / (Math.hypot(mx - r.x, my - r.y) || 1)) * 0.5;
      for (let j = 0; j < alive.length; j++) {
        if (j === i) continue;
        const o = alive[j];
        const ox = r.x - o.x;
        const oy = r.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od < 26 && od > 0.01) {
          vx += (ox / od) * 0.9;
          vy += (oy / od) * 0.9;
        }
      }
      if (panicked && i === lastIdx) {
        // the last roach runs for the farthest corner - catch it!
        vx = Math.cos(r.fleeAngle) * 1.4;
        vy = Math.sin(r.fleeAngle) * 1.4;
      }
      const mag = Math.hypot(vx, vy) || 1;
      const speed = (charged ? SWARM_ROACH_SPEED_CHARGED : SWARM_ROACH_SPEED) * (i === lastIdx ? 1.4 : 1);
      r.x += (vx / mag) * speed * dt;
      r.y += (vy / mag) * speed * dt;
      r.x = Math.max(-30, Math.min(v.w + 30, r.x));
      r.y = Math.max(BALANCE.headerSafe - 10, Math.min(v.h + 30, r.y));
      r.heading = Math.atan2(vy, vx);
      r.phase += dt * 22;
      // a roach reaching the card eats a life and disappears under the glass
      if (c) {
        const insideX = r.x > c.left - SWARM_BITE_DIST && r.x < c.left + c.width + SWARM_BITE_DIST;
        const insideY = r.y > c.top - SWARM_BITE_DIST && r.y < c.top + c.height + SWARM_BITE_DIST;
        if (insideX && insideY) {
          alive.splice(i, 1);
          i -= 1;
          bite();
          canvasDirty.current = true;
        }
      }
    }
    if (alive.length === 0) {
      swarmDone.current = true;
      document.querySelector("[data-nf-card]")?.classList.remove("nf-rumble");
    }
  };

  /** Nearest roach under the tap, if any. */
  const roachAt = (x: number, y: number): number => {
    for (let i = 0; i < roaches.current.length; i++) {
      const r = roaches.current[i];
      if (Math.hypot(r.x - x, r.y - y) <= SWARM_ROACH_HIT_R) return i;
    }
    return -1;
  };

  /** Fresh run: lives back, counters reset, total/skins persist. */
  const restartGame = () => {
    lives.current = 3;
    shield.current = false;
    chain.current = 0;
    wave.current = 1;
    swarmDone.current = false;
    worldToasted.current = false;
    st.current.kills = 0;
    lastRandom.current = -1;
    lastBossRandom.current = -1;
    frozenUntil.current = 0;
    roaches.current = [];
    document.querySelector("[data-nf-card]")?.classList.remove("nf-rumble");
    setGameOver(false);
    setHud((h) => ({ ...h, kills: 0, wave: 1, lives: 3, shield: false }));
    spawnBug();
  };

  /** Draggable power-up dropped at the splat point (~15% of kills): tap it
   * where it lies, or hold LMB and drag it to the spot, release detonates. */
  const spawnDrop = (x: number, y: number) => {
    const layer = dropLayer.current;
    if (!layer || gameOver) return;
    const kind = pickPowerup();
    const v = vp.current;
    const el = document.createElement("button");
    el.type = "button";
    el.setAttribute("aria-label", `${POWERUPS[kind].name[langRef.current]} - кликни или перетащи`);
    el.className =
      "nf-drop appseal-glass-card pointer-events-auto absolute z-40 flex cursor-grab touch-none items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[12px] font-bold text-slate-100";
    el.textContent = `${POWERUPS[kind].icon} ${POWERUPS[kind].name[langRef.current]}`;
    const cx = Math.max(80, Math.min(v.w - 100, x));
    const cy = Math.max(BALANCE.headerSafe + 40, Math.min(v.h - 140, y));
    el.style.left = `${cx - 70}px`;
    el.style.top = `${cy - 24}px`;
    // lifetime fade - paused while the chip is being dragged
    const fadeId = addTimer(() => el.classList.add("nf-out"), (BALANCE.dropLifetime - 0.5) * 1000);
    const killId = addTimer(() => el.remove(), BALANCE.dropLifetime * 1000);
    const pauseLifetime = () => {
      clearTimeout(fadeId);
      clearTimeout(killId);
      timers.current.delete(fadeId);
      timers.current.delete(killId);
    };
    let dragging = false;
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        pauseLifetime();
        el.classList.add("nf-drop-drag");
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* capture unsupported - moves still land while pressed */
        }
      },
      { once: true },
    );
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      el.style.left = `${e.clientX - 70}px`;
      el.style.top = `${e.clientY - 24}px`;
    });
    el.addEventListener(
      "pointerup",
      (e) => {
        if (!dragging) return;
        dragging = false;
        el.remove();
        applyPowerup(kind, e.clientX, e.clientY);
      },
      { once: true },
    );
    // keyboard fallback: Enter/Space detonates at the chip's position
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      pauseLifetime();
      const r = el.getBoundingClientRect();
      el.remove();
      applyPowerup(kind, r.x + 70, r.y + 24);
    });
    layer.appendChild(el);
  };

  /** All-time record painting + server sync (competition between players). */
  const paintWorld = () => {
    const el = document.querySelector<HTMLElement>("[data-nf-world]");
    if (el) el.textContent = String(worldRec.current);
  };

  const bumpWorld = (newKills: number) => {
    if (newKills <= worldRec.current) return;
    worldRec.current = newKills;
    paintWorld();
    void fetch("/api/nf-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: newKills }),
    }).catch(() => {
      /* offline - the local paint already shows the run */
    });
    if (!worldToasted.current) {
      worldToasted.current = true;
      showToast(WORLD_RECORD_PHRASE[langRef.current], "achievement");
      ymGoal("nf_world_record");
    }
  };

  /** Power-up activation: bomb AoE splat, 3s board freeze, or a shield. */
  const applyPowerup = (kind: PowerupKind, x: number, y: number) => {
    const s = st.current;
    engine.current?.unlock();
    if (kind === "bomb") {
      const pal = palFor(s.mode === "dying" || s.mode === "respawn" ? "normal" : s.type);
      spawnExplosion(x, y, pal, true);
      ripples.current.push({ x, y, r0: 10, r1: BALANCE.bombRadius + 40, born: performance.now(), life: 0.6, pal });
      shakeCard();
      buzz([60, 30, 60]);
      canvasDirty.current = true;
      const alive = s.mode !== "dying" && s.mode !== "respawn";
      const dist = Math.hypot(s.x - x, s.y - y);
      if (alive && dist <= BALANCE.bombRadius) {
        s.hp = 0;
        splatBug(x, y);
      }
      // the blast also clears roaches in the radius
      for (let i = roaches.current.length - 1; i >= 0; i--) {
        const r = roaches.current[i];
        if (Math.hypot(r.x - x, r.y - y) <= BALANCE.bombRadius) killRoach(i, r.x, r.y);
      }
      showToast(POWERUP_TOAST.bomb[langRef.current], "info");
      ymGoal("nf_bomb");
    } else if (kind === "freeze") {
      frozenUntil.current = performance.now() + BALANCE.freezeMs;
      const el = freezeEl.current;
      if (el) {
        el.classList.remove("nf-freeze-on");
        void el.getBoundingClientRect();
        el.classList.add("nf-freeze-on");
      }
      showToast(POWERUP_TOAST.freeze[langRef.current], "info");
      ymGoal("nf_freeze");
    } else {
      shield.current = true;
      setHud((h) => ({ ...h, shield: true }));
      showToast(POWERUP_TOAST.shield[langRef.current], "achievement");
      ymGoal("nf_shield");
    }
  };

  /** Skin application: tints particles/stains/ripples + the svg accent. */
  const applySkin = (color: string) => {
    skinPal.current = { ...FX_NORMAL, meat: color, shardEdge: color, ring: color };
    setSkinColor(color);
  };

  const splatBug = (atX: number, atY: number) => {
    const s = st.current;
    s.kills += 1;
    const newKills = s.kills;
    const boss = s.type === "boss";
    engine.current?.play("splat", boss);
    buzz([40, 15, 40]);

    // kill hit-stop: the whole board freezes for a beat (particles hang in
    // mid-air) so the splat lands with weight; skipped under reduced motion
    if (!reduced.current) hitStopUntil.current = performance.now() + BALANCE.hitStopMs;

    const pal = palFor(s.type);
    spawnExplosion(s.x, s.y, pal, boss || s.type === "tank");
    // the stain casts away from the strike, reading the impact direction
    spawnSplatStain(s.x, s.y, pal, Math.atan2(s.y - atY, s.x - atX));
    ripples.current.push({
      x: s.x,
      y: s.y,
      r0: 10,
      r1: boss ? 130 : 90,
      born: performance.now(),
      life: 0.5,
      pal,
    });
    canvasDirty.current = true;
    shakeCard();

    // DevTools easter egg - the shareable one
    console.log(
      `%c[SPLAT] ${boss ? "BOSS 500" : "Bug 404"} #${newKills} neutralized. Still 404 though.`,
      `color: ${boss ? "#FF2E5B" : "#39FF14"}; font-weight: bold;`,
    );

    // milestone / random kill phrase (boss kills draw from their own pool)
    const { phrase, randomIndex, bossRandomIndex } = killPhraseFor(
      newKills,
      langRef.current,
      lastRandom.current,
      lastBossRandom.current,
    );
    lastRandom.current = randomIndex;
    lastBossRandom.current = bossRandomIndex;
    showToast(phrase.text, phrase.tone ?? "info");
    if (phrase.tone === "achievement") {
      document.querySelector("[data-cta-home]")?.classList.add("nf-cta-win");
    }

    // analytics goals: every splat, boss kills, the 10-kill achievement
    ymGoal("nf_bug_splat");
    if (boss) ymGoal("nf_boss_kill");
    if (phrase.tone === "achievement" && newKills === 10) ymGoal("nf_achievement10");

    // session best: persist and surface in the HUD
    if (newKills > best.current) {
      best.current = newKills;
      try {
        localStorage.setItem(BEST_KEY, String(newKills));
      } catch {
        /* private mode */
      }
    }

    // lifetime progress: the total drives the skin unlocks
    total.current += 1;
    const prevSkin = skinFor(total.current - 1);
    const newSkin = skinFor(total.current);
    applySkin(newSkin.color);
    try {
      localStorage.setItem(TOTAL_KEY, String(total.current));
      const unlocks = JSON.parse(localStorage.getItem(UNLOCKS_KEY) ?? "[]") as number[];
      if (!unlocks.includes(newSkin.kills) && !chain.current) unlocks.push(newSkin.kills);
      localStorage.setItem(UNLOCKS_KEY, JSON.stringify(unlocks));
    } catch {
      /* private mode */
    }
    if (newSkin !== prevSkin) {
      showToast(`${SKIN_UNLOCK_LABEL[langRef.current]} ${newSkin.name[langRef.current]}`, "achievement");
      ymGoal("nf_skin_unlock");
    }

    // new wave: announcement + analytics
    const newWave = waveFor(newKills);
    if (newWave > wave.current) {
      wave.current = newWave;
      const line = WAVE_ANNOUNCE[langRef.current][newWave];
      if (line) showToast(line, "achievement");
      ymGoal("nf_wave_up");
    }

    // the 50-kill boss swarm: once per run, a beat after the 50th splat
    if (newKills === 50 && !swarmDone.current) {
      swarmDone.current = true;
      addTimer(() => spawnSwarm(), 600);
    }

    setHud((h) => ({
      kills: newKills,
      best: Math.max(h.best, newKills),
      total: total.current,
      wave: wave.current,
      lives: lives.current,
      shield: shield.current,
      sfxOn: engine.current?.enabled ?? true,
    }));

    // screenreader mirror of the kill toast
    setLive(`#${newKills} ${phrase.text}`);

    // all-time record competition
    bumpWorld(newKills);

    // power-up drop: ~15% of kills leave a draggable gift
    if (Math.random() < BALANCE.dropChance) spawnDrop(atX, atY);

    // victory beat: flatten to the floor, then hide, then respawn (every 5th
    // bug is the boss); a boss kill adds a short white flash
    s.mode = "dying";
    if (hitbox.current) hitbox.current.style.pointerEvents = "none";
    const flattenEl = svgFlash.current;
    if (flattenEl) {
      flattenEl.classList.remove("nf-flatten");
      void flattenEl.getBoundingClientRect(); // restart the animation
      flattenEl.classList.add("nf-flatten");
    }
    if (boss && bossFlashEl.current) {
      bossFlashEl.current.classList.remove("nf-flash-on");
      void bossFlashEl.current.getBoundingClientRect();
      bossFlashEl.current.classList.add("nf-flash-on");
    }
    setView((v) => ({ ...v, legs: "idle", hp: v.maxHp }));
    addTimer(() => {
      s.mode = "respawn";
    }, BALANCE.flattenMs);
    addTimer(() => {
      spawnBug();
    }, respawnGapFor(newKills) * 1000);
  };

  const spawnBug = () => {
    const s = st.current;
    // splitter chain: pending spawnlings take over the board before the next
    // full bug (boss timing defers while the chain runs)
    const chained = chain.current > 0;
    if (chained) chain.current -= 1;
    const boss = !chained && (s.kills + 1) % BALANCE.bossEvery === 0;
    const type: BugType = chained ? "spawnling" : boss ? "boss" : pickType(s.kills);
    const def = BUG_TYPES[type];
    s.boss = boss;
    s.type = type;
    s.maxHp = hpForType(type, coarse.current);
    s.hp = s.maxHp;
    s.hits = 0;
    s.raged = false;
    // fresh card measurement: scroll/resize since the last spawn shifts it
    const card = document.querySelector("[data-nf-card]")?.getBoundingClientRect();
    cardRect.current = card
      ? { left: card.left, top: card.top, width: card.width, height: card.height }
      : null;
    const pose = cardRect.current
      ? cardSpawnPose(cardRect.current, vp.current)
      : fallbackPose(vp.current);
    s.tx = pose.tx;
    s.ty = pose.ty;
    s.heading = pose.heading;
    s.wanderAt = performance.now() + rand(BALANCE.idleWanderMin, BALANCE.idleWanderMax) * 1000;
    s.abilityAt = performance.now() + rand(1800, 3200);
    s.biteAt = performance.now() + biteAfterFor(s.kills) * 1000;
    if (reduced.current) {
      // reduced motion: no crawling - materialize fully visible at the emerge
      // point (this is what kept past-kill respawns invisible forever)
      s.x = pose.tx;
      s.y = pose.ty;
      s.mode = "idle";
      setView({ boss, type, hp: s.maxHp, maxHp: s.maxHp, legs: "idle" });
    } else {
      s.x = pose.x;
      s.y = pose.y;
      s.mode = "peek";
      setView({ boss, type, hp: s.maxHp, maxHp: s.maxHp, legs: "step" });
    }
    if (hitbox.current) hitbox.current.style.pointerEvents = "auto";
    // clear death/dash leftovers from the previous bug, then dress the tier
    const shell = svgFlash.current;
    shell?.classList.remove("nf-flatten", "nf-squash", "nf-ghost", "nf-splitter", "nf-bite-chomp");
    shell?.querySelector("svg")?.classList.remove("cb-pre-dash");
    if (type === "ghost") shell?.classList.add("nf-ghost");
    if (type === "splitter") shell?.classList.add("nf-splitter");
    positionBug();
  };

  /** Shared hit pipeline for pointer and keyboard strikes. */
  const applyHit = (cx: number, cy: number) => {
    const s = st.current;
    if (s.mode === "dying") return;
    buzz(12);

    // reduced motion: the bug stays put and pops on the first click
    if (reduced.current) {
      splatBug(cx, cy);
      return;
    }

    s.hits += 1;
    s.hp -= 1;

    if (s.hp <= 0) {
      splatBug(cx, cy);
      return;
    }

    if (s.mode === "idle" || s.mode === "peek") {
      // first poke (or a poke mid-emerge): yelp, cloud, and a mad dash away
      // from the cursor - the bug answers every touch with flight
      s.mode = "panic";
      s.heading = Math.atan2(s.y - cy, s.x - cx) + rand(-0.5, 0.5);
      s.turnAt = performance.now();
      s.trailAt = 0;
      setView((v) => ({ ...v, legs: "panic" }));
      engine.current?.play("panic", s.boss);
      squashBug();
      showPhrase(panicCloud(s.boss, langRef.current), s.x, s.y, palFor(s.type).meat);
    } else {
      engine.current?.play("hit");
    }

    // boss phase change: after the 3rd landed hit the boss blinks away from
    // the cursor; the SVG rig shows full rage at the last HP point
    if (s.type === "boss" && !s.raged && s.hits >= 3) {
      s.raged = true;
      const ang = Math.atan2(s.y - cy, s.x - cx);
      const b = panicBounds(vp.current);
      const nx = Math.max(b.minX, Math.min(b.maxX, s.x + Math.cos(ang) * BALANCE.bossDashDist));
      const ny = Math.max(b.minY, Math.min(b.maxY, s.y + Math.sin(ang) * BALANCE.bossDashDist));
      // telegraph: warning ripple + fast flicker, THEN the blink-dash - the
      // bug never vanishes without a 200ms tell (hitbox stays live meanwhile)
      ripples.current.push({ x: s.x, y: s.y, r0: 4, r1: 24, born: performance.now(), life: 0.3, pal: palFor("boss") });
      ripples.current.push({ x: nx, y: ny, r0: 8, r1: 60, born: performance.now(), life: 0.45, pal: palFor("boss") });
      spawnSplash(s.x, s.y, palFor("boss"));
      const svg = svgFlash.current?.querySelector("svg");
      if (svg) {
        svg.classList.remove("cb-pre-dash");
        void svg.getBoundingClientRect(); // restart the animation
        svg.classList.add("cb-pre-dash");
      }
      canvasDirty.current = true;
      addTimer(() => {
        // the bug may die during the windup - never dash a corpse
        if (s.mode === "dying" || s.mode === "respawn") return;
        s.x = nx;
        s.y = ny;
        s.heading = ang;
        s.turnAt = performance.now();
        squashBug();
        showPhrase(rageCloud(langRef.current), s.x, s.y, "#FF2E5B");
        canvasDirty.current = true;
      }, BALANCE.preDashMs);
    }

    // every intermediate hit sprays sparks, slime and knocks the bug back
    flashBug();
    spawnSplash(cx, cy, palFor(s.type));
    canvasDirty.current = true;
    setView((v) => ({ ...v, hp: s.hp, legs: "panic" }));
  };

  const onHit = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    // the swarm takes taps first: roaches die by the same pointer
    const rIdx = roachAt(e.clientX, e.clientY);
    if (rIdx >= 0) {
      engine.current?.unlock();
      killRoach(rIdx, e.clientX, e.clientY);
      return;
    }
    if (st.current.mode === "respawn") return;
    engine.current?.unlock();
    applyHit(e.clientX, e.clientY);
  };

  const onKeyHit = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (st.current.mode === "respawn" || st.current.mode === "dying") return;
    engine.current?.unlock();
    // strike where the bug actually is (no pointer coordinates exist)
    applyHit(st.current.x, st.current.y - 22);
  };

  /* ------------------------------ lifecycle ------------------------------ */

  // paints the card HUD (stats grid, lives digits, shield, sfx) from state:
  // the card is static SSR markup - the engine owns its data slots
  useEffect(() => {
    const set = (key: string, val: string) => {
      const el = document.querySelector(`[data-nf-stat="${key}"]`);
      if (el) el.textContent = val;
    };
    set("kills", String(hud.kills));
    set("best", String(hud.best));
    set("total", String(hud.total));
    set("wave", String(hud.wave));
    document.querySelectorAll<HTMLElement>("[data-nf-life]").forEach((el, idx) => {
      el.dataset.dead = idx >= hud.lives ? "1" : "0";
    });
    const sh = document.querySelector<HTMLElement>("[data-nf-shield]");
    if (sh) sh.style.display = hud.shield ? "" : "none";
    const sfxBtn = document.querySelector<HTMLElement>("[data-nf-sfx-btn]");
    if (sfxBtn) sfxBtn.textContent = hud.sfxOn ? "SFX ON" : "SFX OFF";
    // persistent card damage: every eaten life scuffs the frame further
    const card = document.querySelector<HTMLElement>("[data-nf-damage]");
    if (card) {
      card.classList.remove("nf-dmg-1", "nf-dmg-2");
      const dmg = 3 - hud.lives;
      if (dmg >= 1) card.classList.add("nf-dmg-1");
      if (dmg >= 2) card.classList.add("nf-dmg-2");
    }
  }, [hud]);

  useEffect(() => {
    dead.current = false;
    coarse.current = window.matchMedia("(pointer: coarse)").matches;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setIsTouch(coarse.current);
    engine.current = new SfxEngine();

    // SFX toggle lives inside the card's corner slot (DOM-injected: the card
    // is static SSR markup owned by the engine)
    const slot = document.querySelector("[data-nf-sfx-slot]");
    if (slot) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.nfSfxBtn = "1";
      btn.setAttribute("aria-label", "SFX on/off");
      btn.className =
        "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-sky-300 transition hover:text-sky-200";
      btn.textContent = "SFX ON";
      btn.addEventListener("click", () => {
        const eng = engine.current;
        if (!eng) return;
        eng.unlock();
        eng.setEnabled(!eng.enabled);
        btn.textContent = eng.enabled ? "SFX ON" : "SFX OFF";
        setHud((h) => ({ ...h, sfxOn: eng.enabled }));
      });
      slot.appendChild(btn);
    }
    // mp3s lazy-load on the first pointer gesture (unlock -> preload); until
    // they decode, the synthesized fallback voices cover the game audibly -
    // saves ~136KB of fetches on every 404 view, muted users included
    setHud((h) => ({ ...h, sfxOn: engine.current?.enabled ?? true }));

    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);

    // canvas ignores var() inside ctx.font - resolve the mono family once
    try {
      const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-code").trim();
      codeFont.current = fam ? `${fam}, ui-monospace, monospace` : "ui-monospace, monospace";
    } catch {
      /* keep the fallback family */
    }

    // session best from a previous visit
    try {
      const savedBest = parseInt(localStorage.getItem(BEST_KEY) ?? "", 10) || 0;
      best.current = savedBest;
      if (savedBest > 0) setHud((h) => ({ ...h, best: savedBest }));
    } catch {
      /* private mode */
    }

    // lifetime kills + unlocked skin from previous visits
    try {
      total.current = parseInt(localStorage.getItem(TOTAL_KEY) ?? "", 10) || 0;
      if (total.current > 0) setHud((h) => ({ ...h, total: total.current }));
    } catch {
      /* private mode */
    }
    applySkin(skinFor(total.current).color);

    // all-time world record across every visitor (de-personalized)
    void fetch("/api/nf-record")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { record?: number } | null) => {
        if (j && typeof j.record === "number" && j.record > 0) {
          worldRec.current = j.record;
          paintWorld();
        }
      })
      .catch(() => {
        /* offline - the row stays at its placeholder */
      });

    // bug #1 crawls out from under the 404 card right away
    spawnBug();

    const tick = (now: number) => {
      if (dead.current) return;
      try {
        const dt = Math.min((now - last.current) / 1000, 0.05);
        last.current = now;
        // kill hit-stop: movement stops and particles hang (dt=0) while rings
        // keep expanding on wall-clock time - reads as a heavy impact
        const frozen = now < hitStopUntil.current;
        // freeze power-up: every bug slows to a crawl (movement pauses whole)
        const chilled = now < frozenUntil.current;
        if (!reduced.current && !frozen && !chilled) {
          const s = st.current;
          // a bug past its patience loses it and hunts the 404 card for a bite
          if ((s.mode === "idle" || s.mode === "panic" || s.mode === "peek") && now >= s.biteAt) {
            s.mode = "hunt";
            setView((v) => (v.legs === "step" ? v : { ...v, legs: "step" }));
            showPhrase(HUNT_CLOUD[langRef.current], s.x, s.y, "#FBBF24");
          }
          if (s.mode === "panic") stepPanic(dt, now);
          else if (s.mode === "peek") stepPeek(dt);
          else if (s.mode === "idle" && now >= s.wanderAt) startWander();
          else if (s.mode === "hunt") stepHunt(dt);
          // typed abilities (ghost teleport / lightning hop) only fire while
          // the bug is alive and the board is not frozen; reduced motion
          // players get a calmer board - abilities stay off there
          if (s.mode !== "dying" && s.mode !== "respawn") {
            if (s.type === "ghost" && now >= s.abilityAt) {
              s.abilityAt = now + BALANCE.ghostTpEvery * 1000;
              ghostTeleport();
            } else if (s.type === "lightning" && now >= s.abilityAt) {
              s.abilityAt = now + BALANCE.lightningEvery * 1000;
              lightningHop();
            }
          }
        }
        // the boss swarm runs on its own clock: freeze stops it, reduced
        // motion keeps roaches static (they never bite there, just get tapped)
        if (!reduced.current && !chilled && roaches.current.length > 0) {
          stepSwarm(dt);
        }
        positionBug();
        renderFx(frozen ? 0 : dt, now);
      } catch (e) {
        // fail-soft: a render hiccup (canvas, DOM) skips the frame but the
        // loop must never die - a dead loop is a frozen, unclickable bug
        if (!tickErrorLogged.current) {
          tickErrorLogged.current = true;
          console.error("[bug] frame skipped:", e);
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      dead.current = true;
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", onResize);
      for (const id of timers.current) clearTimeout(id);
      timers.current.clear();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  /* ------------------------------ render ------------------------------ */

  // hitbox per enemy type; touch gets a bigger target (fingers miss squares)
  const hitSize = hitSizeFor(view.type, isTouch);
  const half = hitSize / 2;

  return (
    <>
      {/* z-0: diagnostic radar backdrop */}
      <div className="nf-radar" aria-hidden="true">
        <div className="nf-radar-sweep" />
        <div className="nf-radar-ring" style={{ width: "46vmin", height: "46vmin" }} />
        <div className="nf-radar-ring" style={{ width: "78vmin", height: "78vmin" }} />
        <div className="nf-radar-ring" style={{ width: "112vmin", height: "112vmin" }} />
      </div>

      {/* z-20: fx canvas, never interactive */}
      <canvas
        ref={canvasEl}
        className="pointer-events-none fixed inset-0 z-20 h-full w-full"
        aria-hidden="true"
      />

      {/* z-30: the bug itself (wrapper is a 0x0 anchor moved by transform) */}
      <div
        ref={bugEl}
        className="fixed left-0 top-0 z-30 h-0 w-0 will-change-transform"
        style={{ opacity: 0 }}
      >
        <div
          ref={hitbox}
          className="nf-hitbox pointer-events-auto absolute cursor-crosshair touch-none select-none"
          style={{ width: hitSize, height: hitSize, marginLeft: -half, marginTop: -half }}
          onPointerDown={onHit}
          onKeyDown={onKeyHit}
          role="button"
          tabIndex={0}
          aria-label={`${TYPE_NAMES[lang][view.type]}. ${A11Y_SUFFIX[lang]} - HP ${view.hp}/${view.maxHp}`}
        >
          {/* boss HP readout stays OUTSIDE the rotator: level while the bug
              turns, and pointer-events-none so it never eats clicks */}
          {view.boss && (
            <div
              className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
              style={{ top: -(half + 26), width: 104 }}
            >
              <div className="flex w-full items-center justify-between px-0.5 font-mono text-[11px] font-bold uppercase tracking-widest">
                <span className="text-[#FF2E5B]">BOSS // 500</span>
                <span className="text-slate-300">
                  {view.hp}/{view.maxHp}
                </span>
              </div>
              <div
                className="relative mt-1 h-2.5 w-full overflow-hidden rounded-sm border bg-slate-950/90 p-[2px]"
                style={{ borderColor: "rgba(255,46,91,0.53)", boxShadow: "0 0 10px rgba(255,46,91,0.25)" }}
              >
                <div
                  className="h-full rounded-[1px] transition-all duration-300 ease-out"
                  style={{
                    width: `${(view.hp / view.maxHp) * 100}%`,
                    background: "linear-gradient(90deg, rgba(255,46,91,0.8), #FF2E5B)",
                    boxShadow: "0 0 8px #FF2E5B",
                  }}
                />
                <div className="pointer-events-none absolute inset-0 flex">
                  {Array.from({ length: Math.min(12, view.maxHp) }).map((_, idx) => (
                    <div key={idx} className="h-full flex-1 border-r border-slate-950/70 last:border-r-0" />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bugRot} className="grid h-full w-full place-items-center">
            {/* the authored bug's body centre sits ~7 units BELOW the viewBox
                centre (tail segment), so the svg is nudged up to meet the
                rotation pivot - otherwise the bug wobbles while turning */}
            <div ref={svgFlash} className="mt-[-5px]">
              <CyberBugSvg
                hp={view.hp}
                maxHp={view.maxHp}
                isBoss={view.boss}
                label={BUG_TYPES[view.type].label}
                mode={view.legs === "idle" ? "idle" : "walk"}
                width={BUG_TYPES[view.type].width}
                showHpBar={false}
                accentOverride={
                  view.type === "boss"
                    ? undefined
                    : view.type === "normal"
                      ? skinColor || undefined
                      : BUG_TYPES[view.type].accent
                }
                ariaHidden
              />
            </div>
          </div>
        </div>
      </div>

      {/* z-40: phrase clouds + kill toasts, pointer-events none everywhere */}
      <div ref={phraseLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="true" />
      <div ref={toastLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="true" />

      {/* boss-kill white flash + bite red flash + freeze tint (opacity-only) */}
      <div ref={bossFlashEl} className="nf-boss-flash" aria-hidden="true" />
      <div ref={redEl} className="nf-red-flash" aria-hidden="true" />
      <div ref={freezeEl} className="nf-freeze-tint" aria-hidden="true" />

      {/* tappable power-up drops (~15% of kills leave one for 6s) */}
      <div ref={dropLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="false" />

      {/* screenreader mirror of the kill toasts (DOM toasts are silent) */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </div>

      {/* game over: the bugs ate all three 404 lives */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/75 px-4 text-center backdrop-blur-sm">
          <div className="cb-critical-label font-display text-[56px] font-extrabold leading-none text-red-400 drop-shadow-[0_0_30px_rgba(248,113,113,0.5)] sm:text-[72px]">
            {GAMEOVER[lang].title}
          </div>
          <p className="max-w-sm font-mono text-[13px] text-slate-300">{GAMEOVER[lang].sub}</p>
          <p className="font-mono text-[15px] font-bold text-slate-100">
            {GAMEOVER[lang].score}: {hud.kills} · {GAMEOVER[lang].best}: {hud.best}
          </p>
          <button
            type="button"
            onClick={restartGame}
            className="appseal-glass-card pointer-events-auto rounded-xl px-6 py-3 font-mono text-sm font-bold text-emerald-300 transition hover:text-emerald-200"
          >
            {GAMEOVER[lang].restart}
          </button>
        </div>
      )}
    </>
  );
}
