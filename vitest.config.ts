import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * DOM-level tests for the 404 bug game (tests/dom). The pure-logic suite in
 * tests/ stays on node --test + strip-types; these need a real DOM + JSX, so
 * they run through vitest (jsdom) via `npm run test:dom`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/dom/**/*.test.tsx"],
    setupFiles: ["tests/dom/setup.ts"],
  },
});
