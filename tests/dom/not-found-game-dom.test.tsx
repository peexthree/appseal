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

const hitbox = (name: RegExp) => screen.getByRole("button", { name }) as HTMLElement;

/** One keyboard kill + a full respawn wait (the window is 2.5-3.5s). */
const splatOnce = async () => {
  fireEvent.keyDown(hitbox(/Кибер-жук|Босс-жук/), { key: "Enter" });
  await advance(4000);
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows the HUD counter and the SFX toggle before the first kill", () => {
  const { container } = render(<CyberBugEasterEgg />);
  expect(container.textContent).toContain("SFX ON");
  expect(container.textContent).toContain("БАГОВ: 0");
  expect(container.textContent).toContain("ВСЕГО: 0");
  expect(container.textContent).toContain("РЕКОРД: 0");
});

it("updates the hitbox aria-label with the current HP", () => {
  render(<CyberBugEasterEgg />);
  expect(hitbox(/HP 3\/3/)).toBeTruthy();
});

it("splats on keyboard Enter and mirrors the kill into the aria-live region", async () => {
  const { container } = render(<CyberBugEasterEgg />);
  fireEvent.keyDown(hitbox(/Кибер-жук 404/), { key: "Enter" });
  await advance(50);
  expect(container.textContent).toContain("БАГОВ: 1");
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
  const { container } = render(<CyberBugEasterEgg />);
  for (let i = 0; i < 10; i++) await splatOnce();
  expect(localStorage.getItem("appseal-bug-total")).toBe("10");
  expect(container.textContent).toContain("ВСЕГО: 10");
  expect(JSON.parse(localStorage.getItem("appseal-bug-unlocks") ?? "[]")).toContain(10);
});

it("keeps a lifetime skin across a fresh mount (accentOverride applied)", async () => {
  localStorage.setItem("appseal-bug-total", "12");
  const { container } = render(<CyberBugEasterEgg />);
  await act(async () => {}); // flush the mount effects
  // at 12 lifetime kills the ice skin tints the svg accent (default is green)
  const svg = document.querySelector(".cb-root") as SVGSVGElement | null;
  expect(svg?.getAttribute("style")).toContain("38BDF8");
  expect(container.textContent).toContain("ВСЕГО: 12");
});
