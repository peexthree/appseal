"use client";

import { useEffect, useRef, useState } from "react";
import { CyberBugSvg } from "./CyberBugSvg";
import { SfxEngine } from "./sfxEngine";
import {
  BALANCE,
  CODE_FRAGMENTS,
  FX_BOSS,
  FX_NORMAL,
  HUD_LABELS,
  cardSpawnPoint,
  clampToast,
  headingToRotation,
  hpFor,
  killPhraseFor,
  panicBounds,
  panicCloud,
  particleCount,
  pickSpawnSide,
  splashCount,
  spawnPose,
  type FxPalette,
  type ParticleKind,
} from "./constants";
import { useLang } from "@/lib/use-lang";

/**
 * Interactive easter egg for the 404: a cyber-bug with a splat-the-bug
 * arcade loop. The 404 page itself must stay fully static (no headers(),
 * no dynamic APIs - see app/not-found.tsx), so this component renders a
 * neutral SSR shell and does all measurement/positioning in effects; the
 * game loop mutates only refs and DOM (zero re-renders per frame).
 */

type BugMode = "idle" | "panic" | "peek" | "respawn";

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
  turnAt: number;
  trailAt: number;
  kills: number;
}

interface Particle {
  kind: ParticleKind;
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

export function CyberBugEasterEgg() {
  const lang = useLang();
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const [view, setView] = useState<BugView>({ boss: false, hp: 3, maxHp: 3, legs: "idle" });
  const [hud, setHud] = useState({ kills: 0, sfxOn: true, visible: false });

  const bugEl = useRef<HTMLDivElement>(null);
  const bugRot = useRef<HTMLDivElement>(null);
  const hitbox = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const phraseLayer = useRef<HTMLDivElement>(null);
  const toastLayer = useRef<HTMLDivElement>(null);

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
    turnAt: 0,
    trailAt: 0,
    kills: 0,
  });
  const vp = useRef({ w: 0, h: 0 });
  const reduced = useRef(false);
  const coarse = useRef(false);
  const engine = useRef<SfxEngine | null>(null);
  const raf = useRef(0);
  const last = useRef(0);
  const dead = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const lastRandom = useRef(-1);

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
    // keep a roaming bug (and its peek target) inside the new bounds
    const s = st.current;
    const b = panicBounds(vp.current);
    s.x = Math.max(b.minX, Math.min(b.maxX, s.x));
    s.y = Math.max(b.minY, Math.min(b.maxY, s.y));
    s.tx = Math.max(24, Math.min(vp.current.w - 24, s.tx));
    s.ty = Math.max(b.minY, Math.min(vp.current.h - 24, s.ty));
  };

  /* --------------------------- fx spawners ---------------------------- */

  const spawnSplash = (x: number, y: number, boss: boolean) => {
    const pal = boss ? FX_BOSS : FX_NORMAL;
    const n = splashCount();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(90, 240);
      particles.current.push({
        kind: Math.random() < 0.6 ? "meat" : "spark",
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
    void pal;
  };

  const spawnTrailDrip = (x: number, y: number, boss: boolean) => {
    const pal = boss ? FX_BOSS : FX_NORMAL;
    particles.current.push({
      kind: "meat",
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
    void pal;
  };

  const spawnExplosion = (x: number, y: number, boss: boolean) => {
    const pal = boss ? FX_BOSS : FX_NORMAL;
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
    void pal;
  };

  const spawnSplatStain = (x: number, y: number, boss: boolean) => {
    const drops: Splat["drops"] = [];
    const n = 10 + Math.floor(Math.random() * 7); // 10-16 drops
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(4, 34);
      drops.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, r: rand(4, 15) });
    }
    const chips: Splat["chips"] = [];
    const cn = 2 + Math.floor(Math.random() * 3); // 2-4 embedded chips
    for (let i = 0; i < cn; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(0, 26);
      chips.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, rot: Math.random() * Math.PI, s: rand(6, 10) });
    }
    splats.current.push({
      x,
      y,
      drops,
      chips,
      born: performance.now(),
      life: rand(BALANCE.splatKeepMin, BALANCE.splatKeepMax) * 1000,
      boss,
    });
    if (splats.current.length > 6) splats.current.shift();
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

    // slime stains: organic blob of drops with gloss + embedded chips
    for (const s of splats.current) {
      const age = now - s.born;
      const fade = age > s.life - 2500 ? Math.max(0, (s.life - age) / 2500) : 1;
      if (fade <= 0) continue;
      const pal = s.boss ? FX_BOSS : FX_NORMAL;
      ctx.globalAlpha = fade;
      for (const d of s.drops) {
        ctx.fillStyle = pal.meat;
        ctx.beginPath();
        ctx.arc(s.x + d.dx, s.y + d.dy, d.r, 0, Math.PI * 2);
        ctx.fill();
        // gloss highlight
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(s.x + d.dx - d.r * 0.28, s.y + d.dy - d.r * 0.3, d.r * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const c of s.chips) {
        ctx.save();
        ctx.translate(s.x + c.dx, s.y + c.dy);
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
      const pal = st.current.boss ? FX_BOSS : FX_NORMAL;
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
        // code fragment
        ctx.fillStyle = pal.meat;
        ctx.font = `${Math.round(p.size)}px var(--font-code), ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillText(CODE_FRAGMENTS[Math.floor(Math.random() * CODE_FRAGMENTS.length)], p.x, p.y);
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
      ctx.strokeStyle = r.boss ? FX_BOSS.ring : FX_NORMAL.ring;
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
    }
    const rotEl = bugRot.current;
    if (rotEl) {
      rotEl.style.transform = `rotate(${headingToRotation(s.heading)}deg)`;
    }
  };

  const stepPanic = (dt: number, now: number) => {
    const s = st.current;
    if (now >= s.turnAt) {
      s.heading += rand(-1.35, 1.35);
      s.turnAt = now + rand(BALANCE.turnMin, BALANCE.turnMax) * 1000;
    }
    const speed = s.hp === 1 ? BALANCE.panicSpeedWounded : BALANCE.panicSpeed;
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
      s.heading = -Math.PI / 2; // settle facing up
      s.mode = "idle";
      setView((v) => ({ ...v, legs: "idle" }));
      return;
    }
    s.heading = Math.atan2(dy, dx);
    s.x += Math.cos(s.heading) * BALANCE.peekSpeed * dt;
    s.y += Math.sin(s.heading) * BALANCE.peekSpeed * dt;
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
    const pos = clampToast(x, y, w, h, vp.current);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    addTimer(() => el.classList.add("nf-out"), (BALANCE.toastLife - 0.5) * 1000);
    addTimer(() => el.remove(), BALANCE.toastLife * 1000);
  };

  const shakeCard = () => {
    if (reduced.current) return;
    const el = document.querySelector("[data-nf-shake]");
    if (!el) return;
    el.classList.remove("nf-shake");
    void el.getBoundingClientRect(); // restart the animation
    el.classList.add("nf-shake");
  };

  const splatBug = (atX: number, atY: number) => {
    const s = st.current;
    s.kills += 1;
    const newKills = s.kills;
    const boss = s.boss;
    engine.current?.play("splat", boss);

    spawnExplosion(s.x, s.y, boss);
    spawnSplatStain(s.x, s.y, boss);
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

    // milestone / random kill phrase
    const { phrase, randomIndex } = killPhraseFor(newKills, langRef.current, lastRandom.current);
    lastRandom.current = randomIndex;
    showToast(phrase.text, phrase.tone ?? "info", atX, atY);
    if (phrase.tone === "achievement") {
      document.querySelector("[data-cta-home]")?.classList.add("nf-cta-win");
    }

    // HUD shows up after the first splat
    setHud((h) => ({ kills: newKills, sfxOn: engine.current?.enabled ?? true, visible: true }));

    // hide the bug, pause, then respawn (every 5th bug is the boss)
    s.mode = "respawn";
    if (hitbox.current) hitbox.current.style.pointerEvents = "none";
    setView((v) => ({ ...v, legs: "idle", hp: v.maxHp }));
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
    const pose = spawnPose(pickSpawnSide(), vp.current);
    s.x = pose.x;
    s.y = pose.y;
    s.tx = pose.tx;
    s.ty = pose.ty;
    s.heading = pose.heading;
    s.mode = "peek";
    if (hitbox.current) hitbox.current.style.pointerEvents = "auto";
    setView({ boss, hp: maxHp, maxHp, legs: "step" });
    positionBug();
  };

  const onHit = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = st.current;
    if (s.mode === "respawn" || s.mode === "peek") return;
    engine.current?.unlock();

    const cx = e.clientX;
    const cy = e.clientY;

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

    if (s.hits === 1) {
      // first poke: yelp, cloud, and a mad dash away from the cursor
      s.mode = "panic";
      s.heading = Math.atan2(s.y - cy, s.x - cx) + rand(-0.5, 0.5);
      s.turnAt = performance.now();
      s.trailAt = 0;
      setView((v) => ({ ...v, legs: "panic" }));
      engine.current?.play("panic", s.boss);
      showPhrase(panicCloud(s.boss, langRef.current), s.x, s.y);
    } else {
      engine.current?.play("hit");
    }

    // every intermediate hit sprays sparks and slime
    spawnSplash(cx, cy, s.boss);
    canvasDirty.current = true;
    setView((v) => ({ ...v, hp: s.hp, legs: "panic" }));
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
    engine.current = new SfxEngine();
    // mp3 hit/splat set decodes without a user gesture (OfflineAudioContext),
    // so the recorded sounds are ready by the first click
    engine.current.preload();
    setHud((h) => ({ ...h, sfxOn: engine.current?.enabled ?? true }));

    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);

    // session bug #1 sits on the 404 card edge
    const s = st.current;
    const card = document.querySelector("[data-nf-card]")?.getBoundingClientRect();
    const spot = card
      ? cardSpawnPoint(
          { left: card.left, top: card.top, width: card.width, height: card.height },
          vp.current,
        )
      : { x: vp.current.w * 0.5, y: vp.current.h * 0.5 };
    s.x = spot.x;
    s.y = spot.y;
    s.heading = -Math.PI / 2;
    positionBug();

    const tick = (now: number) => {
      if (dead.current) return;
      const dt = Math.min((now - last.current) / 1000, 0.05);
      last.current = now;
      if (!reduced.current) {
        if (st.current.mode === "panic") stepPanic(dt, now);
        else if (st.current.mode === "peek") stepPeek(dt);
      }
      positionBug();
      renderFx(dt, now);
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

  const hitSize = view.boss ? 128 : 96;
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
        aria-hidden="true"
      >
        <div
          ref={hitbox}
          className="pointer-events-auto absolute cursor-crosshair touch-none select-none"
          style={{ width: hitSize, height: hitSize, marginLeft: -half, marginTop: -half }}
          onPointerDown={onHit}
        >
          <div ref={bugRot} className="grid h-full w-full place-items-center">
            {/* the svg's visual body centre sits above the viewBox centre, so
                nudging it down aligns the shell with the rotation pivot -
                otherwise the bug wobbles around a point below its body */}
            <div className={view.boss ? "mt-[17px] w-[118px]" : "mt-[12px] w-[86px]"}>
              <CyberBugSvg boss={view.boss} hp={view.hp} maxHp={view.maxHp} legs={view.legs} />
            </div>
          </div>
        </div>
      </div>

      {/* z-40: phrase clouds + kill toasts, pointer-events none everywhere */}
      <div ref={phraseLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="true" />
      <div ref={toastLayer} className="pointer-events-none fixed inset-0 z-40" aria-hidden="true" />

      {/* z-40: HUD counter + SFX toggle, appears after the first splat */}
      {hud.visible && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex items-center gap-2">
          <div className="appseal-glass-card rounded-full px-4 py-2 font-mono text-[11px] tracking-wider text-slate-200">
            [ {HUD_LABELS[lang].splatted}: {hud.kills} ]
          </div>
          <button
            type="button"
            onClick={toggleSfx}
            className="appseal-glass-card pointer-events-auto rounded-full px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-sky-300 transition hover:text-sky-200"
          >
            {hud.sfxOn ? "SFX ON" : "SFX OFF"}
          </button>
        </div>
      )}
    </>
  );
}
