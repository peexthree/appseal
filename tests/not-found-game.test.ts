import test from "node:test";
import assert from "node:assert/strict";
import {
  A11Y_SUFFIX,
  BALANCE,
  BOSS_RANDOM_KILLS,
  BUG_TYPES,
  POWERUPS,
  RANDOM_KILLS,
  SKINS,
  TYPE_NAMES,
  WAVE_ANNOUNCE,
  WEEKEND_KILLS,
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
  swarmSpawnPoint,
  SWARM_ANNOUNCE,
  SWARM_BITE_COOLDOWN,
  SWARM_CHARGED,
  SWARM_ROACH_SPEED,
  SWARM_ROACH_SPEED_CHARGED,
  SWARM_SIZE,
  SWARM_VICTORY,
  turnToward,
  typeSpeedFor,
  unlockedTypes,
  walkCycleFor,
  wanderTarget,
  waveFor,
  waveSpeedFor,
} from "../src/components/not-found/constants.ts";

/**
 * Pure logic of the 404 cyber-bug easter egg: balance table (HP by device
 * and boss tier), milestone phrase routing with the no-immediate-repeat
 * rule, and the spawn/toast geometry helpers that must keep every floating
 * element inside the viewport (no clipped toasts on mobile).
 */

/* -------------------------------- balance -------------------------------- */

test("hpForType: desktop/touch hp per enemy type", () => {
  assert.equal(hpForType("normal", false), 3);
  assert.equal(hpForType("normal", true), 2);
  assert.equal(hpForType("boss", false), 5);
  assert.equal(hpForType("boss", true), 4);
  assert.equal(hpForType("spawnling", false), 1);
  assert.equal(hpForType("tank", false), 7);
  assert.equal(hpForType("tank", true), 5);
});

