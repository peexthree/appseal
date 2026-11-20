import type { Lang } from "@/lib/scanner/types";

/**
 * Balance, phrase pools and pure geometry helpers for the 404 cyber-bug
 * easter egg. Everything here is DOM-free so the test suite can import it
 * directly (node --test + strip-types) - the DOM/canvas side lives in
 * CyberBugEasterEgg.tsx, the SVG rig in CyberBugSvg.tsx.
 */

/* ------------------------------- balance ------------------------------- */

export const BALANCE = {
  hpDesktop: 3,
  hpTouch: 2,
  hpBossDesktop: 5,
  hpBossTouch: 4,
  // panic escape, px/s; wounded bugs feel agony but stay catchable
  panicSpeed: 330,
  panicSpeedWounded: 375,
  // erratic direction changes, seconds
  turnMin: 0.2,
  turnMax: 0.4,
  // peeking return crawl
  peekSpeed: 42,
  peekDistMin: 70,
  peekDistMax: 120,
  // pause between splat and the next bug crawling out
  respawnMin: 2.0,
  respawnMax: 2.2,
  // reaction cloud above the bug on the first click
  cloudLife: 0.85,
  // kill toast on screen
  toastLife: 2.9,
  // slime stain lifetime on the canvas
  splatKeepMin: 12,
  splatKeepMax: 15,
  // particle counts: normal / boss splat
  particlesNormal: [28, 32] as const,
  particlesBoss: [45, 55] as const,
  // intermediate-hit splash
  splashMin: 6,
  splashMax: 10,
  // wounded bug drip interval while escaping
  trailEvery: 0.12,
  // every Nth kill respawns as the boss
  bossEvery: 5,
  // viewport padding the bug keeps while panicking (and under the header)
  margin: 48,
  headerSafe: 76,
} as const;

export function hpFor(isCoarse: boolean, boss: boolean): number {
  if (boss) return isCoarse ? BALANCE.hpBossTouch : BALANCE.hpBossDesktop;
  return isCoarse ? BALANCE.hpTouch : BALANCE.hpDesktop;
}

export function particleCount(boss: boolean, rand: () => number = Math.random): number {
  const [lo, hi] = boss ? BALANCE.particlesBoss : BALANCE.particlesNormal;
  return lo + Math.floor(rand() * (hi - lo + 1));
}

export function splashCount(rand: () => number = Math.random): number {
  return BALANCE.splashMin + Math.floor(rand() * (BALANCE.splashMax - BALANCE.splashMin + 1));
}

/* --------------------------- fx palette (canvas) --------------------------- */

export type ParticleKind = "meat" | "shard" | "chip" | "spark" | "code";

export interface FxPalette {
  meat: string;
  slime: string;
  shell: string;
  shardEdge: string;
  spark: string;
  chipBody: string;
  chipPin: string;
  ring: string;
}

export const FX_NORMAL: FxPalette = {
  meat: "#39FF14",
  slime: "rgba(57, 255, 20, 0.5)",
  shell: "#1f2735",
  shardEdge: "#39FF14",
  spark: "#22d3ee",
  chipBody: "#0b0f18",
  chipPin: "#fbbf24",
  ring: "#39FF14",
};

export const FX_BOSS: FxPalette = {
  meat: "#ff4d7d",
  slime: "rgba(255, 46, 91, 0.55)",
  shell: "#160a12",
  shardEdge: "#FF2E5B",
  spark: "#ff8fa8",
  chipBody: "#140810",
  chipPin: "#fbbf24",
  ring: "#FF2E5B",
};

export const CODE_FRAGMENTS = ["null", "NaN", "</div>", ";", "404", "0x00", "{err}"] as const;

/* ------------------------------ phrase pools ------------------------------ */

export interface KillPhrase {
  text: string;
  /** boss = crimson frame, achievement = softly highlights the home CTA */
  tone?: "info" | "boss" | "achievement";
}

const KILL_SPECIALS: Record<Lang, Record<number, KillPhrase>> = {
  ru: {
    1: { text: "Минус один баг. Страница всё ещё 404, но стало спокойнее" },
    2: { text: "Опять полезли! Кто забыл почистить кэш?" },
    3: { text: "Зелёная жижа разъедает CSS, осторожнее!" },
    4: { text: "Вы вошли во вкус. Может, вам в QA?" },
    5: { text: "БОСС 500 ПОВЕРЖЕН! Продакшен спасён (наверное)", tone: "boss" },
    10: { text: "ДОСТИЖЕНИЕ: Дезинсектор Продакшена. Может, уже на главную?", tone: "achievement" },
  },
  en: {
    1: { text: "One bug down. The page is still 404, but it feels calmer" },
    2: { text: "They're crawling out again! Who forgot to clear the cache?" },
    3: { text: "The green ooze eats CSS - careful!" },
    4: { text: "You're getting the hang of it. QA is hiring, by the way" },
    5: { text: "BOSS 500 DEFEATED! Production saved (probably)", tone: "boss" },
    10: { text: "ACHIEVEMENT: Production Exterminator. Homepage time?", tone: "achievement" },
  },
};

const RANDOM_KILLS: Record<Lang, string[]> = {
  ru: [
    "Это был не баг, а фича...",
    "Бэкендер плачет в углу",
    "Хватит, у них там семьи",
    "200 OK (исправлено вручную)",
    "Внимание: превышен лимит дезинсекции",
    "Кто-нибудь видел Олега?",
  ],
  en: [
    "That wasn't a bug, it was a feature...",
    "A backend dev is crying in a corner",
    "Stop - they have families",
    "200 OK (fixed manually)",
    "Warning: disinsection quota exceeded",
    "Has anyone seen Oleg?",
  ],
};

