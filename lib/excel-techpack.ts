/**
 * The Excel (.xlsx) tech-pack export — the structured-data twin of the PDF:
 * one workbook per product with a "BOM" tab and one tab per Spec Sheet,
 * built with ExcelJS (chosen for rich styling — freeze panes, fills, number
 * formats, cell notes — bundled TypeScript types and no native deps; the
 * common alternative `xlsx`/SheetJS CE gates styling behind its paid build).
 *
 * The numbers are NEVER re-derived here: BOM rows arrive via the shared
 * `lib/bom-rows.ts` derivation and spec tables via the shared
 * `lib/spec-sheet-resolve.ts` engine pass — the same modules the PDF consumes
 * — so the workbook matches the PDF/on-screen figures exactly.
 *
 * ERP-import rules (factories load these into their own systems):
 *   - numbers are real numbers (currency as numeric cells with a 2dp format,
 *     never text) so columns sum;
 *   - NO merged cells anywhere in or above a data range;
 *   - the header row of every tab is frozen;
 *   - BOM grouping is a "Category" COLUMN (Fabric / Fastener / Elastic / …)
 *     rather than group-header pseudo-rows — every row is a complete record,
 *     so sorting/filtering/importing can't orphan a group label. Rows keep
 *     the Fabrics-then-Trims reference-code order the app and PDF use.
 *   - empty cells stay empty (no "—" placeholders to trip numeric parsers).
 */

import ExcelJS from "exceljs";

import { TRIM_KIND_LABEL } from "@/components/canvas/fabric-trim-data";
import { demographicLabel } from "@/components/spec/spec-demographics";
import { rowTotal, type BomRow } from "@/lib/bom-rows";
import {
  specSheetCaption,
  type ResolvedSpecTable,
} from "@/lib/spec-sheet-resolve";

export type TechpackWorkbookInput = {
  productName: string;
  styleNumber: string | null;
  /** The product's version label ("v1.1") — the factory sees which pack this is. */
  versionLabel: string;
  bomRows: BomRow[];
  specTables: ResolvedSpecTable[];
};

// The PDF's sample-column tints (render-spec-sheet-page.tsx), as ARGB.
const SAMPLE_HEAD_ARGB = "FFEDECEA";
const SAMPLE_CELL_ARGB = "FFFAFAF9";
const HEADER_ARGB = "FFF5F5F4";

const CURRENCY_FMT = "#,##0.00";
/** Displays "±1" / "±1.5" while the cell VALUE stays a plain number. */
const TOLERANCE_FMT = '"±"General';