test("hitSizeFor: per-type hitboxes, touch always bigger", () => {
  assert.equal(hitSizeFor("normal", false), BUG_TYPES.normal.hitSize);
  assert.equal(hitSizeFor("normal", true), BUG_TYPES.normal.hitSizeTouch);
  assert.equal(hitSizeFor("boss", false), 150);
  assert.equal(hitSizeFor("boss", true), 180);
  assert.equal(hitSizeFor("spawnling", false), 64);
  // touch targets are never smaller than the desktop ones
  for (const t of Object.keys(BUG_TYPES) as Array<keyof typeof BUG_TYPES>) {
    assert.ok(BUG_TYPES[t].hitSizeTouch >= BUG_TYPES[t].hitSize, `${t} touch hitbox too small`);
    assert.ok(BUG_TYPES[t].hpTouch <= BUG_TYPES[t].hpDesktop, `${t} touch hp too high`);
    assert.match(BUG_TYPES[t].accent, /^#[0-9a-fA-F]{6}$/, `${t} accent not a hex color`);
    assert.ok(BUG_TYPES[t].panicSpeed >= 100, `${t} panic speed too low`);
  }
});

test("typeSpeedFor composes type base, wounded, rage, wave and touch", () => {
  // normal desktop wave 1 full hp = base
  assert.equal(typeSpeedFor("normal", 3, 3, 0, false), BUG_TYPES.normal.panicSpeed);
  // wounded sprint at 1 hp
  assert.equal(typeSpeedFor("normal", 1, 3, 0, false), Math.round(BUG_TYPES.normal.panicSpeed * BALANCE.woundedMult));
  // boss rage at hpRatio <= 0.35
  const bossRage = typeSpeedFor("boss", 1, 5, 0, false);
  assert.ok(bossRage > BUG_TYPES.boss.panicSpeed * BALANCE.woundedMult, "boss must rage at 1/5 hp");
  // berserk flash: 2.6x at 1/2 hp
  const berserk = typeSpeedFor("berserk", 1, 2, 0, false);
  assert.ok(berserk > 600, `berserk must flash past 600 px/s, got ${berserk}`);
  // wave escalation
  assert.ok(typeSpeedFor("normal", 3, 3, 40, false) > typeSpeedFor("normal", 3, 3, 0, false), "wave 5 must be faster");
  // touch slowdown
  assert.ok(typeSpeedFor("normal", 3, 3, 0, true) < BUG_TYPES.normal.panicSpeed, "touch must be slower");
  // tank crawls
  assert.equal(typeSpeedFor("tank", 7, 7, 0, false), BUG_TYPES.tank.panicSpeed);
});

test("skins unlock at 0/10/25/50 lifetime kills", () => {
  assert.equal(SKINS.length, 4);
  assert.equal(skinFor(0).color, "#39FF14");
  assert.equal(skinFor(9).color, "#39FF14");
  assert.equal(skinFor(10).color, "#38BDF8");
  assert.equal(skinFor(24).color, "#38BDF8");
  assert.equal(skinFor(25).color, "#A855F7");
  assert.equal(skinFor(49).color, "#A855F7");
  assert.equal(skinFor(50).color, "#FBBF24");
  assert.equal(skinFor(999).color, "#FBBF24");
});

test("respawn window leaves room for the victory beat", () => {
  assert.ok(BALANCE.respawnMin >= 2.5, "respawn must not rush the flatten");
  assert.ok(BALANCE.respawnMax > BALANCE.respawnMin);
  assert.ok(BALANCE.flattenMs < BALANCE.respawnMin * 1000);
});

test("particleCount stays inside the spec ranges", () => {
  for (let i = 0; i < 200; i++) {
    const n = particleCount(false);
    assert.ok(n >= 28 && n <= 32, `normal splat ${n} outside 28..32`);
    const b = particleCount(true);
    assert.ok(b >= 45 && b <= 55, `boss splat ${b} outside 45..55`);
  }
});

test("splashCount stays inside 6..10", () => {
  for (let i = 0; i < 100; i++) {
    const n = splashCount();
    assert.ok(n >= 6 && n <= 10, `splash ${n} outside 6..10`);
  }
});

/* ------------------------------ phrase pools ------------------------------ */

test("killPhraseFor routes milestones 1-5 and 10 to fixed lines (ru)", () => {
  for (const k of [1, 2, 3, 4, 5, 10]) {
    const { phrase, randomIndex } = killPhraseFor(k, "ru", 0);
    assert.ok(phrase.text.length > 5, `kill ${k} must have a fixed line`);
    assert.equal(randomIndex, 0, "specials carry the previous random index over");
  }
  assert.match(killPhraseFor(1, "ru", 0).phrase.text, /Минус один баг/);
  assert.match(killPhraseFor(5, "ru", 0).phrase.text, /БОСС 500/);
  assert.equal(killPhraseFor(5, "ru", 0).phrase.tone, "boss");
  assert.equal(killPhraseFor(10, "ru", 0).phrase.tone, "achievement");
});

test("killPhraseFor adds milestones 15 and 20 (ru+en)", () => {
  for (const k of [15, 20]) {
    const ru = killPhraseFor(k, "ru", 0);
    assert.equal(ru.phrase.tone, "achievement", `kill ${k} ru must be an achievement`);
    assert.ok(ru.phrase.text.length > 5, `kill ${k} ru must have a fixed line`);
    const en = killPhraseFor(k, "en", 0);
    assert.equal(en.phrase.tone, "achievement", `kill ${k} en must be an achievement`);
  }
  assert.match(killPhraseFor(15, "ru", 0).phrase.text, /Старший дезинсектор/);
  assert.match(killPhraseFor(20, "ru", 0).phrase.text, /антивирус/);
});

test("killPhraseFor routes boss kills past milestones to the boss pool", () => {
  // boss kills outside the fixed specials (25/30/50 are milestones now)
  const a = killPhraseFor(35, "ru", 0, -1);
  assert.ok(BOSS_RANDOM_KILLS.ru.includes(a.phrase.text), "kill 35 must draw from the boss pool");
  const b = killPhraseFor(40, "en", 0, -1);
  assert.ok(BOSS_RANDOM_KILLS.en.includes(b.phrase.text), "kill 40 must draw from the boss pool");
  // non-boss kills still draw from the normal pool
  const c = killPhraseFor(36, "ru", 0, -1);
  assert.ok(!BOSS_RANDOM_KILLS.ru.includes(c.phrase.text), "kill 36 must NOT draw from the boss pool");
});

test("killPhraseFor en milestones exist", () => {
  assert.match(killPhraseFor(5, "en", 0).phrase.text, /BOSS 500/);
  assert.match(killPhraseFor(10, "en", 0).phrase.text, /ACHIEVEMENT/);
});

test("phrase pools are sized for 50+ kill sessions", () => {
  assert.equal(RANDOM_KILLS.ru.length, 14);
  assert.equal(RANDOM_KILLS.en.length, 14);
  assert.equal(BOSS_RANDOM_KILLS.ru.length, 10);
  assert.equal(BOSS_RANDOM_KILLS.en.length, 10);
  assert.equal(WEEKEND_KILLS.ru.length, 6);
  assert.equal(WEEKEND_KILLS.en.length, 6);
  // no duplicate lines inside any pool
  for (const pool of [
    RANDOM_KILLS.ru,
    RANDOM_KILLS.en,
    BOSS_RANDOM_KILLS.ru,
    BOSS_RANDOM_KILLS.en,
    WEEKEND_KILLS.ru,
    WEEKEND_KILLS.en,
  ]) {
    assert.equal(new Set(pool).size, pool.length, "pool contains duplicate lines");
  }
});

test("killPhraseFor adds milestones 25, 30 and 50 (ru+en)", () => {
  for (const k of [25, 30, 50]) {
    const ru = killPhraseFor(k, "ru", 0);
    assert.equal(ru.phrase.tone, "achievement", `kill ${k} ru must be an achievement`);
    assert.ok(ru.phrase.text.length > 5, `kill ${k} ru must have a fixed line`);
    const en = killPhraseFor(k, "en", 0);
    assert.equal(en.phrase.tone, "achievement", `kill ${k} en must be an achievement`);
  }
});

test("weekend pool merges into random kills with the no-repeat rule intact", () => {
  // weekday draw never leaves the base pool
  const wd = killPhraseFor(7, "ru", 0, -1, () => 0.99, false);
  assert.ok(RANDOM_KILLS.ru.includes(wd.phrase.text), "weekday draw must use the base pool");
  // weekend draw can land in the weekend pool (deterministic pick)
  const we = killPhraseFor(7, "ru", 0, -1, () => 0.99, true);
  assert.ok(WEEKEND_KILLS.ru.includes(we.phrase.text), "0.99*20 floors to 19 -> weekend line");
  // no immediate repeats over the merged 20-line weekend pool
  let prev = 0;
  let counter = 0;
  for (let i = 0; i < 400; i++) {
    const { randomIndex } = killPhraseFor(7, "ru", prev, -1, () => (counter++ % 20) / 20, true);
    assert.notEqual(randomIndex, prev, "weekend line repeated back-to-back");
    prev = randomIndex;
  }
});

test("killPhraseFor never repeats the same random line twice in a row", () => {
  let prev = -1;
  let counter = 0;
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const { randomIndex } = killPhraseFor(7, "ru", prev, -1, () => (counter++ % 6) / 6, false);
    assert.notEqual(randomIndex, prev, "random line repeated back-to-back");
    seen.add(randomIndex);
    prev = randomIndex;
  }
  // the cycling rand walks 6 distinct lines of the 14-line weekday pool
  assert.equal(seen.size, 6);
});

