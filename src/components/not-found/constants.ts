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
  // crawling out from under the 404 card (px/s) + heading slew while crawling
  peekSpeed: 64,
  peekTurnRate: 9.5,
  peekDistMin: 70,
  peekDistMax: 120,
  // how deep under the card edge a newborn bug starts (px, hidden by the glass)
  spawnInside: 28,
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
  // viewport padding the bug keeps while roaming (body + claws clear the edge)
  margin: 64,
  // real sticky-header height (h-20 = 80px); UI clouds/toasts clamp below it
  headerSafe: 80,
  // roaming floor: header 80 + half the 96px hitbox 48 + gap 4, so the hitbox
  // never hides under the header's click plane
  roamMinY: 132,
  // idle stroll: a settled bug drifts to a nearby point every few seconds
  idleWanderMin: 2.8,
  idleWanderMax: 5.4,
  wanderDistMin: 60,
  wanderDistMax: 140,
  // boss blink-dash: distance from the cursor + rage speed multiplier
  // (engine-side mirror of the SVG rig's isBossEnraged at hpRatio <= 0.35)
  bossRageMult: 1.25,
  bossDashDist: 210,
  // kill hit-stop: the whole board freezes this many ms on a splat
  hitStopMs: 70,
  // leg-cycle duration bounds: authored 0.42s at panicSpeed; slow crawls
  // stretch the cycle (deliberate steps), rage shrinks it (scrambling)
  walkCycleBase: 0.42,
  walkCycleBoss: 0.52,
  walkCycleMin: 0.28,
  walkCycleMax: 1.05,
  // one-time catch hint for players who never clicked the bug
  hintDelay: 5.5,
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
  shell: string;
  shardEdge: string;
  spark: string;
  chipBody: string;
  chipPin: string;
  ring: string;
}

export const FX_NORMAL: FxPalette = {
  meat: "#39FF14",
  shell: "#1f2735",
  shardEdge: "#39FF14",
  spark: "#22d3ee",
  chipBody: "#0b0f18",
  chipPin: "#fbbf24",
  ring: "#39FF14",
};

