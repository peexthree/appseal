import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldRender } from "../src/lib/scanner/render.ts";

describe("shouldRender", () => {
  it("renders CSR public targets", () => {
    assert.equal(shouldRender(true, false), true);
  });
  it("never renders SSR pages", () => {
    assert.equal(shouldRender(false, false), false);
  });
  it("never renders the demo fixture", () => {
    assert.equal(shouldRender(true, true), false);
  });
  it("respects the APPSEAL_RENDER=off kill switch", () => {
    process.env.APPSEAL_RENDER = "off";
    try {
      assert.equal(shouldRender(true, false), false);
    } finally {
      delete process.env.APPSEAL_RENDER;
    }
    assert.equal(shouldRender(true, false), true);
  });
});