test("killPhraseFor never repeats the same boss line twice in a row", () => {
  let prevBoss = -1;
  let counter = 0;
  const seen = new Set<number>();
  for (let i = 0; i < 350; i++) {
    const { bossRandomIndex } = killPhraseFor(35, "ru", -1, prevBoss, () => (counter++ % 10) / 10);
    assert.notEqual(bossRandomIndex, prevBoss, "boss line repeated back-to-back");
    seen.add(bossRandomIndex);
    prevBoss = bossRandomIndex;
  }
  // the cycling rand walks the whole 10-line boss pool over 350 draws
  assert.equal(seen.size, 10);
});

test("panicCloud for the boss always comes from the boss pool", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(panicCloud(true, "ru"), "НЕ СМЕЙ!");
    assert.equal(panicCloud(true, "en"), "DON'T YOU DARE!");
  }
  const normal = panicCloud(false, "ru");
  assert.ok(["Эй!", "Не трогай прод!", "Я фича!", "Отмена!"].includes(normal));
});

test("rageCloud draws only from the rage pool", () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(["ЯРОСТЬ!", "РЕЖИМ ЯРОСТИ!"].includes(rageCloud("ru")));
    assert.ok(["ENRAGED!", "RAGE MODE!"].includes(rageCloud("en")));
  }
});

