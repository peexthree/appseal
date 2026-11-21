"use client";

import { useEffect, useRef, useState } from "react";
import { CyberBugSvg } from "./CyberBugSvg";
import { SfxEngine } from "./sfxEngine";
import {
  BALANCE,
  BUG_A11Y,
  CODE_FRAGMENTS,
  FX_BOSS,
  FX_NORMAL,
  HINT_CLOUD,
  HUD_LABELS,
  ONBOARD_HINT,
  SKIN_UNLOCK_LABEL,
  TOTAL_KEY,
  UNLOCKS_KEY,
  cardSpawnPose,
  clampToast,
  headingToRotation,
  hitSizeFor,
  hpFor,
  killPhraseFor,
  panicBounds,
  panicCloud,
  panicSpeedFor,
  particleCount,
  rageCloud,
  skinFor,
  splashCount,
  turnToward,
  walkCycleFor,
  wanderTarget,
  type FxPalette,
  type ParticleKind,
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

type BugMode = "idle" | "panic" | "peek" | "respawn" | "dying";

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
  hits: number;
  /** boss blink-dash armed flag (the SVG rig shows full rage at last HP) */
  raged: boolean;
  turnAt: number;
  trailAt: number;
  /** next idle-stroll timestamp (ms); the tick() wander branch reads this */
  wanderAt: number;
  kills: number;
}

interface Particle {
  kind: ParticleKind;
  /** fx palette tier captured at spawn so mid-flight recolors stay impossible */
  boss: boolean;
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
  boss: boolean;
}

interface Ripple {
  x: number;
  y: number;
  r0: number;
  r1: number;
  born: number;
  life: number;
  boss: boolean;
}

interface BugView {
  boss: boolean;
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

  const [view, setView] = useState<BugView>({ boss: false, hp: 3, maxHp: 3, legs: "idle" });
  // HUD is visible from the first paint: the visitor sees the reward system
  // before the first splat; total/best fill in from localStorage on mount
  const [hud, setHud] = useState({ kills: 0, best: 0, total: 0, sfxOn: true });
  // touch device -> bigger hitbox + slower panic (set once on mount)
  const [isTouch, setIsTouch] = useState(false);
  // aria-live mirror of the last kill toast (DOM toasts are silent to SRs)
  const [live, setLive] = useState("");
  // unlocked carapace skin color; the boss always stays crimson
  const [skinColor, setSkinColor] = useState("");
  // onboarding: pulsing ring + tooltip until the first landed click
  const [onboard, setOnboard] = useState(true);
  const [tip, setTip] = useState(true);

  const bugEl = useRef<HTMLDivElement>(null);
  const bugRot = useRef<HTMLDivElement>(null);
  const hitbox = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const phraseLayer = useRef<HTMLDivElement>(null);
  const toastLayer = useRef<HTMLDivElement>(null);
  const svgFlash = useRef<HTMLDivElement>(null);
  const bossFlashEl = useRef<HTMLDivElement>(null);

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
    hits: 0,
    raged: false,
    turnAt: 0,
    trailAt: 0,
    wanderAt: 0,
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
  const hintShown = useRef(false);
  const hintAt = useRef(0);
  const codeFont = useRef("10px ui-monospace, monospace");
  const best = useRef(0);
  /** lifetime kills across visits (localStorage TOTAL_KEY) */
  const total = useRef(0);
  /** normal-tier palette tinted with the unlocked skin (boss stays FX_BOSS) */
  const skinPal = useRef<FxPalette | null>(null);
  /** kill hit-stop: the loop serves dt=0 until this timestamp passes */
  const hitStopUntil = useRef(0);
  /** last --cb-walk-speed written to the svg (quantized, avoids style churn) */
  const lastCycle = useRef(0);

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

