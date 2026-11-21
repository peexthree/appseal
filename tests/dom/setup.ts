/**
 * jsdom shims for the 404 game DOM tests: matchMedia (reduced motion forced
 * ON so every landed hit is an instant, deterministic splat), a quiet canvas
 * stub, and a timer-based requestAnimationFrame shim so vitest fake timers
 * drive the game loop.
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no 2d context (and logs a noisy error on every call); the game
// guards every ctx access, so a null stub keeps the test output clean
HTMLCanvasElement.prototype.getContext = function () {
  return null;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

// rAF shim on top of setTimeout: fake timers stay in charge of the loop
window.requestAnimationFrame = ((cb: (time: number) => void) =>
  setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof window.requestAnimationFrame;
window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof window.cancelAnimationFrame;

export {};