test("TYPE_NAMES + A11Y_SUFFIX cover every enemy type in both languages", () => {
  for (const t of Object.keys(BUG_TYPES) as Array<keyof typeof BUG_TYPES>) {
    assert.ok(TYPE_NAMES.ru[t].length > 3, `ru name for ${t} missing`);
    assert.ok(TYPE_NAMES.en[t].length > 3, `en name for ${t} missing`);
  }
  assert.match(A11Y_SUFFIX.ru, /Enter/);
  assert.match(A11Y_SUFFIX.en, /Enter/);
});

/* --------------------------- waves / progression --------------------------- */

test("waveFor: +1 per 10 kills, capped at 6", () => {
  assert.equal(waveFor(0), 1);
  assert.equal(waveFor(9), 1);
  assert.equal(waveFor(10), 2);
  assert.equal(waveFor(49), 5);
  assert.equal(waveFor(50), 6);
  assert.equal(waveFor(999), 6);
});

test("waveSpeedFor and respawnGapFor escalate within bounds", () => {
  assert.equal(waveSpeedFor(0), 1);
  assert.ok(waveSpeedFor(10) > 1, "wave 2 must be faster");
  assert.ok(waveSpeedFor(50) > waveSpeedFor(10), "wave 6 faster than wave 2");
  // respawn gap shrinks with waves but never below the flatten beat
  for (let k = 0; k <= 60; k += 5) {
    const gap = respawnGapFor(k, (a) => a);
    assert.ok(gap >= 1.3, `wave gap ${gap} at ${k} kills too short`);
    const gapMax = respawnGapFor(k, (_a, b) => b);
    assert.ok(gapMax <= 3.5, `wave gap ${gapMax} at ${k} kills too long`);
  }
});

test("unlockedTypes and pickType follow the wave schedule", () => {
  assert.deepEqual(unlockedTypes(0), ["normal"]);
  assert.deepEqual(unlockedTypes(10), ["normal", "berserk"]);
  assert.deepEqual(unlockedTypes(50), ["normal", "berserk", "ghost", "lightning", "splitter", "tank"]);
  // wave 1 rolls only normals
  for (let i = 0; i < 60; i++) assert.equal(pickType(5), "normal");
  // wave 2+ rolls within the unlocked set
  const allowed = new Set(unlockedTypes(25));
  for (let i = 0; i < 200; i++) assert.ok(allowed.has(pickType(25)), "pickType left the unlocked pool");
  // determinism via injected rand
  assert.equal(pickType(25, () => 0.99), "ghost", "highest weight tail of wave-3 pool");
});

test("wave announcements exist for waves 2-6 in both languages", () => {
  for (const w of [2, 3, 4, 5, 6]) {
    assert.ok(WAVE_ANNOUNCE.ru[w].length > 8, `ru wave ${w} announcement missing`);
    assert.ok(WAVE_ANNOUNCE.en[w].length > 8, `en wave ${w} announcement missing`);
  }
});

/* ----------------------- lives / bites / power-ups ----------------------- */

test("biteAfterFor: patience shrinks with waves, floored at 9s", () => {
  assert.ok(biteAfterFor(0) >= 15, "wave 1 patience generous");
  assert.ok(biteAfterFor(50) >= 9, "endless patience floored");
  assert.ok(biteAfterFor(50) < biteAfterFor(0), "late waves hunt sooner");
  // monotonic non-increasing across the run
  let prev = biteAfterFor(0);
  for (let k = 10; k <= 50; k += 10) {
    assert.ok(biteAfterFor(k) <= prev, "patience must not grow with kills");
    prev = biteAfterFor(k);
  }
});

