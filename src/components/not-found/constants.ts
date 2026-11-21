import type { Lang } from "@/lib/scanner/types";

/**
 * Balance, phrase pools and pure geometry helpers for the 404 cyber-bug
 * easter egg. Everything here is DOM-free so the test suite can import it
 * directly (node --test + strip-types) - the DOM/canvas side lives in
 * CyberBugEasterEgg.tsx, the SVG rig in CyberBugSvg.tsx.
 */

/* ------------------------------- balance ------------------------------- */

export const BALANCE = {
  // panic escape, px/s; the walk-cycle anchor (walkCycleFor) reads these
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
  // hitbox sizes live in BUG_TYPES (per enemy type, desktop/touch variants)
  // touch panic multiplier: same drama, catchable on a phone
  coarsePanicMult: 0.85,
  // wounded sprint multiplier applied on top of the type's panic speed at 1 hp
  woundedMult: 1.14,
  // pause between splat and the next bug crawling out (victory beat included)
  respawnMin: 2.5,
  respawnMax: 3.5,
  // flatten-to-the-floor death animation before the corpse hides
  flattenMs: 300,
  // boss blink-dash windup: flicker + warning ripple before the teleport
  preDashMs: 200,
  // slime stains kept on the board
  splatCap: 8,
  // ghost bug: blink-teleport every N seconds, N ms telegraph before the jump
  ghostTpEvery: 3.0,
  ghostTelegraphMs: 200,
  // lightning bug: evasive hop every N seconds, N ms charge before the hop
  lightningEvery: 2.5,
  lightningChargeMs: 500,
  lightningHop: 150,
  // power-up drops
  dropChance: 0.15,
  dropLifetime: 6,
  bombRadius: 150,
  freezeMs: 3000,
} as const;

/* ----------------------- lives / bites / power-ups ----------------------- */

/** Seconds a bug waits before it loses patience and hunts the 404 card. */
export function biteAfterFor(kills: number): number {
  return Math.max(9, 17 - waveFor(kills) * 1.3);
}

export type PowerupKind = "bomb" | "freeze" | "shield";

export const POWERUPS: Record<PowerupKind, { icon: string; name: Record<Lang, string>; weight: number }> = {
  bomb: { icon: "💣", name: { ru: "БОМБА", en: "BOMB" }, weight: 4 },
  freeze: { icon: "❄️", name: { ru: "ЗАМОРОЗКА", en: "FREEZE" }, weight: 3 },
  shield: { icon: "🛡️", name: { ru: "ЩИТ", en: "SHIELD" }, weight: 3 },
};

export function pickPowerup(rand: () => number = Math.random): PowerupKind {
  const entries = Object.entries(POWERUPS) as Array<[PowerupKind, (typeof POWERUPS)[PowerupKind]]>;
  const total = entries.reduce((s, [, d]) => s + d.weight, 0);
  let roll = rand() * total;
  for (const [k, d] of entries) {
    roll -= d.weight;
    if (roll <= 0) return k;
  }
  return "bomb";
}

export const BITE_PHRASES: Record<Lang, string[]> = {
  ru: ["ЖУК ПРОГРЫЗ СТРАНИЦУ!", "МИНУС КУСОК ЛЕНДИНГА!", "ОН ДОБРАЛСЯ ДО ПРОДА!"],
  en: ["THE BUG ATE THE PAGE!", "THERE GOES A PIECE OF IT!", "IT REACHED PRODUCTION!"],
};

export const SHIELD_BLOCK_PHRASE: Record<Lang, string> = {
  ru: "ЩИТ ПОГЛОТИЛ УКУС",
  en: "SHIELD ABSORBED THE BITE",
};

/** Cloud when a bug loses patience and starts hunting the card. */
export const HUNT_CLOUD: Record<Lang, string> = {
  ru: "Я ИДУ К ТВОЕМУ ПРОДУ!",
  en: "I'M GOING FOR YOUR PROD!",
};

