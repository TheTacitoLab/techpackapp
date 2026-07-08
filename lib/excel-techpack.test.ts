/**
 * Tests for the Excel tech-pack export: the BOM row derivation feeding it, the
 * shared spec-sheet resolver (the engine pass the PDF also consumes), and the
 * workbook itself — built with `buildTechpackWorkbook`, then re-LOADED with
 * ExcelJS and asserted on, so every expectation runs against the actual .xlsx
 * bytes a factory would open (valid file, real numbers, tab naming, frozen
 * headers, no merged data cells).
 *
 * Profile numbers are the seeded Men's starter (migration 0035), matching
 * `spec-grading.test.ts`, so the graded expectations double as a check that
 * the workbook carries exactly the engine's output.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import ExcelJS from "exceljs";

import { buildBomRows, rowTotal } from "./bom-rows.ts";
import { buildTechpackWorkbook } from "./excel-techpack.ts";
import { resolveSpecTables } from "./spec-sheet-resolve.ts";
import type {
  CanvasAnnotation,
  GradingProfile,
  ProductSpecRow,
  ProductSpecValue,
  ResolvedSpecSheet,
} from "@/types";
import type { Json } from "@/types/database.types";

const T0 = "2026-01-01T00:00:00Z";

// ---- Fixtures -------------------------------------------------------------------

function annotation(
  layerType: CanvasAnnotation["layer_type"],
  ref: string,
  data: Json,
): CanvasAnnotation {
  return {
    id: `ann-${ref}`,
    slot_id: "slot-1",
    workspace_id: "ws-1",
    layer_type: layerType,
    reference_code: ref,
    x: 0.5,
    y: 0.5,
    pin_type: "point",
    end_x: null,
    end_y: null,
    label_offset_x: null,
    label_offset_y: null,
    colourway_id: null,
    data,
    created_by: null,
    created_at: T0,
    updated_at: T0,
  };
}

/** A multi-group BOM: fabrics with/without cost, trims with/without kind —
 *  deliberately passed in shuffled order. */
const BOM_ANNOTATIONS: CanvasAnnotation[] = [
  annotation("trim", "T2", {
    library_item_name: "Herringbone tape",
    notes: "Neck seam",
  }),
  annotation("fabric", "F10", {
    library_item_name: "Contrast mesh",
    composition: "100% Polyester",
  }),
  annotation("fabric", "F1", {
    library_item_name: "Main fleece",
    composition: "80% Cotton 20% Polyester",
    colour: "Washed black",
    gsm: 320,
    width_cm: 165,
    placement: "Body",
    quantity: 2.5,
    unit: "per_metre",
    unit_cost: 4,
  }),
  annotation("trim", "T1", {
    library_item_name: "YKK #5 zip",
    trim_kind: "fastener",
    quantity: 3,
    unit: "per_unit",
    unit_cost: 0.25,
  }),
  annotation("fabric", "F2", {
    library_item_name: "2x2 rib",
    composition: "95% Cotton 5% Elastane",
  }),
  // A non-BOM layer that must not leak into the rows.
  annotation("measurement", "M1", { label: "Chest" }),
];

/** The seeded Men's starter profile (0035). */
const MENS_PROFILE: GradingProfile = {
  id: "prof-mens",
  source: "global",
  workspace_id: null,
  name: "Men's",
  description: null,
  size_run_labels: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"],
  break_size_label: "2XL",
  base_increments: {
    primary_girth: 2.5,
    secondary_girth: 1.2,
    body_length: 1.5,
    limb_length: 1.2,
    small_shoulder: 1.2,
    small_neck: 0.6,
    small_cuff_opening: 0.6,
    small_rise: 1.0,
    inseam: 0,
  },
  extended_increments: {
    primary_girth: 3.5,
    secondary_girth: 1.8,
    body_length: 1.5,
    limb_length: 1.2,
    small_shoulder: 1.2,
    small_neck: 0.6,
    small_cuff_opening: 0.6,
    small_rise: 1.0,
    inseam: 0,
  },
  tolerances_knit: { primary_girth: 1.2, body_length: 1.0 },
  tolerances_woven: { primary_girth: 0.6 },
  is_active: true,
  sort_order: 0,
  created_by: null,
  created_at: T0,
  updated_at: T0,
};