test("pickPowerup rolls only real kinds, weights honored via injected rand", () => {
  for (let i = 0; i < 100; i++) {
    const k = pickPowerup();
    assert.ok(["bomb", "freeze", "shield"].includes(k), "unknown powerup kind");
  }
  // bomb weight 4/10 -> rand 0.95 lands past bomb+freeze (4+3=7/10)
  assert.equal(pickPowerup(() => 0.95), "shield");
  assert.equal(pickPowerup(() => 0.5), "freeze");
  assert.equal(pickPowerup(() => 0.2), "bomb");
});

test("POWERUPS table: icons, names and weights complete", () => {
  for (const k of ["bomb", "freeze", "shield"] as const) {
    assert.ok(POWERUPS[k].icon.length > 0, `${k} icon missing`);
    assert.ok(POWERUPS[k].name.ru.length >= 3 && POWERUPS[k].name.en.length >= 3, `${k} names missing`);
    assert.ok(POWERUPS[k].weight > 0, `${k} weight missing`);
  }
});

/* --------------------------- boss swarm (wave 6) --------------------------- */

test("swarm constants: size, thresholds and announcements", () => {
  assert.equal(SWARM_SIZE, 24);
  assert.ok(SWARM_CHARGED >= 5 && SWARM_CHARGED < SWARM_SIZE, "charged threshold inside the swarm");
  assert.ok(SWARM_ROACH_SPEED_CHARGED > SWARM_ROACH_SPEED, "charged roaches outrun normal ones");
  assert.match(SWARM_ANNOUNCE.ru, /ПОДКРЕПЛЕНИЕ/);
  assert.match(SWARM_VICTORY.ru, /404/);
  assert.match(SWARM_ANNOUNCE.en, /REINFORCEMENTS/);
});

test("swarm bite tempo: one life per cooldown window, however big the pack", () => {
  assert.ok(SWARM_BITE_COOLDOWN >= 1.2 && SWARM_BITE_COOLDOWN <= 3, "cooldown inside the fair-fight band");
});

test("swarmSpawnPoint: roaches never materialize on top of the glass", () => {
  const makeRand = (seed: number) => () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  // desktop 1440x900: clear radius = max(300, min(vw, vh) * 0.45) = 405
  const clearDesktop = Math.max(300, Math.min(1440, 900) * 0.45);
  assert.equal(clearDesktop, 405);
  for (let i = 0; i < 24; i++) {
    const p = swarmSpawnPoint(1440, 900, 720, 450, i, makeRand(i + 1));
    assert.ok(
      Math.hypot(p.x - 720, p.y - 450) >= clearDesktop - 1e-9,
      `desktop roach ${i} spawned inside the clear radius`,
    );
  }
  // phone 390x844 with the card filling the screen: the 300px floor holds -
  // edge spawns land on the glass otherwise (the instant-game-over bug)
  const clearPhone = Math.max(300, Math.min(390, 844) * 0.45);
  assert.equal(clearPhone, 300);
  for (let i = 0; i < 24; i++) {
    const p = swarmSpawnPoint(390, 844, 195, 420, i, makeRand(i + 31));
    assert.ok(
      Math.hypot(p.x - 195, p.y - 420) >= clearPhone - 1e-9,
      `phone roach ${i} spawned inside the clear radius`,
    );
  }
  // same seed - same board (the spawn helper must be deterministic)
  const first = makeRand(7);
  const second = makeRand(7);
  for (let i = 0; i < SWARM_SIZE; i++) {
    const a = swarmSpawnPoint(1440, 900, 720, 450, i, first);
    const b = swarmSpawnPoint(1440, 900, 720, 450, i, second);
    assert.equal(a.x, b.x, `roach ${i} x differs between equal seeds`);
    assert.equal(a.y, b.y, `roach ${i} y differs between equal seeds`);
  }
});