export const POWERUP_TOAST: Record<PowerupKind, Record<Lang, string>> = {
  bomb: { ru: "ВЗРЫВ! ВСЁ РЯДОМ РАЗДАВЛЕНО", en: "BOOM! EVERYTHING NEARBY SPLATTED" },
  freeze: { ru: "ЗАМОРОЗКА НА 3 СЕКУНДЫ", en: "FROZEN FOR 3 SECONDS" },
  shield: { ru: "ЩИТ АКТИВЕН: ОДИН УКУС НЕ СТРАШЕН", en: "SHIELD UP: ONE BITE ABSORBED" },
};

export const GAMEOVER: Record<Lang, { title: string; sub: string; restart: string; score: string; best: string }> = {
  ru: { title: "ИГРА ОКОНЧЕНА", sub: "Баги съели страницу. Страница всё ещё 404...", restart: "НАЧАТЬ СНАЧАЛА", score: "СЧЁТ", best: "РЕКОРД" },
  en: { title: "GAME OVER", sub: "The bugs ate the page. It's still 404...", restart: "PLAY AGAIN", score: "SCORE", best: "BEST" },
};

/* --------------------------- boss swarm (wave 6) --------------------------- */

/** Roaches in the 50-kill swarm event. */
export const SWARM_SIZE = 24;
/** The swarm runs charged while at least this many roaches are alive. */
export const SWARM_CHARGED = 10;
export const SWARM_ROACH_SPEED = 220;
export const SWARM_ROACH_SPEED_CHARGED = 330;
export const SWARM_ROACH_HIT_R = 30;
/** A roach that reaches the card eats a life and vanishes under the glass. */
export const SWARM_BITE_DIST = 10;

export const SWARM_ANNOUNCE: Record<Lang, string> = {
  ru: "О НЕТ. ОНИ ВЫЗВАЛИ ПОДКРЕПЛЕНИЕ.",
  en: "OH NO. THEY CALLED REINFORCEMENTS.",
};

export const SWARM_VICTORY: Record<Lang, string> = {
  ru: "ВЫ ПОБЕДИЛИ ХАОС. НО 404 ВСЁ ЕЩЁ СУЩЕСТВУЕТ...",
  en: "YOU BEAT THE CHAOS. THE 404 REMAINS...",
};

/** A single swarm roach (pure state, drawn on the canvas). */
export interface Roach {
  x: number;
  y: number;
  heading: number;
  /** leg-cycle phase */
  phase: number;
  /** flee direction once the swarm panics */
  fleeAngle: number;
}

/* ------------------------------ enemy types ------------------------------ */

export type BugType =
  | "normal"
  | "boss"
  | "berserk"
  | "ghost"
  | "lightning"
  | "splitter"
  | "spawnling"
  | "tank";

export interface TypeDef {
  /** svg accent + fx tint */
  accent: string;
  hpDesktop: number;
  hpTouch: number;
  /** base panic speed, px/s (wounded/rage/wave/coarse apply on top) */
  panicSpeed: number;
  /** svg width (the boss rig scales 1.4 on top of it) */
  width: number;
  hitSize: number;
  hitSizeTouch: number;
  /** speed multiplier at hpRatio <= 0.35 (berserk flash, boss rage) */
  rageMult: number;
  /** shell engraving */
  label: "404" | "500" | "ERROR";
}

