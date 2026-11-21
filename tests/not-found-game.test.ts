import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE,
  BUG_A11Y,
  HINT_CLOUD,
  cardSpawnPose,
  clampToast,
  headingToRotation,
  hpFor,
  killPhraseFor,
  panicBounds,
  panicCloud,
  particleCount,
  rageCloud,
  splashCount,
  turnToward,
  wanderTarget,
  BOSS_RANDOM_KILLS,
} from "../src/components/not-found/constants.ts";

/**
 * Pure logic of the 404 cyber-bug easter egg: balance table (HP by device
 * and boss tier), milestone phrase routing with the no-immediate-repeat
 * rule, and the spawn/toast geometry helpers that must keep every floating
 * element inside the viewport (no clipped toasts on mobile).
 */

/* -------------------------------- balance -------------------------------- */

test("hpFor: desktop normal bug takes 3 clicks, touch 2", () => {
  assert.equal(hpFor(false, false), 3);
  assert.equal(hpFor(true, false), 2);
});

test("hpFor: boss takes 5 desktop / 4 touch clicks", () => {
  assert.equal(hpFor(false, true), 5);
  assert.equal(hpFor(true, true), 4);
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
  // kills 25+ are boss kills outside the fixed specials
  const a = killPhraseFor(25, "ru", 0, -1);
  assert.ok(BOSS_RANDOM_KILLS.ru.includes(a.phrase.text), "kill 25 must draw from the boss pool");
  const b = killPhraseFor(30, "en", 0, -1);
  assert.ok(BOSS_RANDOM_KILLS.en.includes(b.phrase.text), "kill 30 must draw from the boss pool");
  // non-boss kills still draw from the normal pool
  const c = killPhraseFor(26, "ru", 0, -1);
  assert.ok(!BOSS_RANDOM_KILLS.ru.includes(c.phrase.text), "kill 26 must NOT draw from the boss pool");
});

test("killPhraseFor en milestones exist", () => {
  assert.match(killPhraseFor(5, "en", 0).phrase.text, /BOSS 500/);
  assert.match(killPhraseFor(10, "en", 0).phrase.text, /ACHIEVEMENT/);
});

test("killPhraseFor never repeats the same random line twice in a row", () => {
  let prev = 0;
  let counter = 0;
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const { randomIndex } = killPhraseFor(7, "ru", prev, -1, () => (counter++ % 6) / 6);
    assert.notEqual(randomIndex, prev, "random line repeated back-to-back");
    seen.add(randomIndex);
    prev = randomIndex;
  }
  // the cycling rand walks the whole 6-line pool over 300 draws
  assert.equal(seen.size, 6);
});

test("killPhraseFor never repeats the same boss line twice in a row", () => {
  let prevBoss = -1;
  let counter = 0;
  const seen = new Set<number>();
  for (let i = 0; i < 250; i++) {
    const { bossRandomIndex } = killPhraseFor(25, "ru", -1, prevBoss, () => (counter++ % 5) / 5);
    assert.notEqual(bossRandomIndex, prevBoss, "boss line repeated back-to-back");
    seen.add(bossRandomIndex);
    prevBoss = bossRandomIndex;
  }
  // the cycling rand walks the whole 5-line boss pool over 250 draws
  assert.equal(seen.size, 5);
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

test("HINT_CLOUD exists for both languages", () => {
  assert.ok(HINT_CLOUD.ru.length > 5);
  assert.ok(HINT_CLOUD.en.length > 5);
});

test("BUG_A11Y labels cover normal and boss bugs", () => {
  assert.match(BUG_A11Y.ru.bug, /Enter/);
  assert.match(BUG_A11Y.ru.boss, /500/);
  assert.match(BUG_A11Y.en.bug, /Enter/);
  assert.match(BUG_A11Y.en.boss, /500/);
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