export const FX_BOSS: FxPalette = {
  meat: "#ff4d7d",
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
    15: { text: "ДОСТИЖЕНИЕ: Старший дезинсектор. Жуки шлют друг другу твой скриншот", tone: "achievement" },
    20: { text: "ДОСТИЖЕНИЕ: Живой антивирус. Ноль незакрытых инцидентов за смену", tone: "achievement" },
  },
  en: {
    1: { text: "One bug down. The page is still 404, but it feels calmer" },
    2: { text: "They're crawling out again! Who forgot to clear the cache?" },
    3: { text: "The green ooze eats CSS - careful!" },
    4: { text: "You're getting the hang of it. QA is hiring, by the way" },
    5: { text: "BOSS 500 DEFEATED! Production saved (probably)", tone: "boss" },
    10: { text: "ACHIEVEMENT: Production Exterminator. Homepage time?", tone: "achievement" },
    15: { text: "ACHIEVEMENT: Senior Exterminator. Bugs now share screenshots of you", tone: "achievement" },
    20: { text: "ACHIEVEMENT: Living Antivirus. Zero open incidents this shift", tone: "achievement" },
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

/** Boss-only kill lines: bosses killed past the fixed milestones (25+). */
export const BOSS_RANDOM_KILLS: Record<Lang, string[]> = {
  ru: [
    "500: нейтрализован. Кластер опустел",
    "Босс упал, мониторинг радостно пищит",
    "Инцидент закрыт без постмортема",
    "Этот был злой. Ты злее",
    "Роллбэк не понадобится",
  ],
  en: [
    "500 neutralized. Cluster is empty",
    "Boss down, monitoring squeaks with joy",
    "Incident closed, no postmortem needed",
    "That one was mean. You are meaner",
    "No rollback required",
  ],
};

/**
 * Phrase for the Nth splat: fixed lines for milestones 1-5, 10, 15 and 20, a
 * random line afterwards. Boss kills (every bossEvery-th) draw from their own
 * pool so long sessions stay fresh. `prevRandom`/`prevBossRandom` are the last
 * indices used per pool, so neither pool repeats itself twice in a row; the
 * new indices are returned to carry over.
 */
export function killPhraseFor(
  kills: number,
  lang: Lang,
  prevRandom: number,
  prevBossRandom: number = -1,
  rand: () => number = Math.random,
): { phrase: KillPhrase; randomIndex: number; bossRandomIndex: number } {
  const special = KILL_SPECIALS[lang][kills];
  if (special) return { phrase: special, randomIndex: prevRandom, bossRandomIndex: prevBossRandom };
  const boss = kills % BALANCE.bossEvery === 0;
  const pool = boss ? BOSS_RANDOM_KILLS[lang] : RANDOM_KILLS[lang];
  const prev = boss ? prevBossRandom : prevRandom;
  let idx = Math.floor(rand() * pool.length);
  if (pool.length > 1 && idx === prev) idx = (idx + 1) % pool.length;
  return boss
    ? { phrase: { text: pool[idx] }, randomIndex: prevRandom, bossRandomIndex: idx }
    : { phrase: { text: pool[idx] }, randomIndex: idx, bossRandomIndex: prevBossRandom };
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

const RAGE_CLOUDS: Record<Lang, string[]> = {
  ru: ["ЯРОСТЬ!", "РЕЖИМ ЯРОСТИ!"],
  en: ["ENRAGED!", "RAGE MODE!"],
};

/** Cloud when the boss blink-dashes away (3rd landed hit). */
export function rageCloud(lang: Lang, rand: () => number = Math.random): string {
  const pool = RAGE_CLOUDS[lang];
  return pool[Math.floor(rand() * pool.length)];
}

/** One-time hint cloud for players who never clicked the bug. */
export const HINT_CLOUD: Record<Lang, string> = {
  ru: "Поймай жука - кликни по нему!",
  en: "Catch the bug - click it!",
};

/** Accessible labels for the splattable bug button (keyboard a11y). */
export const BUG_A11Y: Record<Lang, { bug: string; boss: string }> = {
  ru: {
    bug: "Кибер-жук 404. Enter или пробел - раздавить",
    boss: "Босс-жук 500. Enter или пробел - раздавить",
  },
  en: {
    bug: "Cyber bug 404. Enter or Space to squash",
    boss: "Boss bug 500. Enter or Space to squash",
  },
};

/* --------------------------- HUD / UI micro-copy --------------------------- */

export const HUD_LABELS: Record<Lang, { splatted: string; best: string }> = {
  ru: { splatted: "БАГОВ РАЗДАВЛЕНО", best: "РЕКОРД" },
  en: { splatted: "BUGS SPLATTED", best: "BEST" },
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

/** Roaming box: viewport inset by the margin, floored below the sticky header. */
export function panicBounds(v: Viewport): PanicBounds {
  const m = BALANCE.margin;
  return {
    minX: m,
    maxX: v.w - m,
    minY: BALANCE.roamMinY,
    maxY: v.h - m,
  };
}

export interface SpawnPose {
  /** start point, hidden under the card glass */
  x: number;
  y: number;
  /** crawl target, past the card edge into free space */
  tx: number;
  ty: number;
  /** movement heading, radians (bug visual rotation is heading + 90deg) */
  heading: number;
}

export interface CardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Spawn pose emerging from under the 404 card: the start point sits inside
 * the card (hidden behind the frosted glass while the bug renders below it),
 * the target sits a peekDist beyond the chosen edge, heading points outward.
 * Edges without enough roaming room (a phone card spans nearly the full
 * width) are skipped; the crawl distance shrinks to what the room allows.
 */
export function cardSpawnPose(
  card: CardRect,
  v: Viewport,
  rand: () => number = Math.random,
): SpawnPose {
  const b = panicBounds(v);
  const right = card.left + card.width;
  const bottom = card.top + card.height;
  // free roam room beyond each card edge
  const room: Record<Side, number> = {
    left: card.left - b.minX,
    right: b.maxX - right,
    top: card.top - b.minY,
    bottom: b.maxY - bottom,
  };
  const open = (Object.keys(room) as Side[]).filter((s) => room[s] >= 24);
  const pool = open.length > 0 ? open : (["bottom", "right", "left", "top"] as Side[]);
  const side = pool[Math.floor(rand() * pool.length)];

  const dist = Math.max(
    16,
    Math.min(
      BALANCE.peekDistMin + rand() * (BALANCE.peekDistMax - BALANCE.peekDistMin),
      room[side] - 8,
    ),
  );
  // position along the chosen edge: at least 44px clear of both corners and
  // inside the roam box on the crossing axis
  const along = (lo: number, hi: number, boxLo: number, boxHi: number) => {
    const from = Math.max(lo, boxLo);
    const to = Math.min(hi, boxHi);
    return to <= from ? (from + to) / 2 : from + rand() * (to - from);
  };

  let x: number, y: number, tx: number, ty: number, heading: number;
  switch (side) {
    case "left":
      x = card.left + BALANCE.spawnInside;
      y = along(card.top + 44, bottom - 44, b.minY, b.maxY);
      tx = card.left - dist;
      ty = y;
      heading = Math.PI;
      break;
    case "right":
      x = right - BALANCE.spawnInside;
      y = along(card.top + 44, bottom - 44, b.minY, b.maxY);
      tx = right + dist;
      ty = y;
      heading = 0;
      break;
    case "top":
      x = along(card.left + 44, right - 44, b.minX, b.maxX);
      y = card.top + BALANCE.spawnInside;
      tx = x;
      ty = card.top - dist;
      heading = -Math.PI / 2;
      break;
    default: // bottom
      x = along(card.left + 44, right - 44, b.minX, b.maxX);
      y = bottom - BALANCE.spawnInside;
      tx = x;
      ty = bottom + dist;
      heading = Math.PI / 2;
  }
  return { x, y, tx, ty, heading };
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

/**
 * Rotate `heading` toward `target` along the shortest arc by at most `maxStep`
 * radians. This is what keeps turns smooth: a crawling bug slews its heading
 * instead of snapping to the new direction.
 */
export function turnToward(heading: number, target: number, maxStep: number): number {
  let d = target - heading;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) <= maxStep ? target : heading + Math.sign(d) * maxStep;
}

/**
 * Leg-cycle duration for the current ground speed (px/s): the authored rig
 * cycles at walkCycleBase while sprinting at panicSpeed, faster legs when
 * enraged/wounded, slow deliberate steps while crawling - clamped so an
 * extreme speed never freezes or blurs the gait.
 */
export function walkCycleFor(speed: number, boss: boolean): number {
  const base = boss ? BALANCE.walkCycleBoss : BALANCE.walkCycleBase;
  const cycle = (base * BALANCE.panicSpeed) / Math.max(1, speed);
  return Math.min(BALANCE.walkCycleMax, Math.max(BALANCE.walkCycleMin, cycle));
}

/**
 * Target for an idle stroll: a point 60-140px away in a random direction,
 * clamped into the roaming box so the bug never strolls under the header or
 * off-screen. The bug then crawl-walks there via the peek machinery.
 */
export function wanderTarget(
  x: number,
  y: number,
  v: Viewport,
  rand: () => number = Math.random,
): { tx: number; ty: number } {
  const b = panicBounds(v);
  const ang = rand() * Math.PI * 2;
  const d = BALANCE.wanderDistMin + rand() * (BALANCE.wanderDistMax - BALANCE.wanderDistMin);
  return {
    tx: Math.max(b.minX, Math.min(b.maxX, x + Math.cos(ang) * d)),
    ty: Math.max(b.minY, Math.min(b.maxY, y + Math.sin(ang) * d)),
  };
}