export const BUG_TYPES: Record<BugType, TypeDef> = {
  normal:    { accent: "#39FF14", hpDesktop: 3, hpTouch: 2, panicSpeed: 330, width: 86,  hitSize: 96,  hitSizeTouch: 120, rageMult: 1,    label: "404" },
  boss:      { accent: "#FF2E5B", hpDesktop: 5, hpTouch: 4, panicSpeed: 330, width: 84,  hitSize: 150, hitSizeTouch: 180, rageMult: 1.25, label: "500" },
  berserk:   { accent: "#ef4444", hpDesktop: 2, hpTouch: 2, panicSpeed: 260, width: 86,  hitSize: 96,  hitSizeTouch: 120, rageMult: 2.6,  label: "404" },
  ghost:     { accent: "#38BDF8", hpDesktop: 3, hpTouch: 2, panicSpeed: 300, width: 86,  hitSize: 96,  hitSizeTouch: 120, rageMult: 1,    label: "404" },
  lightning: { accent: "#FBBF24", hpDesktop: 2, hpTouch: 2, panicSpeed: 310, width: 86,  hitSize: 96,  hitSizeTouch: 120, rageMult: 1,    label: "404" },
  splitter:  { accent: "#22C55E", hpDesktop: 3, hpTouch: 2, panicSpeed: 320, width: 86,  hitSize: 96,  hitSizeTouch: 120, rageMult: 1,    label: "404" },
  spawnling: { accent: "#A3E635", hpDesktop: 1, hpTouch: 1, panicSpeed: 380, width: 56,  hitSize: 64,  hitSizeTouch: 84,  rageMult: 1,    label: "404" },
  tank:      { accent: "#94A3B8", hpDesktop: 7, hpTouch: 5, panicSpeed: 120, width: 110, hitSize: 150, hitSizeTouch: 180, rageMult: 1,    label: "ERROR" },
};

export function hpForType(type: BugType, isCoarse: boolean): number {
  const def = BUG_TYPES[type];
  return isCoarse ? def.hpTouch : def.hpDesktop;
}

export function hitSizeFor(type: BugType, isCoarse: boolean): number {
  const def = BUG_TYPES[type];
  return isCoarse ? def.hitSizeTouch : def.hitSize;
}

/**
 * Ground speed of a panicking bug: the type's base speed, wounded sprint at
 * 1 hp, the type's rage multiplier at hpRatio <= 0.35, the wave escalation
 * and the touch slowdown all compose here - one source of truth for the
 * movement code and the gait.
 */
export function typeSpeedFor(type: BugType, hp: number, maxHp: number, kills: number, coarse: boolean): number {
  const def = BUG_TYPES[type];
  let speed = hp === 1 ? def.panicSpeed * BALANCE.woundedMult : def.panicSpeed;
  // rage: hpRatio <= 0.35, or the last wound of a low-hp tier - a berserk
  // at 1/2 hp is at 50% ratio and must still flash
  if (def.rageMult > 1 && maxHp > 0 && (hp / maxHp <= 0.35 || hp === 1)) speed *= def.rageMult;
  speed *= waveSpeedFor(kills);
  if (coarse) speed *= BALANCE.coarsePanicMult;
  return Math.round(speed);
}

/** 1-based wave: +1 per 10 kills, capped at 6 (endless tier). */
export function waveFor(kills: number): number {
  return Math.min(6, Math.floor(kills / 10) + 1);
}

/** Panic speed multiplier per wave - they get angrier every 10 kills. */
export const WAVE_SPEED = [1, 1.12, 1.25, 1.4, 1.55, 1.75] as const;

export function waveSpeedFor(kills: number): number {
  return WAVE_SPEED[waveFor(kills) - 1];
}

/** Respawn gap multiplier per wave - the board fills up faster. */
export const WAVE_GAP = [1, 0.9, 0.8, 0.72, 0.62, 0.55] as const;

export function respawnGapFor(
  kills: number,
  rand: (a: number, b: number) => number = (a, b) => a + Math.random() * (b - a),
): number {
  return rand(BALANCE.respawnMin, BALANCE.respawnMax) * WAVE_GAP[waveFor(kills) - 1];
}

const TYPE_WAVES: Array<[BugType, number]> = [
  ["normal", 1],
  ["berserk", 2],
  ["ghost", 3],
  ["lightning", 4],
  ["splitter", 5],
  ["tank", 6],
];