function pomRow(
  sheetId: string,
  code: string,
  name: string,
  gradeCategory: ProductSpecRow["grade_category"],
  sortOrder: number,
  toleranceOverride: number | null = null,
): ProductSpecRow {
  return {
    id: `${sheetId}-${code}`,
    sheet_id: sheetId,
    workspace_id: "ws-1",
    code,
    name,
    how_to_measure: null,
    grade_category: gradeCategory,
    sub_kind: null,
    tolerance_override: toleranceOverride,
    sort_order: sortOrder,
    created_at: T0,
    updated_at: T0,
  };
}

function storedValue(
  sheetId: string,
  rowId: string,
  sizeLabel: string,
  value: number,
): ProductSpecValue {
  return {
    id: `${rowId}-${sizeLabel}`,
    sheet_id: sheetId,
    row_id: rowId,
    workspace_id: "ws-1",
    size_label: sizeLabel,
    value,
    created_at: T0,
    updated_at: T0,
  };
}

function specSheet(
  overrides: Partial<ResolvedSpecSheet> & Pick<ResolvedSpecSheet, "id">,
): ResolvedSpecSheet {
  return {
    product_id: "prod-1",
    workspace_id: "ws-1",
    template_id: null,
    template_name: null,
    name: null,
    mode: "auto",
    demographic: "mens",
    sizing_system: "alpha",
    size_run: [],
    sample_size_label: null,
    sample_sizes: [],
    grading_profile_id: null,
    fabric_type: "knit",
    unit: "cm",
    is_complete: true,
    created_at: T0,
    updated_at: T0,
    rows: [],
    values: [],
    ...overrides,
  };
}

/** A long shared name: exercises both tab-name truncation and uniquing. */
const SHARED_SHEET_NAME = "ERSKEN Hybrid Hoodie - Menswear Run";

/** Auto-graded men's sheet: chest + body length measured on the M sample. */
const MENS_SHEET = specSheet({
  id: "sheet-mens",
  name: SHARED_SHEET_NAME,
  size_run: ["S", "M", "L", "XL", "2XL"],
  sample_sizes: ["M"],
  sample_size_label: "M",
  grading_profile_id: MENS_PROFILE.id,
  rows: [
    pomRow("sheet-mens", "POM1", "1/2 Chest", "primary_girth", 0),
    pomRow("sheet-mens", "POM2", "Body length (HPS)", "body_length", 10),
  ],
  values: [
    storedValue("sheet-mens", "sheet-mens-POM1", "M", 52),
    storedValue("sheet-mens", "sheet-mens-POM2", "M", 70),
  ],
});

/** Manual numeric women's sheet with the SAME display name as the men's one
 *  (forces the "(2)" tab suffix) and a per-row tolerance override. */
const WOMENS_SHEET = specSheet({
  id: "sheet-womens",
  name: SHARED_SHEET_NAME,
  mode: "manual",
  demographic: "womens",
  sizing_system: "numeric",
  size_run: ["0", "2", "4"],
  sample_sizes: ["2"],
  sample_size_label: "2",
  rows: [pomRow("sheet-womens", "POM1", "1/2 Waist", "primary_girth", 0, 0.5)],
  values: [
    storedValue("sheet-womens", "sheet-womens-POM1", "0", 30),
    storedValue("sheet-womens", "sheet-womens-POM1", "2", 32),
    storedValue("sheet-womens", "sheet-womens-POM1", "4", 34),
  ],
});

const PROFILES_BY_ID = new Map<string, GradingProfile>([
  [MENS_PROFILE.id, MENS_PROFILE],
]);

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // A fresh copy guarantees an exact-size, non-shared ArrayBuffer — the shape
  // ExcelJS's load() is typed to take.
  const copy = new Uint8Array(bytes);
  await workbook.xlsx.load(copy.buffer as ArrayBuffer);
  return workbook;
}

// ---- BOM row derivation ------------------------------------------------------------

