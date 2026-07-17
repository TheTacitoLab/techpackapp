import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PROFILE_NAME_MAX,
  cloneProfileName,
  countEnabledGroups,
  emptyFieldGroups,
  factoryMerchandiserFieldGroups,
  isSensitiveGroup,
  newProfileFieldGroups,
  readFieldGroups,
} from "./visibility-profiles.ts";
import {
  SENSITIVE_VISIBILITY_GROUPS,
  VISIBILITY_GROUPS,
  VISIBILITY_SECTION_KEYS,
  type VisibilityFieldGroups,
} from "@/types/visibility.ts";

describe("VISIBILITY_GROUPS (single source of truth)", () => {
  it("has exactly the five canonical sections", () => {
    assert.deepEqual(VISIBILITY_SECTION_KEYS.slice().sort(), [
      "bill_of_materials",
      "documents",
      "product_setup",
      "size_specifications",
      "technical_drawings",
    ]);
  });

  it("mirrors the migration 0043 field_groups contract exactly", () => {
    assert.deepEqual(VISIBILITY_GROUPS, {
      product_setup: [
        "core_identity",
        "description_fit",
        "production_tracking",
        "pricing",
      ],
      technical_drawings: ["flats_annotations", "colourways", "page_notes"],
      bill_of_materials: ["materials_construction", "costs"],
      size_specifications: ["measurements_grading", "tolerances"],
      documents: ["attachments"],
    });
  });

  it("flags pricing and costs — and only those — as sensitive", () => {
    assert.deepEqual(SENSITIVE_VISIBILITY_GROUPS.slice().sort(), [
      "costs",
      "pricing",
    ]);
    assert.equal(isSensitiveGroup("pricing"), true);
    assert.equal(isSensitiveGroup("costs"), true);
    assert.equal(isSensitiveGroup("core_identity"), false);
    assert.equal(isSensitiveGroup("materials_construction"), false);
  });
});

describe("newProfileFieldGroups", () => {
  const groups = newProfileFieldGroups();

  it("enables only core_identity and flats_annotations", () => {
    const { enabled } = countEnabledGroups(groups);
    assert.equal(enabled, 2);
    assert.equal(groups.product_setup.core_identity, true);
    assert.equal(groups.technical_drawings.flats_annotations, true);
  });

  it("leaves pricing and costs off", () => {
    assert.equal(groups.product_setup.pricing, false);
    assert.equal(groups.bill_of_materials.costs, false);
  });
});

describe("factoryMerchandiserFieldGroups (the seeded 90% profile)", () => {
  const groups = factoryMerchandiserFieldGroups();

  it("enables every group except the sensitive ones", () => {
    const { enabled, total } = countEnabledGroups(groups);
    assert.equal(enabled, total - SENSITIVE_VISIBILITY_GROUPS.length);
  });

  it("keeps pricing and costs off but everything else on", () => {
    assert.equal(groups.product_setup.pricing, false);
    assert.equal(groups.bill_of_materials.costs, false);
    assert.equal(groups.product_setup.core_identity, true);
    assert.equal(groups.bill_of_materials.materials_construction, true);
    assert.equal(groups.size_specifications.tolerances, true);
    assert.equal(groups.documents.attachments, true);
  });
});

describe("emptyFieldGroups", () => {
  it("turns everything off", () => {
    assert.equal(countEnabledGroups(emptyFieldGroups()).enabled, 0);
  });
});

describe("readFieldGroups (defensive decode)", () => {
  it("returns all-false for null / non-object / array input", () => {
    for (const bad of [null, 42, "x", [], true]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groups = readFieldGroups(bad as any);
      assert.equal(countEnabledGroups(groups).enabled, 0);
    }
  });

  it("reads only explicit true (missing / truthy-but-not-true => false)", () => {
    const groups = readFieldGroups({
      product_setup: {
        core_identity: true,
        description_fit: "yes", // truthy but not boolean true
        production_tracking: 1,
      },
      bill_of_materials: { costs: true },
      // technical_drawings, size_specifications, documents omitted entirely
    });
    assert.equal(groups.product_setup.core_identity, true);
    assert.equal(groups.product_setup.description_fit, false);
    assert.equal(groups.product_setup.production_tracking, false);
    assert.equal(groups.bill_of_materials.costs, true);
    assert.equal(groups.technical_drawings.flats_annotations, false);
  });

  it("drops unknown sections/groups and stays total over the contract", () => {
    const groups = readFieldGroups({
      product_setup: { core_identity: true, made_up_group: true },
      nonsense_section: { whatever: true },
    });
    assert.equal(countEnabledGroups(groups).enabled, 1);
    // every canonical section is present after decode
    for (const section of VISIBILITY_SECTION_KEYS) {
      assert.ok(groups[section], `missing section ${section}`);
    }
  });

  it("round-trips a full field-group map", () => {
    const original = factoryMerchandiserFieldGroups();
    const decoded = readFieldGroups(
      original as unknown as VisibilityFieldGroups as never,
    );
    assert.deepEqual(decoded, original);
  });
});

describe("cloneProfileName", () => {
  it("appends ' (copy)'", () => {
    assert.equal(cloneProfileName("Factory Merchandiser"), "Factory Merchandiser (copy)");
  });

  it("does not stack suffixes when cloning a clone", () => {
    assert.equal(cloneProfileName("Brand Review (copy)"), "Brand Review (copy)");
  });

  it("never exceeds the max length, keeping the suffix intact", () => {
    const long = "x".repeat(PROFILE_NAME_MAX + 20);
    const cloned = cloneProfileName(long);
    assert.ok(cloned.length <= PROFILE_NAME_MAX);
    assert.ok(cloned.endsWith(" (copy)"));
  });
});
