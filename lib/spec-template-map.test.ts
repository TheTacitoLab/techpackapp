import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  duplicateTemplateCodes,
  specRowsToTemplatePoms,
  type SpecRowForTemplate,
} from "./spec-template-map.ts";

function row(overrides: Partial<SpecRowForTemplate>): SpecRowForTemplate {
  return {
    code: "POM1",
    name: "Chest width",
    how_to_measure: 'Measure 1" below the armhole.',
    grade_category: "primary_girth",
    sub_kind: null,
    sort_order: 10,
    ...overrides,
  };
}

describe("specRowsToTemplatePoms", () => {
  it("maps every structural field and stamps the template id", () => {
    const rows = [
      row({
        code: "POM3",
        name: "Shoulder width",
        how_to_measure: "Seam to seam across the back.",
        grade_category: "small",
        sub_kind: "shoulder",
        sort_order: 30,
      }),
    ];
    assert.deepEqual(specRowsToTemplatePoms(rows, "tpl-1"), [
      {
        template_id: "tpl-1",
        code: "POM3",
        name: "Shoulder width",
        how_to_measure: "Seam to seam across the back.",
        grade_category: "small",
        sub_kind: "shoulder",
        sort_order: 10,
      },
    ]);
  });

  it("orders by sort_order and renumbers with seed-style ×10 spacing", () => {
    const rows = [
      row({ code: "POM2", sort_order: 20 }),
      row({ code: "POM1", sort_order: 10 }),
      row({ code: "POM3", sort_order: 30 }),
    ];
    const poms = specRowsToTemplatePoms(rows, "tpl-1");
    assert.deepEqual(
      poms.map((p) => p.code),
      ["POM1", "POM2", "POM3"],
    );
    assert.deepEqual(
      poms.map((p) => p.sort_order),
      [10, 20, 30],
    );
  });

  it("breaks sort_order ties numerically by code (POM2 before POM10)", () => {
    const rows = [
      row({ code: "POM10", sort_order: 10 }),
      row({ code: "POM2", sort_order: 10 }),
    ];
    assert.deepEqual(
      specRowsToTemplatePoms(rows, "tpl-1").map((p) => p.code),
      ["POM2", "POM10"],
    );
  });

  it("copies structure only — no value or tolerance fields exist on the output", () => {
    const [pom] = specRowsToTemplatePoms([row({})], "tpl-1");
    assert.deepEqual(Object.keys(pom).sort(), [
      "code",
      "grade_category",
      "how_to_measure",
      "name",
      "sort_order",
      "sub_kind",
      "template_id",
    ]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(specRowsToTemplatePoms([], "tpl-1"), []);
  });
});

describe("duplicateTemplateCodes", () => {
  it("returns nothing for unique codes", () => {
    const rows = [row({ code: "POM1" }), row({ code: "POM2" })];
    assert.deepEqual(duplicateTemplateCodes(rows), []);
  });

  it("reports each duplicate once, case-insensitively, by first spelling", () => {
    const rows = [
      row({ code: "POM1" }),
      row({ code: "pom1" }),
      row({ code: "POM1" }),
      row({ code: "POM2" }),
    ];
    assert.deepEqual(duplicateTemplateCodes(rows), ["POM1"]);
  });

  it("ignores surrounding whitespace when comparing", () => {
    const rows = [row({ code: "POM1" }), row({ code: " POM1 " })];
    assert.equal(duplicateTemplateCodes(rows).length, 1);
  });
});
