import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, buildDigestText } from "../src/lib/digest.ts";
import { formatImprovement, detectDegradation } from "../src/lib/watch.ts";
import {
  handleBotInput,
  botWatchDone,
  botWatchLimit,
  type BotState,
} from "../src/lib/telegram-bot.ts";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const WEEK = 7 * 24 * 3600 * 1000;
type Entry = { host: string; grade: string; score: number; ts: number; id: string; desc?: string };

function entry(host: string, grade: string, score: number, ts: number): Entry {
  return { host, grade, score, ts, id: `${host}-${ts}` };
}

describe("buildDigest", () => {
  it("detects improvers, separates named from anonymous", () => {
    const data = buildDigest(
      [
        entry("grown-a.example", "A", 88, NOW - 1000), // newest C->A, named
        entry("grown-a.example", "C", 60, NOW - 3 * 24 * 3600 * 1000),
        entry("grown-sub.example", "B", 70, NOW - 1000), // newest D->B, anonymous
        entry("grown-sub.example", "D", 45, NOW - 2 * 24 * 3600 * 1000),
        entry("stable.example", "B", 70, NOW - 1000),
        entry("stable.example", "B", 70, NOW - 3 * 24 * 3600 * 1000),
      ],
      NOW,
    );
    assert.equal(data.weekScans, 6);
    assert.equal(data.improvers.length, 2);
    assert.equal(data.namedImprovers.length, 1);
    assert.equal(data.namedImprovers[0].host, "grown-a.example");
    assert.equal(data.namedImprovers[0].from, "C");
    assert.equal(data.anonymousImproved, 1);
  });

  it("marks A/A+ newcomers whose first scan happened this week", () => {
    const data = buildDigest(
      [
        entry("new-star.example", "A+", 97, NOW - 1000),
        entry("old-star.example", "A", 90, NOW - 1000),
        entry("old-star.example", "C", 55, NOW - 30 * 24 * 3600 * 1000),
      ],
      NOW,
    );
    assert.equal(data.newA.length, 1);
    assert.equal(data.newA[0].host, "new-star.example");
  });

  it("builds an RU telegram text with fallback when nothing happened", () => {
    const empty = buildDigestText(buildDigest([], NOW), NOW);
    assert.match(empty, /Тишина/);
    const busy = buildDigestText(
      buildDigest([
        entry("grown-a.example", "A", 88, NOW - 1000),
        entry("grown-a.example", "C", 60, NOW - 3 * 24 * 3600 * 1000),
      ], NOW),
      NOW,
    );
    assert.match(busy, /grown-a\.example: C → A/);
    assert.match(busy, /Проверь свой проект/);
  });
});

describe("watch improvement alerts", () => {
  it("formatImprovement describes the jump", () => {
    const text = formatImprovement(
      "a.example",
      { grade: "B", score: 74, fails: 2 },
      { grade: "A", score: 91, fails: 0 },
    );
    assert.match(text, /класс B → A/);
    assert.match(text, /✅/);
  });
  it("detectDegradation still catches drops, not improvements", () => {
    assert.equal(
      detectDegradation({ grade: "A", score: 91, fails: 0 }, { grade: "A+", score: 97, fails: 0 }),
      null,
    );
  });
});

describe("bot /watch flow", () => {
  it("collects the domain inline or via the dialog step", () => {
    const inline = handleBotInput({ stage: "idle" }, "/watch myapp.vercel.app", "ru");
    assert.equal(inline.intent.action, "watch");
    assert.equal((inline.intent as { host?: string }).host, "myapp.vercel.app");

    const prompted = handleBotInput({ stage: "idle" }, "/watch", "en");
    assert.equal(prompted.state.stage, "await_watch_host");

    const done = handleBotInput(prompted.state, "https://www.MySite.com/path", "en");
    assert.equal(done.intent.action, "watch");
    assert.equal((done.intent as { host?: string }).host, "mysite.com");
  });
  it("rejects junk hosts and unwatches", () => {
    const bad = handleBotInput({ stage: "await_watch_host" }, "not a host", "ru");
    assert.equal(bad.intent.action, "reply");
    const off = handleBotInput({ stage: "idle" }, "/unwatch", "ru");
    assert.equal(off.intent.action, "unwatch");
  });
  it("confirmation and limit texts carry the essentials", () => {
    assert.match(botWatchDone("ru", "a.com", "A+"), /Следим за a\.com/);
    assert.match(botWatchDone("en", "a.com"), /Not scanned yet/);
    assert.match(botWatchLimit("ru", 100), /100/);
  });
});
