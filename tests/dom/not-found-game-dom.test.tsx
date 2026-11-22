import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CyberBugEasterEgg } from "@/components/not-found/CyberBugEasterEgg";

/**
 * DOM-level tests for the 404 cyber-bug game (vitest + jsdom; node --test
 * cannot transform JSX). Reduced motion is forced ON by the setup shim, so
 * every landed hit is an instant splat - deterministic, no animation timing.
 */

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** The card lives in not-found.tsx (not in this component) - stub its data
 * slots so the engine's HUD painting has real DOM to write into. */
const mountCardSlots = () => {
  document.body.innerHTML = `
    <div data-nf-card data-nf-damage>
      <span data-nf-life="0">4</span><span data-nf-life="1">0</span><span data-nf-life="2">4</span>
      <span data-nf-stat="kills">0</span>
      <span data-nf-stat="best">0</span>
      <span data-nf-stat="total">0</span>
      <span data-nf-stat="wave">1</span>
      <span data-nf-shield style="display:none"></span>
      <div data-nf-sfx-slot></div>
    </div>`;
};

const stat = (key: string) => document.querySelector(`[data-nf-stat="${key}"]`)?.textContent ?? null;

const hitbox = (name: RegExp) => screen.getByRole("button", { name }) as HTMLElement;

/** One keyboard kill + a full respawn wait (the window is 2.5-3.5s). */
const splatOnce = async () => {
  fireEvent.keyDown(hitbox(/Кибер-жук|Босс-жук/), { key: "Enter" });
  await advance(4000);
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mountCardSlots();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("paints the card HUD slots and injects the SFX toggle before the first kill", () => {
  render(<CyberBugEasterEgg />);
  // the SFX button is injected into the card's slot, which lives on the body
  expect(document.body.textContent).toContain("SFX ON");
  expect(stat("kills")).toBe("0");
  expect(stat("best")).toBe("0");
  expect(stat("total")).toBe("0");
  expect(stat("wave")).toBe("1");
});

it("updates the hitbox aria-label with the current HP", () => {
  render(<CyberBugEasterEgg />);
  expect(hitbox(/HP 3\/3/)).toBeTruthy();
});

it("splats on keyboard Enter and mirrors the kill into the aria-live region", async () => {
  const { container } = render(<CyberBugEasterEgg />);
  fireEvent.keyDown(hitbox(/Кибер-жук 404/), { key: "Enter" });
  await advance(50);
  expect(stat("kills")).toBe("1");
  const live = container.querySelector('[role="status"][aria-live="polite"]');
  expect(live?.textContent && live.textContent.length > 0).toBe(true);
});

it("toggles the SFX button on click", () => {
  render(<CyberBugEasterEgg />);
  fireEvent.click(screen.getByText("SFX ON"));
  expect(screen.getByText("SFX OFF")).toBeTruthy();
  fireEvent.click(screen.getByText("SFX OFF"));
  expect(screen.getByText("SFX ON")).toBeTruthy();
});

it("spawns a boss every 5th bug (aria-label switches to 500)", async () => {
  render(<CyberBugEasterEgg />);
  for (let i = 0; i < 4; i++) await splatOnce();
  expect(hitbox(/Босс-жук 500/)).toBeTruthy();
});

it("persists lifetime kills and unlocks the 10-kill skin", async () => {
  render(<CyberBugEasterEgg />);
  for (let i = 0; i < 10; i++) await splatOnce();
  expect(localStorage.getItem("appseal-bug-total")).toBe("10");
  expect(stat("total")).toBe("10");
  expect(JSON.parse(localStorage.getItem("appseal-bug-unlocks") ?? "[]")).toContain(10);
});

it("keeps a lifetime skin across a fresh mount (accentOverride applied)", async () => {
  localStorage.setItem("appseal-bug-total", "12");
  render(<CyberBugEasterEgg />);
  await act(async () => {}); // flush the mount effects
  // at 12 lifetime kills the ice skin tints the svg accent (default is green)
  const svg = document.querySelector(".cb-root") as SVGSVGElement | null;
  expect(svg?.getAttribute("style")).toContain("38BDF8");
  expect(stat("total")).toBe("12");
});

it("swarm mini-boss starts fresh: lives refill + first bite held a full cooldown", async () => {
  // this test needs the real movement model (the setup shim forces reduced
  // motion ON for deterministic splats) and a game clock that actually moves:
  // vitest does not fake performance.now(), so spy it with a manual virtual
  // clock and advance the rAF frames step by step (16ms each, like real
  // frames) - every gate (biteAt, swarm grace, timers) shares one timeline
  const realMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  let virtualNow = 0;
  const perfSpy = vi.spyOn(performance, "now").mockImplementation(() => virtualNow);
  const step = async (ms: number) => {
    await act(async () => {
      for (let t = 0; t < ms; t += 16) {
        virtualNow += 16;
        await vi.advanceTimersByTimeAsync(16);
      }
    });
  };
  // jsdom has no layout: the stub card reports 0x0 and the hunt bite ("fully
  // under the glass") would be unreachable - give the card a real rect
  const cardEl = document.querySelector("[data-nf-card]") as HTMLElement;
  cardEl.getBoundingClientRect = () =>
    ({ left: 300, top: 200, width: 400, height: 300, right: 700, bottom: 500, x: 300, y: 200, toJSON: () => ({}) }) as DOMRect;
  window.history.replaceState(null, "", "/?nfk=49");
  const livesLeft = () =>
    [...document.querySelectorAll<HTMLElement>("[data-nf-life]")].filter((el) => el.dataset.dead !== "1").length;
  try {
    render(<CyberBugEasterEgg />);
    await step(30); // the cheat puts the run at 49 kills - bug #50 is the boss

    // wake the dormant game first: the easter egg never bites a player who
    // has not landed a hit yet - one hit also costs the boss 1 hp
    fireEvent.keyDown(hitbox(/Босс-жук 500/), { key: "Enter" });
    await step(50);

    // the run's losses leak into the finale in real play: let this boss lose
    // patience (9.2s at wave 6, recharged by the wake-up hit), hunt the card
    // and bite a life out
    await step(13000);
    expect(livesLeft()).toBe(2);

    // splat it - kill #50 - and let the swarm event fire (600ms beat)
    for (let i = 0; i < 5; i++) fireEvent.keyDown(hitbox(/Босс-жук 500/), { key: "Enter" });
    await step(50);
    expect(stat("kills")).toBe("50");
    await step(700); // spawnSwarm: refill + bite grace
    expect(livesLeft()).toBe(3); // the refill heals the run's losses
    // the tap-anywhere combat layer is up for the whole fight (the card
    // glass would otherwise swallow every tap aimed at a roach)
    expect(document.querySelector("[data-nf-swarm-tap]")).toBeTruthy();

    await step(1800); // roaches reach the glass (~1.7s) - no bite yet
    expect(livesLeft()).toBe(3); // the grace holds through the whole crawl-in
    await step(4200); // grace (one 4s window) expired - the first bite lands
    expect(livesLeft()).toBe(2);
  } finally {
    perfSpy.mockRestore();
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, "", "/");
    vi.useRealTimers();
  }
}, 30000);
