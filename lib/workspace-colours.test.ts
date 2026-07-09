import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORKSPACE_COLOUR_HEX, normaliseHex } from "./workspace-colours.ts";

describe("normaliseHex", () => {
  it("passes an already-canonical value through", () => {
    assert.equal(normaliseHex("#C8F000"), "#C8F000");
  });

  it("uppercases lowercase digits", () => {
    assert.equal(normaliseHex("#c8f000"), "#C8F000");
    assert.equal(normaliseHex("#aAbBcC"), "#AABBCC");
  });

  it("forgives a missing # prefix", () => {
    assert.equal(normaliseHex("c8f000"), "#C8F000");
    assert.equal(normaliseHex("1A1A2E"), "#1A1A2E");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normaliseHex("  #C8F000  "), "#C8F000");
    assert.equal(normaliseHex(" c8f000 "), "#C8F000");
  });

  it("rejects 3-digit shorthand (no expansion)", () => {
    assert.equal(normaliseHex("#fff"), null);
    assert.equal(normaliseHex("fff"), null);
  });

  it("rejects wrong lengths", () => {
    assert.equal(normaliseHex("#C8F00"), null);
    assert.equal(normaliseHex("#C8F0000"), null);
    assert.equal(normaliseHex(""), null);
    assert.equal(normaliseHex("#"), null);
  });

  it("rejects non-hex characters", () => {
    assert.equal(normaliseHex("#C8F00G"), null);
    assert.equal(normaliseHex("not a colour"), null);
  });

  it("rejects an inner #", () => {
    assert.equal(normaliseHex("##C8F00"), null);
  });
});

describe("WORKSPACE_COLOUR_HEX", () => {
  it("accepts both cases but requires the # and six digits", () => {
    assert.equal(WORKSPACE_COLOUR_HEX.test("#c8f000"), true);
    assert.equal(WORKSPACE_COLOUR_HEX.test("#C8F000"), true);
    assert.equal(WORKSPACE_COLOUR_HEX.test("C8F000"), false);
    assert.equal(WORKSPACE_COLOUR_HEX.test("#C8F0"), false);
  });
});