/** Enemy types unlocked at the current wave (boss is routed separately). */
export function unlockedTypes(kills: number): BugType[] {
  const w = waveFor(kills);
  return TYPE_WAVES.filter(([, at]) => at <= w).map(([t]) => t);
}

const TYPE_WEIGHTS: Record<BugType, number> = {
  normal: 5,
  berserk: 2,
  ghost: 2,
  lightning: 2,
  splitter: 2,
  spawnling: 0,
  tank: 1,
  boss: 0,
};

/** Weighted pick among the unlocked types (spawnlings/boss never roll here). */
export function pickType(kills: number, rand: () => number = Math.random): BugType {
  const pool = unlockedTypes(kills).filter((t) => TYPE_WEIGHTS[t] > 0);
  const total = pool.reduce((s, t) => s + TYPE_WEIGHTS[t], 0);
  let roll = rand() * total;
  for (const t of pool) {
    roll -= TYPE_WEIGHTS[t];
    if (roll <= 0) return t;
  }
  return pool[pool.length - 1];
}

/** One-time announcement when a new wave starts (sparse by wave number). */
export const WAVE_ANNOUNCE: Record<Lang, Record<number, string>> = {
  ru: {
    2: "УРОВЕНЬ 2... ОНИ ЗЛЯТСЯ",
    3: "УРОВЕНЬ 3... ИХ КТО-ТО ТЕЛЕПОРТИРУЕТ ЗА СПИНУ",
    4: "УРОВЕНЬ 4... ЖЁЛТЫЕ МОЛНИИ",
    5: "УРОВЕНЬ 5... ДЕЛИТЕЛИ ПРОРВАЛИСЬ",
    6: "УРОВЕНЬ 6... ТАНКИ НА ПОДХОДЕ",
  },
  en: {
    2: "WAVE 2... THEY'RE ANGRY",
    3: "WAVE 3... SOMEONE TELEPORTS THEM BEHIND YOU",
    4: "WAVE 4... YELLOW LIGHTNING",
    5: "WAVE 5... SPLITTERS BROKE THROUGH",
    6: "WAVE 6... TANKS INBOUND",
  },
};

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

/** FX tint per enemy type (normal/boss keep their dedicated palettes). */
export const FX_BY_TYPE: Record<BugType, FxPalette> = {
  normal: FX_NORMAL,
  boss: FX_BOSS,
  berserk: { ...FX_NORMAL, meat: "#ef4444", shardEdge: "#ef4444", ring: "#ef4444", spark: "#fca5a5" },
  ghost: { ...FX_NORMAL, meat: "#38BDF8", shardEdge: "#38BDF8", ring: "#38BDF8", spark: "#7dd3fc" },
  lightning: { ...FX_NORMAL, meat: "#FBBF24", shardEdge: "#FBBF24", ring: "#FBBF24", spark: "#fde68a" },
  splitter: { ...FX_NORMAL, meat: "#22C55E", shardEdge: "#22C55E", ring: "#22C55E", spark: "#86efac" },
  spawnling: { ...FX_NORMAL, meat: "#A3E635", shardEdge: "#A3E635", ring: "#A3E635", spark: "#d9f99d" },
  tank: { ...FX_NORMAL, meat: "#94A3B8", shardEdge: "#94A3B8", ring: "#94A3B8", spark: "#cbd5e1" },
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
    25: { text: "ДОСТИЖЕНИЕ: Карьерный дезинсектор. QA предлагает тебе зарплату", tone: "achievement" },
    30: { text: "ДОСТИЖЕНИЕ: Легенда продакшена. Жуки уходят в запой при виде курсора", tone: "achievement" },
    50: { text: "ДОСТИЖЕНИЕ: Полсотни жуков. Продакшен блестит как новый", tone: "achievement" },
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
    25: { text: "ACHIEVEMENT: Career Exterminator. QA is offering you a salary", tone: "achievement" },
    30: { text: "ACHIEVEMENT: Production Legend. Bugs flee at the sight of your cursor", tone: "achievement" },
    50: { text: "ACHIEVEMENT: Fifty bugs down. Production shines like new", tone: "achievement" },
  },
};