describe("buildBomRows", () => {
  it("keeps only fabric/trim pins, grouped Fabrics then Trims in numeric ref order", () => {
    const rows = buildBomRows(BOM_ANNOTATIONS);
    assert.deepEqual(
      rows.map((r) => r.ref),
      ["F1", "F2", "F10", "T1", "T2"],
    );
    assert.deepEqual(
      rows.map((r) => r.group),
      ["fabric", "fabric", "fabric", "trim", "trim"],
    );
  });

  it("computes a row total only when BOTH qty and unit cost are present", () => {
    const rows = buildBomRows(BOM_ANNOTATIONS);
    assert.equal(rowTotal(rows[0].data), 10); // F1: 2.5 × 4
    assert.equal(rowTotal(rows[1].data), null); // F2: neither
    assert.equal(rowTotal(rows[3].data), 0.75); // T1: 3 × 0.25
  });
});

// ---- Spec resolution (shared with the PDF) -------------------------------------------

describe("resolveSpecTables", () => {
  it("re-grades auto sheets through the engine from the stored sample column", () => {
    const [table] = resolveSpecTables([MENS_SHEET], PROFILES_BY_ID);
    assert.deepEqual(
      table.columns.map((c) => c.label),
      ["S", "M", "L", "XL", "2XL"],
    );
    assert.deepEqual(
      table.columns.map((c) => c.isSample),
      [false, true, false, false, false],
    );
    // Chest 52 @ M, +2.5/step, break at 2XL switches to +3.5.
    assert.deepEqual(table.rows[0].values, [49.5, 52, 54.5, 57, 60.5]);
    // Body length 70 @ M, +1.5/step on both sides of the break.
    assert.deepEqual(table.rows[1].values, [68.5, 70, 71.5, 73, 74.5]);
    // Knit tolerances from the profile.
    assert.equal(table.rows[0].tolerance, 1.2);
    assert.equal(table.rows[1].tolerance, 1);
  });

  it("keeps manual sheets stored-only and honours tolerance overrides", () => {
    const [table] = resolveSpecTables([WOMENS_SHEET], PROFILES_BY_ID);
    assert.deepEqual(table.rows[0].values, [30, 32, 34]);
    assert.equal(table.rows[0].tolerance, 0.5);
  });

  it("skips sheets with nothing to table", () => {
    const empty = specSheet({ id: "sheet-empty", size_run: ["S", "M"] });
    assert.deepEqual(resolveSpecTables([empty], PROFILES_BY_ID), []);
  });
});

// ---- The workbook --------------------------------------------------------------------

