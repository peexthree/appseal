import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE,
  cardSpawnPoint,
  clampToast,
  headingToRotation,
  hpFor,
  killPhraseFor,
  panicBounds,
  panicCloud,
  particleCount,
  splashCount,
  spawnPose,
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

test("killPhraseFor en milestones exist", () => {
  assert.match(killPhraseFor(5, "en", 0).phrase.text, /BOSS 500/);
  assert.match(killPhraseFor(10, "en", 0).phrase.text, /ACHIEVEMENT/);
});

test("killPhraseFor never repeats the same random line twice in a row", () => {
  let prev = 0;
  let counter = 0;
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const { randomIndex } = killPhraseFor(7, "ru", prev, () => (counter++ % 6) / 6);
    assert.notEqual(randomIndex, prev, "random line repeated back-to-back");
    seen.add(randomIndex);
    prev = randomIndex;
  }
  // the cycling rand walks the whole 6-line pool over 300 draws
  assert.equal(seen.size, 6);
});

test("panicCloud for the boss always comes from the boss pool", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(panicCloud(true, "ru"), "НЕ СМЕЙ!");
    assert.equal(panicCloud(true, "en"), "DON'T YOU DARE!");
  }
  const normal = panicCloud(false, "ru");
  assert.ok(["Эй!", "Не трогай прод!", "Я фича!", "Отмена!"].includes(normal));
});

/* ------------------------------- geometry ------------------------------- */

test("panicBounds insets the viewport by the margin and clears the header", () => {
  const b = panicBounds({ w: 1440, h: 900 });
  assert.equal(b.minX, BALANCE.margin);
  assert.equal(b.maxX, 1440 - BALANCE.margin);
  assert.ok(b.minY >= BALANCE.headerSafe, "roaming must start below the sticky header");
});

test("spawnPose: all four sides start outside and crawl 70-120px inward", () => {
  const v = { w: 1440, h: 900 };
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const p = spawnPose(side, v, () => 0);
    const startOut =
      side === "left" ? p.x < 0 : side === "right" ? p.x > v.w : side === "top" ? p.y < v.h : p.y > v.h;
    assert.ok(startOut, `${side} spawn must start outside the viewport`);
    const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
    assert.ok(dist >= 69 && dist <= 121, `${side} crawl distance ${dist} outside 70..120`);
    // heading points inward
    const hx = Math.cos(p.heading);
    const hy = Math.sin(p.heading);
    assert.ok(hx * (p.tx - p.x) + hy * (p.ty - p.y) > 0, `${side} heading must point inward`);
  }
});

test("spawnPose top edge never emerges under the sticky header", () => {
  const p = spawnPose("top", { w: 800, h: 900 }, () => 0);
  assert.ok(p.y >= BALANCE.headerSafe, "top spawn must start below the header");
});

test("cardSpawnPoint clamps into the viewport", () => {
  const v = { w: 375, h: 812 };
  const p = cardSpawnPoint({ left: -40, top: 0, width: 460, height: 600 }, v);
  assert.ok(p.x >= BALANCE.margin && p.x <= v.w - BALANCE.margin);
  assert.ok(p.y >= BALANCE.headerSafe && p.y <= v.h - BALANCE.margin);
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