export const RANDOM_KILLS: Record<Lang, string[]> = {
  ru: [
    "Это был не баг, а фича...",
    "Бэкендер плачет в углу",
    "Хватит, у них там семьи",
    "200 OK (исправлено вручную)",
    "Внимание: превышен лимит дезинсекции",
    "Кто-нибудь видел Олега?",
    "Патч-ноут: \"улучшена стабильность\" (жук удалён)",
    "Деплой откатили, жука тоже",
    "Ушёл в оффлайн. Навсегда",
    "Стектрейс кончился, жук кончился",
    "Жук ушёл на рефакторинг. В никуда",
    "Тикет закрыт: wontfix (жук мёртв)",
    "Кеш почистили вместе с жуком",
    "Сборка зелёная. Жук - нет",
  ],
  en: [
    "That wasn't a bug, it was a feature...",
    "A backend dev is crying in a corner",
    "Stop - they have families",
    "200 OK (fixed manually)",
    "Warning: disinsection quota exceeded",
    "Has anyone seen Oleg?",
    "Patch notes: \"improved stability\" (bug removed)",
    "Deploy rolled back, bug rolled out",
    "Went offline. Permanently",
    "Out of stack trace, out of bug",
    "Bug sent to refactoring. Into the void",
    "Ticket closed as wontfix (bug is dead)",
    "Cache cleared, bug included",
    "Build is green. The bug is not",
  ],
};

/** Saturday/Sunday lines: merged into the random pool on weekends. */
export const WEEKEND_KILLS: Record<Lang, string[]> = {
  ru: [
    "Выходной? Жуки тоже так думали",
    "Суббота, а баги всё равно полезли",
    "Дежурный спрятался, жук спрятался. Теперь жук найден",
    "Воскресенье - идеальный день для дезинсекции",
    "Никто не деплоит в выходные. Жуки - исключение",
    "Отдыхаешь? Жук отдыхал. Теперь не отдыхает",
  ],
  en: [
    "Weekend? The bugs thought so too",
    "Saturday and they still crawled out",
    "The on-call hid, the bug hid. Now the bug is found",
    "Sunday is a perfect day for disinsection",
    "Nobody deploys on weekends. Bugs are the exception",
    "Resting? The bug was resting. Not anymore",
  ],
};