const UNIT_LABEL: Record<NonNullable<BomRow["data"]["unit"]>, string> = {
  per_metre: "per metre",
  per_unit: "per unit",
  per_kg: "per kg",
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** 1-based column index → Excel letters (1 → A, 27 → AA). */
function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Excel tab names: ≤31 chars, none of : \ / ? * [ ], non-empty, unique within
 * the workbook (case-insensitive). Collisions get " (2)", " (3)", …
 */
function worksheetName(raw: string, taken: Set<string>): string {
  const cleaned =
    raw
      .replace(/[:\\/?*[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31)
      .trim() || "Sheet";
  let candidate = cleaned;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = cleaned.slice(0, 31 - suffix.length).trimEnd() + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

// ---- BOM tab -----------------------------------------------------------------

/** The per-row category: "Fabric" for fabrics; for trims the specific KIND —
 *  exactly the on-screen table's Category cell. */
function bomCategory(row: BomRow): string {
  if (row.group !== "trim") return "Fabric";
  return row.data.trim_kind ? TRIM_KIND_LABEL[row.data.trim_kind] : "Trim";
}

function addBomSheet(
  workbook: ExcelJS.Workbook,
  rows: BomRow[],
  taken: Set<string>,
): void {
  const ws = workbook.addWorksheet(worksheetName("BOM", taken), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Ref",
    "Category",
    "Item",
    "Composition",
    "Colour",
    "GSM",
    "Width (cm)",
    "Placement",
    "Qty",
    "Unit",
    "Unit cost",
    "Total",
    "Notes",
  ];
  const widths = [8, 12, 30, 30, 16, 8, 11, 22, 9, 11, 10, 11, 40];
  widths.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = solidFill(HEADER_ARGB);
  });

  const UNIT_COST_COL = 11;
  const TOTAL_COL = 12;

  for (const row of rows) {
    const d = row.data;
    const total = rowTotal(d);
    const added = ws.addRow([
      row.ref,
      bomCategory(row),
      d.library_item_name,
      d.composition,
      d.colour,
      d.gsm,
      d.width_cm,
      d.placement,
      d.quantity,
      d.unit ? UNIT_LABEL[d.unit] : null,
      d.unit_cost,
      total,
      d.notes,
    ]);
    added.getCell(1).font = { bold: true };
    added.getCell(UNIT_COST_COL).numFmt = CURRENCY_FMT;
    added.getCell(TOTAL_COL).numFmt = CURRENCY_FMT;
  }

  // Total material cost — a live SUM over the Total column so the figure
  // stays right when a factory edits quantities/costs in their copy. The
  // label sits in the Ref column ("TOTAL"), easy to filter out on import.
  const totals = rows
    .map((row) => rowTotal(row.data))
    .filter((t): t is number => t !== null);
  if (totals.length > 0) {
    const firstDataRow = 2;
    const lastDataRow = 1 + rows.length;
    const col = columnLetter(TOTAL_COL);
    const totalRow = ws.addRow([]);
    const labelCell = totalRow.getCell(1);
    labelCell.value = "TOTAL";
    labelCell.font = { bold: true };
    const sumCell = totalRow.getCell(TOTAL_COL);
    sumCell.value = {
      formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`,
      result: totals.reduce((sum, t) => sum + t, 0),
    };
    sumCell.font = { bold: true };
    sumCell.numFmt = CURRENCY_FMT;
  }
}

// ---- Spec Sheet tabs -----------------------------------------------------------

/** Rows of header context above the spec table (labels in A, values in B). */
const SPEC_INFO_ROWS = 5;
/** The table header row number: info block + one blank spacer. */
const SPEC_HEADER_ROW = SPEC_INFO_ROWS + 2;
/** Code / Measurement / Tol — the columns frozen when scrolling sizes. */
const SPEC_FIXED_COLS = 3;

function addSpecSheet(
  workbook: ExcelJS.Workbook,
  table: ResolvedSpecTable,
  input: TechpackWorkbookInput,
  taken: Set<string>,
): void {
  const ws = workbook.addWorksheet(
    worksheetName(`Spec - ${table.displayName}`, taken),
    {
      views: [
        { state: "frozen", xSplit: SPEC_FIXED_COLS, ySplit: SPEC_HEADER_ROW },
      ],
    },
  );

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 8;
  table.columns.forEach((_, i) => {
    ws.getColumn(SPEC_FIXED_COLS + 1 + i).width = 9;
  });

  // Header context block — plain label/value pairs, no merged cells.
  const info: [string, string][] = [
    ["Product", input.productName],
    ["Style #", input.styleNumber ?? ""],
    ["Version", input.versionLabel],
    [
      "Sheet",
      `${table.displayName} (${demographicLabel(table.sheet.demographic)})`,
    ],
    ["Grading", specSheetCaption(table)],
  ];
  for (const [label, value] of info) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  ws.addRow([]);

  const headerRow = ws.addRow([
    "Code",
    "Measurement",
    "Tol ±",
    ...table.columns.map((col) => col.label),
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = solidFill(HEADER_ARGB);
  });
  table.columns.forEach((col, i) => {
    const cell = headerRow.getCell(SPEC_FIXED_COLS + 1 + i);
    cell.alignment = { horizontal: "right" };
    if (col.isSample) {
      cell.fill = solidFill(SAMPLE_HEAD_ARGB);
      cell.note = "Physically measured sample size.";
    }
  });

  for (const row of table.rows) {
    const added = ws.addRow([row.code, row.name, row.tolerance, ...row.values]);
    added.getCell(1).font = { bold: true };
    if (row.tolerance !== null) added.getCell(3).numFmt = TOLERANCE_FMT;
    table.columns.forEach((col, i) => {
      if (col.isSample) {
        added.getCell(SPEC_FIXED_COLS + 1 + i).fill =
          solidFill(SAMPLE_CELL_ARGB);
      }
    });
  }
}

// ---- Workbook ------------------------------------------------------------------

/**
 * Build the workbook: a BOM tab when the product has fabric/trim rows, one tab
 * per resolvable Spec Sheet, and — so an export never yields a corrupt or
 * zero-sheet file — an Info tab when BOTH datasets are empty. Returns the
 * .xlsx bytes (ExcelJS's writeBuffer yields a Node Buffer at runtime; it is
 * copied into a plain Uint8Array so callers aren't tied to ExcelJS's
 * own ArrayBuffer-flavoured Buffer typing).
 */
export async function buildTechpackWorkbook(
  input: TechpackWorkbookInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GarSpec";
  workbook.created = new Date();

  const taken = new Set<string>();

  if (input.bomRows.length > 0) {
    addBomSheet(workbook, input.bomRows, taken);
  }
  for (const table of input.specTables) {
    addSpecSheet(workbook, table, input, taken);
  }

  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet(worksheetName("Info", taken));
    ws.getColumn(1).width = 90;
    ws.addRow([`${input.productName}, tech pack data export`]);
    ws.getRow(1).font = { bold: true };
    ws.addRow([
      "No Bill of Materials or Size Specification data yet. Add Fabrics & Trim pins in Technical Details, or create a Spec Sheet in Size Specifications, then export again.",
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
