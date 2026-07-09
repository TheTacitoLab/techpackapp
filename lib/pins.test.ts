import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PINS,
  MAX_PINS_ERROR,
  addPin,
  pinKey,
  pinsFromPreferences,
  prunePins,
  removePin,
  type PinEntry,
} from "./pins.ts";

const product = (id: string): PinEntry => ({ type: "product", id });
const collection = (id: string): PinEntry => ({ type: "collection", id });

describe("pinsFromPreferences", () => {
  it("reads a valid ordered pins array", () => {
    assert.deepEqual(
      pinsFromPreferences({
        hide_unlock_warning: true,
        pins: [
          { type: "collection", id: "c1" },
          { type: "product", id: "p1" },
        ],
      }),
      [collection("c1"), product("p1")],
    );
  });

  it("returns [] for non-object preferences and missing/invalid pins", () => {
    assert.deepEqual(pinsFromPreferences(null), []);
    assert.deepEqual(pinsFromPreferences("nope"), []);
    assert.deepEqual(pinsFromPreferences([]), []);
    assert.deepEqual(pinsFromPreferences({}), []);
    assert.deepEqual(pinsFromPreferences({ pins: "nope" }), []);
    assert.deepEqual(pinsFromPreferences({ pins: {} }), []);
  });

  it("drops malformed entries and keeps the valid subset in order", () => {
    assert.deepEqual(
      pinsFromPreferences({
        pins: [
          { type: "brand", id: "b1" }, // not a pinnable type
          { type: "product" }, // missing id
          { type: "product", id: "" }, // empty id
          { type: "product", id: 7 }, // non-string id
          "junk",
          null,
          ["product", "p9"],
          { type: "collection", id: "c1" },
          { type: "product", id: "p1" },
        ],
      }),
      [collection("c1"), product("p1")],
    );
  });

  it("dedupes same type+id keeping the first occurrence", () => {
    assert.deepEqual(
      pinsFromPreferences({
        pins: [
          { type: "product", id: "x" },
          { type: "collection", id: "x" },
          { type: "product", id: "x" },
        ],
      }),
      [product("x"), collection("x")],
    );
  });
});

describe("addPin", () => {
  it("appends to the end (pin order preserved)", () => {
    const { pins, error } = addPin([product("p1")], collection("c1"));
    assert.equal(error, null);
    assert.deepEqual(pins, [product("p1"), collection("c1")]);
  });

  it("is a no-op for an already-pinned entry", () => {
    const { pins, error } = addPin([product("p1")], product("p1"));
    assert.equal(error, null);
    assert.deepEqual(pins, [product("p1")]);
  });

  it("accepts the 10th pin but rejects the 11th with the friendly error", () => {
    const nine = Array.from({ length: MAX_PINS - 1 }, (_, i) =>
      product(`p${i}`),
    );
    const tenth = addPin(nine, collection("c1"));
    assert.equal(tenth.error, null);
    assert.equal(tenth.pins.length, MAX_PINS);

    const eleventh = addPin(tenth.pins, product("p-too-many"));
    assert.equal(eleventh.error, MAX_PINS_ERROR);
    assert.deepEqual(eleventh.pins, tenth.pins);
  });

  it("counts the cap across both types", () => {
    const mixed = [
      ...Array.from({ length: 5 }, (_, i) => product(`p${i}`)),
      ...Array.from({ length: 5 }, (_, i) => collection(`c${i}`)),
    ];
    assert.equal(addPin(mixed, product("extra")).error, MAX_PINS_ERROR);
  });
});

describe("removePin", () => {
  it("removes only the matching type+id", () => {
    const pins = [product("x"), collection("x"), product("y")];
    assert.deepEqual(removePin(pins, product("x")), [
      collection("x"),
      product("y"),
    ]);
  });

  it("is a no-op when the entry is not pinned", () => {
    assert.deepEqual(removePin([product("p1")], collection("c9")), [
      product("p1"),
    ]);
  });
});

describe("prunePins", () => {
  it("drops entries whose key is not in the valid set", () => {
    const pins = [product("p1"), collection("c1"), product("gone")];
    const valid = new Set([pinKey(product("p1")), pinKey(collection("c1"))]);
    assert.deepEqual(prunePins(pins, valid), [product("p1"), collection("c1")]);
  });
});