/** True on Saturday/Sunday (local time) - gates the weekend phrase pool. */
export function isWeekendNow(): boolean {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

/** Boss-only kill lines: bosses killed outside the fixed milestones. */
export const BOSS_RANDOM_KILLS: Record<Lang, string[]> = {
  ru: [
    "500: нейтрализован. Кластер опустел",
    "Босс упал, мониторинг радостно пищит",
    "Инцидент закрыт без постмортема",
    "Этот был злой. Ты злее",
    "Роллбэк не понадобится",
    "SLA спасён, дежурный может спать",
    "Босс дропнул редкий лут: спокойствие",
    "Алерт-канал впервые за сутки замолчал",
    "500 больше не отвечает. Никогда",
    "Этот босс был финальным. Теперь ты босс",
  ],
  en: [
    "500 neutralized. Cluster is empty",
    "Boss down, monitoring squeaks with joy",
    "Incident closed, no postmortem needed",
    "That one was mean. You are meaner",
    "No rollback required",
    "SLA saved, the on-call can sleep",
    "Boss dropped rare loot: peace of mind",
    "The alert channel is silent for the first time today",
    "500 no longer responds. Ever",
    "That was the final boss. Now you are the boss",
  ],
};

/**
 * Phrase for the Nth splat: fixed lines for milestones 1-5, 10, 15, 20, 25,
 * 30 and 50, a random line afterwards. Boss kills (every bossEvery-th) draw
 * from their own pool so long sessions stay fresh; on weekends the random
 * pool merges with WEEKEND_KILLS (easter egg inside the easter egg).
 * `prevRandom`/`prevBossRandom` are the last indices used per pool, so
 * neither pool repeats itself twice in a row; the new indices are returned
 * to carry over.
 */
export function killPhraseFor(
  kills: number,
  lang: Lang,
  prevRandom: number,
  prevBossRandom: number = -1,
  rand: () => number = Math.random,
  isWeekend: boolean = isWeekendNow(),
): { phrase: KillPhrase; randomIndex: number; bossRandomIndex: number } {
  const special = KILL_SPECIALS[lang][kills];
  if (special) return { phrase: special, randomIndex: prevRandom, bossRandomIndex: prevBossRandom };
  const boss = kills % BALANCE.bossEvery === 0;
  const normal = RANDOM_KILLS[lang];
  const pool = boss
    ? BOSS_RANDOM_KILLS[lang]
    : isWeekend
      ? [...normal, ...WEEKEND_KILLS[lang]]
      : normal;
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

/** Accessible name per enemy type (keyboard a11y). */
export const TYPE_NAMES: Record<Lang, Record<BugType, string>> = {
  ru: {
    normal: "Кибер-жук 404",
    boss: "Босс-жук 500",
    berserk: "Жук-берсерк",
    ghost: "Жук-призрак",
    lightning: "Жук-молния",
    splitter: "Жук-делитель",
    spawnling: "Малой жук",
    tank: "Жук-танк",
  },
  en: {
    normal: "Cyber bug 404",
    boss: "Boss bug 500",
    berserk: "Berserk bug",
    ghost: "Ghost bug",
    lightning: "Lightning bug",
    splitter: "Splitter bug",
    spawnling: "Small bug",
    tank: "Tank bug",
  },
};

/** Keyboard instruction appended to every hitbox aria-label. */
export const A11Y_SUFFIX: Record<Lang, string> = {
  ru: "Enter или пробел - раздавить",
  en: "Enter or Space to squash",
};

/* --------------------------- HUD / UI micro-copy --------------------------- */

export const HUD_LABELS: Record<Lang, { splatted: string; total: string; wave: string; best: string }> = {
  ru: { splatted: "БАГОВ", total: "ВСЕГО", wave: "ВОЛНА", best: "РЕКОРД" },
  en: { splatted: "BUGS", total: "TOTAL", wave: "WAVE", best: "BEST" },
};

/* ----------------------- persistent progress / skins ----------------------- */

export const TOTAL_KEY = "appseal-bug-total";
export const UNLOCKS_KEY = "appseal-bug-unlocks";

export interface SkinDef {
  kills: number;
  color: string;
  name: Record<Lang, string>;
}

/** Carapace accent unlocked by lifetime kills (CyberBugSvg accentOverride). */
export const SKINS: SkinDef[] = [
  { kills: 0, color: "#39FF14", name: { ru: "Зелёный", en: "Green" } },
  { kills: 10, color: "#38BDF8", name: { ru: "Ледяной", en: "Ice" } },
  { kills: 25, color: "#A855F7", name: { ru: "Плазменный", en: "Plasma" } },
  { kills: 50, color: "#FBBF24", name: { ru: "Золотой", en: "Gold" } },
];

/** The skin for a lifetime kill count: the highest threshold reached. */
export function skinFor(totalKills: number): SkinDef {
  let cur = SKINS[0];
  for (const s of SKINS) if (totalKills >= s.kills) cur = s;
  return cur;
}

export const SKIN_UNLOCK_LABEL: Record<Lang, string> = {
  ru: "НОВЫЙ СКИН ЖУКА:",
  en: "NEW BUG SKIN:",
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