describe("buildTechpackWorkbook", () => {
  it("BOM tab: frozen header, numeric costs, category column, live TOTAL row", async () => {
    const buffer = await buildTechpackWorkbook({
      productName: "ERSKEN Hybrid Hoodie",
      styleNumber: "ERK-014",
      versionLabel: "v1.0",
      bomRows: buildBomRows(BOM_ANNOTATIONS),
      specTables: [],
    });
    const workbook = await loadWorkbook(buffer);
    const ws = workbook.getWorksheet("BOM");
    assert.ok(ws, "BOM worksheet exists");

    // Frozen header row; no merged cells anywhere in the tab.
    assert.equal(ws.views[0]?.state, "frozen");
    assert.equal(ws.views[0]?.ySplit, 1);
    assert.equal(ws.model.merges?.length ?? 0, 0);

    assert.equal(ws.getCell("A1").value, "Ref");
    assert.equal(ws.getCell("L1").value, "Total");

    // F1 (row 2): real numbers in GSM/Width/Qty/cost/total, unit as label.
    assert.equal(ws.getCell("A2").value, "F1");
    assert.equal(ws.getCell("B2").value, "Fabric");
    assert.equal(ws.getCell("F2").value, 320);
    assert.equal(ws.getCell("G2").value, 165);
    assert.equal(ws.getCell("I2").value, 2.5);
    assert.equal(ws.getCell("J2").value, "per metre");
    assert.equal(ws.getCell("K2").value, 4);
    assert.equal(ws.getCell("L2").value, 10);
    assert.equal(ws.getCell("K2").numFmt, "#,##0.00");

    // F2 (row 3): no cost data — empty cells, not zeros or dashes.
    assert.equal(ws.getCell("K3").value, null);
    assert.equal(ws.getCell("L3").value, null);

    // Trim kinds surface in the Category column.
    assert.equal(ws.getCell("B5").value, "Fastener"); // T1
    assert.equal(ws.getCell("B6").value, "Trim"); // T2 (no kind)

    // TOTAL row: label in Ref, SUM formula + cached result over the data rows.
    assert.equal(ws.getCell("A7").value, "TOTAL");
    const sumCell = ws.getCell("L7");
    assert.equal(sumCell.formula, "SUM(L2:L6)");
    assert.equal(sumCell.result, 10.75);
  });

  it("spec tabs: one per sheet, engine numbers as numbers, sample marked, names unique", async () => {
    const specTables = resolveSpecTables(
      [MENS_SHEET, WOMENS_SHEET],
      PROFILES_BY_ID,
    );
    const buffer = await buildTechpackWorkbook({
      productName: "ERSKEN Hybrid Hoodie",
      styleNumber: "ERK-014",
      versionLabel: "v1.2",
      bomRows: [],
      specTables,
    });
    const workbook = await loadWorkbook(buffer);

    // Two tabs, ≤31 chars, sanitised-unique (the second gets a suffix).
    const names = workbook.worksheets.map((ws) => ws.name);
    assert.equal(names.length, 2);
    assert.ok(names.every((n) => n.length <= 31));
    assert.ok(names[0].startsWith("Spec - ERSKEN Hybrid Hoodie"));
    assert.ok(names[1].endsWith("(2)"));
    assert.notEqual(names[0], names[1]);

    const mens = workbook.worksheets[0];
    // Header context block (incl. the product version row).
    assert.equal(mens.getCell("A1").value, "Product");
    assert.equal(mens.getCell("B1").value, "ERSKEN Hybrid Hoodie");
    assert.equal(mens.getCell("B2").value, "ERK-014");
    assert.equal(mens.getCell("A3").value, "Version");
    assert.equal(mens.getCell("B3").value, "v1.2");
    assert.equal(mens.getCell("B4").value, `${SHARED_SHEET_NAME} (Men's)`);
    const grading = mens.getCell("B5").value;
    assert.ok(
      typeof grading === "string" &&
        grading.includes("Men's") &&
        grading.includes("knit tolerances"),
    );

    // Frozen panes: table header row + the Code/Measurement/Tol columns.
    assert.equal(mens.views[0]?.state, "frozen");
    assert.equal(mens.views[0]?.ySplit, 7);
    assert.equal(mens.views[0]?.xSplit, 3);
    assert.equal(mens.model.merges?.length ?? 0, 0);

    // Table header + the graded rows: values are NUMBERS (summable).
    assert.equal(mens.getCell("A7").value, "Code");
    assert.equal(mens.getCell("D7").value, "S");
    assert.equal(mens.getCell("E7").value, "M");
    assert.deepEqual(
      ["D8", "E8", "F8", "G8", "H8"].map((ref) => mens.getCell(ref).value),
      [49.5, 52, 54.5, 57, 60.5],
    );
    assert.equal(mens.getCell("C8").value, 1.2);
    assert.ok(mens.getCell("C8").numFmt.includes("±"));

    // The sample column (M) is marked: tinted header carrying a note.
    const sampleHead = mens.getCell("E7");
    const fill = sampleHead.fill;
    assert.ok(fill.type === "pattern" && fill.fgColor?.argb === "FFEDECEA");
    assert.ok(sampleHead.note, "sample header carries a note");

    // The manual women's numeric tab: stored numbers verbatim, gaps stay empty.
    const womens = workbook.worksheets[1];
    assert.equal(womens.getCell("B4").value, `${SHARED_SHEET_NAME} (Women's)`);
    assert.deepEqual(
      ["D8", "E8", "F8"].map((ref) => womens.getCell(ref).value),
      [30, 32, 34],
    );
    assert.equal(womens.getCell("C8").value, 0.5);
  });

  it("both datasets empty: still a valid workbook with an Info tab", async () => {
    const buffer = await buildTechpackWorkbook({
      productName: "Blank Product",
      styleNumber: null,
      versionLabel: "v1.0",
      bomRows: [],
      specTables: [],
    });
    const workbook = await loadWorkbook(buffer);
    assert.equal(workbook.worksheets.length, 1);
    const ws = workbook.worksheets[0];
    assert.equal(ws.name, "Info");
    const title = ws.getCell("A1").value;
    assert.ok(typeof title === "string" && title.includes("Blank Product"));
  });
});
