import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FULL_SECTION_MASK,
  IDENTITY_PRODUCT_COLUMNS,
  copiedStoragePath,
  maskedIdentityColumns,
  type IdentityColumnSource,
} from "./product-copy.ts";

describe("copiedStoragePath", () => {
  it("moves the basename under the target product's folder", () => {
    assert.equal(
      copiedStoragePath(
        "ws-1/prod-a/1720000000000_front_flat.png",
        "ws-1",
        "prod-b",
      ),
      "ws-1/prod-b/1720000000000_front_flat.png",
    );
  });

  it("keeps only the last segment of a deeper source path", () => {
    assert.equal(
      copiedStoragePath("ws-1/nested/extra/hero.jpg", "ws-1", "prod-b"),
      "ws-1/prod-b/hero.jpg",
    );
  });

  it("treats a bare filename as the basename", () => {
    assert.equal(
      copiedStoragePath("hero.jpg", "ws-9", "prod-x"),
      "ws-9/prod-x/hero.jpg",
    );
  });

  it("keeps the workspace as the first segment (Storage RLS contract)", () => {
    const path = copiedStoragePath("ws-1/prod-a/file.png", "ws-1", "prod-b");
    assert.equal(path.split("/")[0], "ws-1");
  });
});

describe("maskedIdentityColumns", () => {
  const source: IdentityColumnSource = {
    category: "Activewear",
    gender: "Mens",
    size_range: "S-2XL",
    season_id: "season-1",
    designer_name: "Ada",
    designer_email: "ada@example.com",
    factory_name: "Factory A",
    factory_country: "Portugal",
    sample_due_date: "2026-08-01",
    delivery_date: "2026-10-01",
    wholesale_price: 20,
    retail_price: 55,
  };

  it("copies every identity column when Product Setup is kept", () => {
    const out = maskedIdentityColumns(source, true);
    for (const column of IDENTITY_PRODUCT_COLUMNS) {
      assert.equal(out[column], source[column], column);
    }
  });

  it("resets every identity column to null when Product Setup is dropped", () => {
    const out = maskedIdentityColumns(source, false);
    for (const column of IDENTITY_PRODUCT_COLUMNS) {
      assert.equal(out[column], null, column);
    }
  });

  it("coerces missing source values to null rather than undefined", () => {
    const sparse = {
      ...source,
      season_id: undefined,
    } as unknown as IdentityColumnSource;
    const out = maskedIdentityColumns(sparse, true);
    assert.equal(out.season_id, null);
  });

  it("emits exactly the identity columns — never name/style/status/share_token", () => {
    const out = maskedIdentityColumns(source, true);
    assert.deepEqual(
      Object.keys(out).sort(),
      [...IDENTITY_PRODUCT_COLUMNS].sort(),
    );
  });
});

describe("FULL_SECTION_MASK", () => {
  it("keeps all three section choices", () => {
    assert.deepEqual(FULL_SECTION_MASK, {
      productSetup: true,
      technicalDrawings: true,
      sizeSpecifications: true,
    });
  });
});
