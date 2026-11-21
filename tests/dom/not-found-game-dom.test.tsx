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
