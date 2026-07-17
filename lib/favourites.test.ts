import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { partitionFavourites } from "./favourites.ts";

const item = (name: string, isFavourite: boolean) => ({ name, isFavourite });

describe("partitionFavourites", () => {
  it("splits starred items from the rest", () => {
    const a = item("Flatlock", true);
    const b = item("Overlock (3-thread)", false);
    const c = item("Zigzag", true);
    const { favourites, rest } = partitionFavourites([a, b, c]);
    assert.deepEqual(favourites, [a, c]);
    assert.deepEqual(rest, [b]);
  });

  it("preserves the incoming order within each half", () => {
    const items = [
      item("A", false),
      item("B", true),
      item("C", false),
      item("D", true),
      item("E", true),
    ];
    const { favourites, rest } = partitionFavourites(items);
    assert.deepEqual(
      favourites.map((i) => i.name),
      ["B", "D", "E"],
    );
    assert.deepEqual(
      rest.map((i) => i.name),
      ["A", "C"],
    );
  });

  it("returns everything in rest when nothing is starred", () => {
    const items = [item("A", false), item("B", false)];
    const { favourites, rest } = partitionFavourites(items);
    assert.deepEqual(favourites, []);
    assert.deepEqual(rest, items);
  });

  it("returns everything in favourites when all are starred", () => {
    const items = [item("A", true), item("B", true)];
    const { favourites, rest } = partitionFavourites(items);
    assert.deepEqual(favourites, items);
    assert.deepEqual(rest, []);
  });

  it("handles an empty list", () => {
    const { favourites, rest } = partitionFavourites([]);
    assert.deepEqual(favourites, []);
    assert.deepEqual(rest, []);
  });
});
