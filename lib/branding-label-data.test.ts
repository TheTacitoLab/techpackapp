import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  brandingLabelDataFromLibraryItem,
  brandingLabelTypeLabel,
  brandingTypeForSave,
  readBrandingLabelData,
} from "@/components/canvas/branding-label-data";
import type { ResolvedLibraryItem } from "@/types";

// The unification contract under test: a branding pin's type is its linked
// embellishment library item; `branding_type` slugs exist only on pins saved
// under the retired hardcoded dropdown and must keep rendering (never crash,
// never migrate) until an embellishment replaces them.

const embellishment = (
  overrides: Partial<ResolvedLibraryItem> = {},
): ResolvedLibraryItem => ({
  id: "item-1",
  category: "embellishment",
  source: "global",
  workspace_id: null,
  name: "Screen Print",
  description: "Ink printed through a mesh screen.",
  properties: {},
  image_url: null,
  is_active: true,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  isGlobal: true,
  isHidden: false,
  isFavourite: false,
  ...overrides,
});

describe("readBrandingLabelData", () => {
  it("keeps a legacy pin's valid branding_type slug", () => {
    const d = readBrandingLabelData({
      branding_type: "embroidery",
      placement: "Left chest",
    });
    assert.equal(d.branding_type, "embroidery");
    assert.equal(d.placement, "Left chest");
    assert.equal(d.library_item_id, null);
  });

  it("degrades an unknown branding_type slug to null, never throws", () => {
    const d = readBrandingLabelData({ branding_type: "hologram" });
    assert.equal(d.branding_type, null);
  });

  it("reads a post-unification pin (library reference, no slug)", () => {
    const d = readBrandingLabelData({
      library_item_id: "item-1",
      library_item_name: "Screen Print",
      width_mm: 60,
    });
    assert.equal(d.branding_type, null);
    assert.equal(d.library_item_id, "item-1");
    assert.equal(d.library_item_name, "Screen Print");
    assert.equal(d.width_mm, 60);
  });

  it("returns the all-null shape for non-object data", () => {
    for (const data of [null, "nope", [1, 2]]) {
      const d = readBrandingLabelData(data as never);
      assert.equal(d.branding_type, null);
      assert.equal(d.label_type, null);
      assert.equal(d.library_item_id, null);
    }
  });
});

describe("brandingTypeForSave", () => {
  it("preserves a legacy slug while no embellishment is linked", () => {
    assert.equal(brandingTypeForSave("embroidery", null), "embroidery");
  });

  it("clears the legacy slug once an embellishment is linked", () => {
    assert.equal(brandingTypeForSave("embroidery", "item-1"), null);
  });

  it("stays null for pins that never had a slug", () => {
    assert.equal(brandingTypeForSave(null, null), null);
    assert.equal(brandingTypeForSave(null, "item-1"), null);
  });
});

describe("brandingLabelTypeLabel", () => {
  it("renders the legacy branding slug's label", () => {
    const d = readBrandingLabelData({ branding_type: "deboss_emboss" });
    assert.equal(brandingLabelTypeLabel(d), "Deboss / emboss");
  });

  it("renders the label family's type", () => {
    const d = readBrandingLabelData({ label_type: "care_label" });
    assert.equal(brandingLabelTypeLabel(d), "Care label");
  });

  it("is null when no type field is set", () => {
    assert.equal(brandingLabelTypeLabel(readBrandingLabelData({})), null);
  });
});

describe("brandingLabelDataFromLibraryItem", () => {
  it("denormalises id, name, image and colour off the picked item", () => {
    const filled = brandingLabelDataFromLibraryItem(
      embellishment({
        image_url: "data:image/svg+xml;base64,abc",
        properties: { colour: "Volt" },
      }),
    );
    assert.deepEqual(filled, {
      library_item_id: "item-1",
      library_item_name: "Screen Print",
      library_item_image_url: "data:image/svg+xml;base64,abc",
      colour: "Volt",
    });
  });

  it("leaves colour null when the item carries none", () => {
    const filled = brandingLabelDataFromLibraryItem(embellishment());
    assert.equal(filled.colour, null);
  });
});