  const spawnSplash = (x: number, y: number, boss: boolean) => {
    const n = splashCount();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(90, 240);
      particles.current.push({
        kind: Math.random() < 0.6 ? "meat" : "spark",
        boss,
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

  const spawnTrailDrip = (x: number, y: number, boss: boolean) => {
    particles.current.push({
      kind: "meat",
      boss,
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

  const spawnExplosion = (x: number, y: number, boss: boolean) => {
    const count = particleCount(boss);
    const boost = boss ? 1.3 : 1;
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
        boss,
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

  const spawnSplatStain = (x: number, y: number, boss: boolean, dir?: number) => {
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
        drawSplatPaint(sctx, drops, chips, boss ? FX_BOSS : FX_NORMAL);
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
      boss,
    });
    if (splats.current.length > BALANCE.splatCap) splats.current.shift();
  };

  /* --------------------------- canvas render --------------------------- */

  const renderFx = (dt: number, now: number) => {
    const canvas = canvasEl.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const hadStuff = particles.current.length > 0 || splats.current.length > 0 || ripples.current.length > 0;
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
        drawSplatPaint(ctx, s.drops, s.chips, s.boss ? FX_BOSS : (skinPal.current ?? FX_NORMAL));
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
      const pal = p.boss ? FX_BOSS : (skinPal.current ?? FX_NORMAL);
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

    // shockwaves
    const rKeep: Ripple[] = [];
    for (const r of ripples.current) {
      const t = (now - r.born) / r.life;
      if (t >= 1) continue;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 2));
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.boss ? FX_BOSS.ring : (skinPal.current?.ring ?? FX_NORMAL.ring);
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
      // while emerging, the bug renders UNDER the frosted card (z 5 < card 10)
      // and reads as a dim silhouette; anywhere else it walks above the page
      const c = cardRect.current;
      const under =
        s.mode === "peek" &&
        c !== null &&
        s.x > c.left &&
        s.x < c.left + c.width &&
        s.y > c.top &&
        s.y < c.top + c.height;
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
      speed = panicSpeedFor(s.hp, s.maxHp, s.boss, coarse.current);
    } else if (s.mode === "peek") {
      const desired = Math.atan2(s.ty - s.y, s.tx - s.x);
      const align = Math.max(0, Math.cos(desired - s.heading));
      speed = BALANCE.peekSpeed * (0.3 + 0.7 * align);
    }
    if (speed > 0) {
      const cycle = Math.round(walkCycleFor(speed, s.boss) * 50) / 50;
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
    const speed = panicSpeedFor(s.hp, s.maxHp, s.boss, coarse.current);
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
      spawnTrailDrip(s.x, s.y, s.boss);
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

  /* ------------------------------ actions ------------------------------ */

  const showPhrase = (text: string, x: number, y: number) => {
    const layer = phraseLayer.current;
    if (!layer) return;
    const el = document.createElement("div");
    el.className =
      "nf-phrase appseal-glass-card absolute whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[11px] font-bold text-slate-100";
    el.textContent = text;
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

  const showToast = (text: string, tone: "info" | "boss" | "achievement", x: number, y: number) => {
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
    // stack offset: a second toast while one is visible slides below it
    const slot = toastCount.current;
    toastCount.current += 1;
    const pos = clampToast(x, y + slot * 52, w, h, vp.current);
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

  /** Skin application: tints particles/stains/ripples + the svg accent. */
  const applySkin = (color: string) => {
    skinPal.current = { ...FX_NORMAL, meat: color, shardEdge: color, ring: color };
    setSkinColor(color);
  };

  const splatBug = (atX: number, atY: number) => {
    const s = st.current;
    s.kills += 1;
    const newKills = s.kills;
    const boss = s.boss;
    engine.current?.play("splat", boss);
    buzz([40, 15, 40]);

    // kill hit-stop: the whole board freezes for a beat (particles hang in
    // mid-air) so the splat lands with weight; skipped under reduced motion
    if (!reduced.current) hitStopUntil.current = performance.now() + BALANCE.hitStopMs;

    spawnExplosion(s.x, s.y, boss);
    // the stain casts away from the strike, reading the impact direction
    spawnSplatStain(s.x, s.y, boss, Math.atan2(s.y - atY, s.x - atX));
    ripples.current.push({
      x: s.x,
      y: s.y,
      r0: 10,
      r1: boss ? 130 : 90,
      born: performance.now(),
      life: 0.5,
      boss,
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
    showToast(phrase.text, phrase.tone ?? "info", atX, atY);
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
      if (!unlocks.includes(newSkin.kills)) unlocks.push(newSkin.kills);
      localStorage.setItem(UNLOCKS_KEY, JSON.stringify(unlocks));
    } catch {
      /* private mode */
    }
    if (newSkin !== prevSkin) {
      showToast(
        `${SKIN_UNLOCK_LABEL[langRef.current]} ${newSkin.name[langRef.current]}`,
        "achievement",
        atX,
        atY,
      );
      ymGoal("nf_skin_unlock");
    }

    setHud((h) => ({
      kills: newKills,
      best: Math.max(h.best, newKills),
      total: total.current,
      sfxOn: engine.current?.enabled ?? true,
    }));

    // screenreader mirror of the kill toast
    setLive(`#${newKills} ${phrase.text}`);

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
    }, rand(BALANCE.respawnMin, BALANCE.respawnMax) * 1000);
  };

  const spawnBug = () => {
    const s = st.current;
    const boss = (s.kills + 1) % BALANCE.bossEvery === 0;
    const maxHp = hpFor(coarse.current, boss);
    s.boss = boss;
    s.maxHp = maxHp;
    s.hp = maxHp;
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
    if (reduced.current) {
      // reduced motion: no crawling - materialize fully visible at the emerge
      // point (this is what kept past-kill respawns invisible forever)
      s.x = pose.tx;
      s.y = pose.ty;
      s.mode = "idle";
      setView({ boss, hp: maxHp, maxHp, legs: "idle" });
    } else {
      s.x = pose.x;
      s.y = pose.y;
      s.mode = "peek";
      setView({ boss, hp: maxHp, maxHp, legs: "step" });
    }
    if (hitbox.current) hitbox.current.style.pointerEvents = "auto";
    // clear death/dash leftovers from the previous bug
    svgFlash.current?.classList.remove("nf-flatten", "nf-squash");
    svgFlash.current?.querySelector("svg")?.classList.remove("cb-pre-dash");
    positionBug();
  };

  /** Shared hit pipeline for pointer and keyboard strikes. */
  const applyHit = (cx: number, cy: number) => {
    const s = st.current;
    if (s.mode === "dying") return;

    // onboarding visuals served their purpose on the first landed click
    setOnboard(false);
    setTip(false);
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
      showPhrase(panicCloud(s.boss, langRef.current), s.x, s.y);
    } else {
      engine.current?.play("hit");
    }

    // boss phase change: after the 3rd landed hit the boss blinks away from
    // the cursor; the SVG rig shows full rage at the last HP point
    if (s.boss && !s.raged && s.hits >= 3) {
      s.raged = true;
      const ang = Math.atan2(s.y - cy, s.x - cx);
      const b = panicBounds(vp.current);
      const nx = Math.max(b.minX, Math.min(b.maxX, s.x + Math.cos(ang) * BALANCE.bossDashDist));
      const ny = Math.max(b.minY, Math.min(b.maxY, s.y + Math.sin(ang) * BALANCE.bossDashDist));
      // telegraph: warning ripple + fast flicker, THEN the blink-dash - the
      // bug never vanishes without a 200ms tell (hitbox stays live meanwhile)
      ripples.current.push({ x: s.x, y: s.y, r0: 4, r1: 24, born: performance.now(), life: 0.3, boss: true });
      ripples.current.push({ x: nx, y: ny, r0: 8, r1: 60, born: performance.now(), life: 0.45, boss: true });
      spawnSplash(s.x, s.y, true);
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
        showPhrase(rageCloud(langRef.current), s.x, s.y);
        canvasDirty.current = true;
      }, BALANCE.preDashMs);
    }

    // every intermediate hit sprays sparks, slime and knocks the bug back
    flashBug();
    spawnSplash(cx, cy, s.boss);
    canvasDirty.current = true;
    setView((v) => ({ ...v, hp: s.hp, legs: "panic" }));
  };

  const onHit = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
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

  const toggleSfx = () => {
    const eng = engine.current;
    if (!eng) return;
    eng.unlock();
    eng.setEnabled(!eng.enabled);
    setHud((h) => ({ ...h, sfxOn: eng.enabled }));
  };

  /* ------------------------------ lifecycle ------------------------------ */

  useEffect(() => {
    dead.current = false;
    coarse.current = window.matchMedia("(pointer: coarse)").matches;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setIsTouch(coarse.current);
    engine.current = new SfxEngine();
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

    // onboarding tooltip fades on its own if the visitor never clicks
    addTimer(() => setTip(false), BALANCE.onboardTipMs);

    // one-time catch hint: armed 5.5s after mount, fires in tick() while
    // the visitor still has zero kills
    hintAt.current = performance.now() + BALANCE.hintDelay * 1000;

    // bug #1 crawls out from under the 404 card right away
    spawnBug();

    const tick = (now: number) => {
      if (dead.current) return;
      const dt = Math.min((now - last.current) / 1000, 0.05);
      last.current = now;
      // kill hit-stop: movement stops and particles hang (dt=0) while rings
      // keep expanding on wall-clock time - reads as a heavy impact
      const frozen = now < hitStopUntil.current;
      if (!reduced.current && !frozen) {
        if (st.current.mode === "panic") stepPanic(dt, now);
        else if (st.current.mode === "peek") stepPeek(dt);
        else if (st.current.mode === "idle" && now >= st.current.wanderAt) startWander();
      }
      // one-time catch hint for players who never clicked the bug
      if (!hintShown.current && st.current.kills === 0 && hintAt.current > 0 && now >= hintAt.current) {
        hintShown.current = true;
        showPhrase(HINT_CLOUD[langRef.current], st.current.x, st.current.y);
      }
      positionBug();
      renderFx(frozen ? 0 : dt, now);
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

  // boss hitbox covers the longer silhouette (tail stabilizers stick out);
  // touch gets a bigger target (fingers miss small squares)
  const hitSize = hitSizeFor(isTouch, view.boss);
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
          aria-label={`${view.boss ? BUG_A11Y[lang].boss : BUG_A11Y[lang].bug} - HP ${view.hp}/${view.maxHp}`}
        >
          {/* onboarding: pulsing ring + tooltip until the first landed click */}
          {onboard && (
            <>
              <div
                className="nf-onboard-ring pointer-events-none absolute inset-0 rounded-full"
                aria-hidden="true"
              />
              {tip && (
                <div
                  className="nf-onboard-tip appseal-glass-card pointer-events-none absolute whitespace-nowrap rounded-full px-3 py-1 font-mono text-[11px] font-bold text-slate-100"
                  style={{ top: -(half + 34) }}
                >
                  {ONBOARD_HINT[lang]}
                </div>
              )}
            </>
          )}
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
                label={view.boss ? "500" : "404"}
                mode={view.legs === "idle" ? "idle" : "walk"}
                width={view.boss ? 84 : 86}
                showHpBar={false}
                accentOverride={view.boss ? undefined : skinColor || undefined}
                ariaHidden
              />
            </div>
          </div>
        </div>
      </div>

      {/* z-40: phrase clouds + kill toasts, pointer-events none everywhere */}
      <div ref={phraseLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="true" />
      <div ref={toastLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="true" />

      {/* boss-kill screen flash (opacity-only, pointer-events none) */}
      <div ref={bossFlashEl} className="nf-boss-flash" aria-hidden="true" />

      {/* screenreader mirror of the kill toasts (DOM toasts are silent) */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </div>

      {/* z-40: HUD counter - visible from the first paint, never hides */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex items-center gap-2">
        <div className="appseal-glass-card flex items-center gap-1.5 rounded-full px-4 py-2 font-mono text-[11px] tracking-wider text-slate-200">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
            <ellipse cx="8" cy="9.6" rx="4" ry="5" fill="#34D399" />
            <circle cx="8" cy="3.6" r="2.3" fill="#34D399" />
            <path
              d="M 4.6 6 L 1.5 4.5 M 4.2 9.5 L 1 9.5 M 4.6 12.5 L 1.8 14 M 11.4 6 L 14.5 4.5 M 11.8 9.5 L 15 9.5 M 11.4 12.5 L 14.2 14"
              stroke="#34D399"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            <rect x="6.9" y="6.6" width="2.2" height="4.6" rx="1" fill="#090d16" opacity="0.55" />
          </svg>
          <span>
            [ {HUD_LABELS[lang].splatted}: {hud.kills} · {HUD_LABELS[lang].total}: {hud.total} ·{" "}
            {HUD_LABELS[lang].best}: {hud.best} ]
          </span>
        </div>
      </div>

      {/* z-40: SFX toggle - always reachable, even before the first splat */}
      <button
        type="button"
        onClick={toggleSfx}
        className="appseal-glass-card pointer-events-auto fixed bottom-4 right-4 z-40 rounded-full px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-sky-300 transition hover:text-sky-200"
      >
        {hud.sfxOn ? "SFX ON" : "SFX OFF"}
      </button>
    </>
  );
}