/* ------------------------------- geometry ------------------------------- */

test("panicBounds clears the header plane and keeps claws on-screen", () => {
  const b = panicBounds({ w: 1440, h: 900 });
  assert.equal(b.minX, BALANCE.margin);
  assert.equal(b.maxX, 1440 - BALANCE.margin);
  assert.equal(b.minY, BALANCE.roamMinY);
  assert.ok(b.minY >= BALANCE.headerSafe + 48, "hitbox half must clear the sticky header");
});

test("cardSpawnPose: newborn bugs start under the card glass and emerge outward", () => {
  const v = { w: 1440, h: 900 };
  const card = { left: 384, top: 170, width: 672, height: 560 };
  const b = panicBounds(v);
  for (let i = 0; i < 300; i++) {
    const p = cardSpawnPose(card, v);
    // start hidden under the glass
    const startInside =
      p.x > card.left &&
      p.x < card.left + card.width &&
      p.y > card.top &&
      p.y < card.top + card.height;
    assert.ok(startInside, `start ${p.x},${p.y} must sit under the card`);
    // target clears the card edge by a visible margin
    const outside =
      p.tx < card.left - 12 ||
      p.tx > card.left + card.width + 12 ||
      p.ty < card.top - 12 ||
      p.ty > card.top + card.height + 12;
    assert.ok(outside, `target ${p.tx},${p.ty} must clear the card edge`);
    // target stays inside the roam box
    assert.ok(
      p.tx >= b.minX && p.tx <= b.maxX && p.ty >= b.minY && p.ty <= b.maxY,
      `target ${p.tx},${p.ty} outside the roam box`,
    );
    // the straight ray from start along heading exits the card
    const mid = { x: p.x + Math.cos(p.heading) * 160, y: p.y + Math.sin(p.heading) * 160 };
    const midOutside =
      mid.x < card.left ||
      mid.x > card.left + card.width ||
      mid.y < card.top ||
      mid.y > card.top + card.height;
    assert.ok(midOutside, "heading must lead out of the card");
  }
});

test("cardSpawnPose: still valid where the card hugs the screen (phone)", () => {
  const v = { w: 375, h: 812 };
  const card = { left: 16, top: 120, width: 343, height: 560 };
  const b = panicBounds(v);
  for (let i = 0; i < 300; i++) {
    const p = cardSpawnPose(card, v);
    const outside =
      p.tx < card.left - 12 ||
      p.tx > card.left + card.width + 12 ||
      p.ty < card.top - 12 ||
      p.ty > card.top + card.height + 12;
    assert.ok(outside, `target ${p.tx},${p.ty} must clear the card even on a phone`);
    assert.ok(
      p.tx >= b.minX && p.tx <= b.maxX && p.ty >= b.minY && p.ty <= b.maxY,
      `target ${p.tx},${p.ty} outside the roam box`,
    );
    // whatever the restricted room, the crawl still moves the bug outward
    const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
    assert.ok(dist >= 16, `crawl ${dist} too short to read as emerging`);
  }
});

test("turnToward turns along the shortest arc and respects the cap", () => {
  assert.equal(turnToward(0, 0.1, 0.5), 0.1, "within the cap snaps to the target");
  assert.equal(turnToward(0, 1, 0.5), 0.5);
  assert.equal(turnToward(0, -1, 0.5), -0.5);
  // wrap-around: from 2.5 to -2.5 the short way runs through pi (gap 1.283 rad)
  assert.ok(Math.abs(turnToward(2.5, -2.5, 0.3) - 2.8) < 1e-9, "must turn through pi");
  assert.ok(Math.abs(turnToward(-2.5, 2.5, 0.3) - -2.8) < 1e-9, "must turn through -pi");
  // a cap that covers the whole gap lands exactly on the target
  assert.equal(turnToward(3, -3, 1), -3);
});