/**
 * Phrase for the Nth splat: fixed lines for milestones 1-5 and 10, a random
 * line afterwards. `prevRandom` is the last random index used, so the pool
 * never repeats itself twice in a row; returns the new index to carry over.
 */
export function killPhraseFor(
  kills: number,
  lang: Lang,
  prevRandom: number,
  rand: () => number = Math.random,
): { phrase: KillPhrase; randomIndex: number } {
  const special = KILL_SPECIALS[lang][kills];
  if (special) return { phrase: special, randomIndex: prevRandom };
  const pool = RANDOM_KILLS[lang];
  let idx = Math.floor(rand() * pool.length);
  if (pool.length > 1 && idx === prevRandom) idx = (idx + 1) % pool.length;
  return { phrase: { text: pool[idx] }, randomIndex: idx };
}

const PANIC_CLOUDS: Record<Lang, string[]> = {
  ru: ["Эй!", "Не трогай прод!", "Я фича!", "Отмена!"],
  en: ["Hey!", "Hands off prod!", "I'm a feature!", "Abort!"],
};
const BOSS_CLOUDS: Record<Lang, string[]> = {
  ru: ["НЕ СМЕЙ!"],
  en: ["DON'T YOU DARE!"],
};

export function panicCloud(boss: boolean, lang: Lang, rand: () => number = Math.random): string {
  const pool = boss ? BOSS_CLOUDS[lang] : PANIC_CLOUDS[lang];
  return pool[Math.floor(rand() * pool.length)];
}

/* --------------------------- HUD / UI micro-copy --------------------------- */

export const HUD_LABELS: Record<Lang, { splatted: string; sfx: string }> = {
  ru: { splatted: "БАГОВ РАЗДАВЛЕНО", sfx: "SFX" },
  en: { splatted: "BUGS SPLATTED", sfx: "SFX" },
};

/* ----------------------------- pure geometry ----------------------------- */

export interface Viewport {
  w: number;
  h: number;
}

export type Side = "left" | "right" | "top" | "bottom";

export interface PanicBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Roaming box: viewport inset by the margin, extra headroom under the sticky header. */
export function panicBounds(v: Viewport): PanicBounds {
  const m = BALANCE.margin;
  return {
    minX: m,
    maxX: v.w - m,
    minY: BALANCE.headerSafe + 12,
    maxY: v.h - m,
  };
}

export function pickSpawnSide(rand: () => number = Math.random): Side {
  const sides: Side[] = ["left", "right", "top", "bottom"];
  return sides[Math.floor(rand() * sides.length)];
}

export interface SpawnPose {
  /** start point, just outside the viewport on the chosen side */
  x: number;
  y: number;
  /** crawl target, 70-120px inward */
  tx: number;
  ty: number;
  /** movement heading, radians (bug visual rotation is heading + 90deg) */
  heading: number;
}

/**
 * Spawn just past a random edge and crawl 70-120px inward. The top edge
 * starts below the sticky header and the corners are pulled in, so the bug
 * never emerges under the nav or dead in a corner.
 */
export function spawnPose(side: Side, v: Viewport, rand: () => number = Math.random): SpawnPose {
  const dist = BALANCE.peekDistMin + rand() * (BALANCE.peekDistMax - BALANCE.peekDistMin);
  const inset = 64 + rand() * Math.max(24, Math.min(v.w, v.h) / 2 - 128);
  let x: number, y: number, tx: number, ty: number, heading: number;
  switch (side) {
    case "left":
      x = -44;
      y = inset;
      tx = dist;
      ty = y;
      heading = 0;
      break;
    case "right":
      x = v.w + 44;
      y = inset;
      tx = v.w - dist;
      ty = y;
      heading = Math.PI;
      break;
    case "top":
      x = inset;
      y = BALANCE.headerSafe;
      tx = x;
      ty = y + dist;
      heading = Math.PI / 2;
      break;
    default: // bottom
      x = inset;
      y = v.h + 44;
      tx = x;
      ty = v.h - dist;
      heading = -Math.PI / 2;
  }
  return { x, y, tx, ty, heading };
}

/**
 * First spawn of a session: near the bottom-right edge of the 404 card, so
 * the bug reads as "sitting on the card", clamped inside the viewport.
 */
export function cardSpawnPoint(
  card: { left: number; top: number; width: number; height: number },
  v: Viewport,
): { x: number; y: number } {
  const x = card.left + card.width - 56;
  const y = card.top + card.height - 24;
  return {
    x: Math.max(BALANCE.margin, Math.min(v.w - BALANCE.margin, x)),
    y: Math.max(BALANCE.headerSafe, Math.min(v.h - BALANCE.margin, y)),
  };
}

/** Keeps a toast fully inside the window (no clipped text at the edges). */
export function clampToast(x: number, y: number, width: number, height: number, v: Viewport): { x: number; y: number } {
  // a measured toast can exceed a narrow phone - cap it so the clamps stay valid
  const w = Math.min(width, v.w - 24);
  const h = Math.min(height, v.h - BALANCE.headerSafe - 32);
  return {
    x: Math.max(12, Math.min(v.w - w - 12, x - w / 2)),
    y: Math.max(BALANCE.headerSafe + 4, Math.min(v.h - h - 16, y - h / 2)),
  };
}

/** Heading -> on-screen rotation for a top-view bug whose head points up. */
export function headingToRotation(heading: number): number {
  return (heading * 180) / Math.PI + 90;
}
