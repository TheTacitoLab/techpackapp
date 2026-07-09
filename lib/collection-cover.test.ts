import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coverImageUrls, type CoverAsset } from "./collection-cover.ts";

const asset = (id: string, product: string): CoverAsset => ({
  id,
  product_id: product,
  file_url: `url-${id}`,
});

describe("coverImageUrls", () => {
  it("returns [] for an empty collection", () => {
    assert.deepEqual(
      coverImageUrls({
        productIds: [],
        heroAssetIdByProduct: new Map(),
        assets: [],
      }),
      [],
    );
  });

  it("puts hero assets first, then spreads first assets across products", () => {
    const urls = coverImageUrls({
      productIds: ["p1", "p2", "p3"],
      heroAssetIdByProduct: new Map([["p2", "b2"]]),
      // oldest-first per product: p1 → a1, a2; p2 → b1, b2; p3 → c1
      assets: [
        asset("a1", "p1"),
        asset("a2", "p1"),
        asset("b1", "p2"),
        asset("b2", "p2"),
        asset("c1", "p3"),
      ],
    });
    // Hero b2 first, then one first-asset per product (a1, b1, c1).
    assert.deepEqual(urls, ["url-b2", "url-a1", "url-b1", "url-c1"]);
  });

  it("caps at 4 images", () => {
    const urls = coverImageUrls({
      productIds: ["p1", "p2", "p3", "p4", "p5"],
      heroAssetIdByProduct: new Map(),
      assets: ["p1", "p2", "p3", "p4", "p5"].map((p) => asset(`a-${p}`, p)),
    });
    assert.equal(urls.length, 4);
    assert.deepEqual(urls, ["url-a-p1", "url-a-p2", "url-a-p3", "url-a-p4"]);
  });

  it("falls back to second assets of the same product when short", () => {
    const urls = coverImageUrls({
      productIds: ["p1"],
      heroAssetIdByProduct: new Map([["p1", "a2"]]),
      assets: [asset("a1", "p1"), asset("a2", "p1"), asset("a3", "p1")],
    });
    assert.deepEqual(urls, ["url-a2", "url-a1", "url-a3"]);
  });

  it("never repeats an asset and ignores assets of foreign products", () => {
    const urls = coverImageUrls({
      productIds: ["p1"],
      heroAssetIdByProduct: new Map([["p1", "a1"]]),
      assets: [asset("a1", "p1"), asset("z1", "other")],
    });
    assert.deepEqual(urls, ["url-a1"]);
  });

  it("ignores a dangling hero_asset_id", () => {
    const urls = coverImageUrls({
      productIds: ["p1"],
      heroAssetIdByProduct: new Map([["p1", "deleted"]]),
      assets: [asset("a1", "p1")],
    });
    assert.deepEqual(urls, ["url-a1"]);
  });
});