test("walkCycleFor ties the leg cycle to ground speed with clamps", () => {
  const eps = 1e-9;
  // authored anchor: panic speed cycles at the authored base
  assert.ok(Math.abs(walkCycleFor(BALANCE.panicSpeed, false) - BALANCE.walkCycleBase) < eps);
  assert.ok(Math.abs(walkCycleFor(BALANCE.panicSpeed, true) - BALANCE.walkCycleBoss) < eps);
  // wounded sprint shortens the cycle, never below the floor
  const wounded = walkCycleFor(BALANCE.panicSpeedWounded, false);
  assert.ok(wounded < BALANCE.walkCycleBase, "faster legs at wounded sprint");
  assert.ok(walkCycleFor(700, false) >= BALANCE.walkCycleMin, "cycle floors instead of blurring");
  // boss rage: 330 * 1.25 = 412.5 px/s
  const rage = walkCycleFor(BALANCE.panicSpeed * BALANCE.bossRageMult, true);
  assert.ok(rage < BALANCE.walkCycleBoss, "enraged boss scrambles faster than its authored gait");
  // slow crawl stretches the cycle, capped at a deliberate max
  const crawl = walkCycleFor(BALANCE.peekSpeed, false);
  assert.equal(crawl, BALANCE.walkCycleMax, "crawl clamps at the slow deliberate max");
  assert.ok(walkCycleFor(1, false) === BALANCE.walkCycleMax, "degenerate speed never freezes the gait");
});

test("clampToast keeps a wide toast inside a narrow phone", () => {
  const v = { w: 375, h: 812 };
  // oversized measurement: the helper caps the effective width and pins left
  const a = clampToast(187, 400, 420, 60, v);
  const cappedW = v.w - 24;
  assert.equal(a.x, 12, "oversized toast pins to the left edge");
  assert.ok(a.x + cappedW <= v.w - 12, "capped width must fit the screen");
  const b = clampToast(187, 20, 200, 60, v);
  assert.ok(b.y >= BALANCE.headerSafe + 4, "toast must not slide under the header");
  const c = clampToast(187, 790, 200, 60, v);
  assert.ok(c.y + 60 <= v.h - 16, "toast must not overflow the bottom");
});

test("clampToast slides out of the card text block when a card is given", () => {
  const v = { w: 1280, h: 900 };
  const card = { left: 320, top: 100, width: 640, height: 500 };
  // a toast born over the card center slides below the card
  const a = clampToast(640, 300, 300, 60, v, card);
  assert.ok(a.y >= card.top + card.height + 12 - 1, `toast must clear the card bottom, got ${a.y}`);
  // a short viewport with no room below -> it slides above instead
  const v2 = { w: 1280, h: 640 };
  const card2 = { left: 320, top: 120, width: 640, height: 500 };
  const b = clampToast(640, 350, 300, 60, v2, card2);
  assert.ok(b.y + 60 <= card2.top - 12 + 1, `toast must clear the card top, got ${b.y}`);
});

test("headingToRotation maps movement heading to the top-view bug", () => {
  assert.equal(headingToRotation(0), 90, "moving right -> head turned right");
  assert.equal(headingToRotation(-Math.PI / 2), 0, "moving up -> head up");
  assert.equal(headingToRotation(Math.PI / 2), 180, "moving down -> head down");
  assert.equal(headingToRotation(Math.PI), 270, "moving left -> head left");
});

test("wanderTarget keeps the stroll point inside the roaming box", () => {
  const v = { w: 1440, h: 900 };
  for (let i = 0; i < 200; i++) {
    // wander from a corner point: only clamping keeps the target legal
    const t = wanderTarget(100, 100, v);
    const b = panicBounds(v);
    assert.ok(t.tx >= b.minX && t.tx <= b.maxX, `tx ${t.tx} outside the box`);
    assert.ok(t.ty >= b.minY && t.ty <= b.maxY, `ty ${t.ty} outside the box`);
  }
  // long-distance stroll from the center stays within one step of the radius
  const t = wanderTarget(720, 450, v, () => 0.999);
  const b = panicBounds(v);
  const dist = Math.hypot(t.tx - 720, t.ty - 450);
  assert.ok(dist <= BALANCE.wanderDistMax + 1, `stroll ${dist} longer than wanderDistMax`);
});
