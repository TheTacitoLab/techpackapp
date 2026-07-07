/**
 * The Bill of Materials PDF page(s) — the export twin of the on-screen BOM
 * (`components/bom/bom-table.tsx`): one table derived purely from the
 * product's Fabrics & Trim annotations, grouped Fabrics then Trims in
 * reference-code order, in the established page chrome (shared Header with a
 * "Bill of Materials" title, shared Footer, hairline rules).
 *
 * Columns are dynamic: a column with no value in ANY row is dropped
 * gracefully (Ref and Item always render). Long tables paginate onto
 * continuation pages — the column captions repeat on every page and a group
 * split across the boundary repeats its header as "… (continued)". Zero
 * fabric/trim rows means the caller simply renders no BOM page at all.
 */

import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  TRIM_KIND_LABEL,
  isFabricFamilyType,
  readFabricTrimData,
} from "@/components/canvas/fabric-trim-data";
import { BOX_BG, HAIRLINE, INK, MUTED } from "@/lib/pdf/branding";
import {
  FOOTER_H,
  HEADER_H,
  MARGIN,
  PAGE_H,
  PAGE_W,
} from "@/lib/pdf/page-geometry";
import {
  Header,
  Footer,
  type PdfFooterData,
  type PdfHeaderData,
} from "@/lib/pdf/render-techpack-page";
import type { CanvasAnnotation, FabricTrimAnnotationData } from "@/types";

// ---- Rows ---------------------------------------------------------------------

export type BomRow = {
  group: "fabric" | "trim";
  ref: string;
  data: FabricTrimAnnotationData;
};

const GROUP_LABEL: Record<BomRow["group"], string> = {
  fabric: "Fabrics",
  trim: "Trims",
};

/** The rows exactly as the on-screen BOM shows them: fabric/trim annotations
 *  only, grouped Fabrics then Trims, reference-code order within each group. */
export function buildBomRows(annotations: CanvasAnnotation[]): BomRow[] {
  const groups: BomRow["group"][] = ["fabric", "trim"];
  return groups.flatMap((group) =>
    annotations
      .filter((a) => a.layer_type === group && isFabricFamilyType(a.layer_type))
      .sort((a, b) =>
        a.reference_code.localeCompare(b.reference_code, undefined, {
          numeric: true,
        }),
      )
      .map((a) => ({
        group,
        ref: a.reference_code,
        data: readFabricTrimData(a.data),
      })),
  );
}

// ---- Columns --------------------------------------------------------------------

const QTY_UNIT_SUFFIX: Record<
  NonNullable<FabricTrimAnnotationData["unit"]>,
  string
> = {
  per_metre: " /m",
  per_unit: " /unit",
  per_kg: " /kg",
};

function formatNumber(value: number): string {
  return String(value);
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

/** Total = qty × unit cost, only when BOTH are present. */
export function rowTotal(d: FabricTrimAnnotationData): number | null {
  return d.quantity !== null && d.unit_cost !== null
    ? d.quantity * d.unit_cost
    : null;
}

export type BomColumn = {
  key: string;
  label: string;
  /** Fixed width in points, or a flex weight for the text columns. */
  fixed?: number;
  flex?: number;
  align?: "right";
  value: (row: BomRow) => string | null;
  /** Whether the column has anything to say across the WHOLE row set —
   *  wholly-empty columns are dropped. Undefined means always shown. */
  present?: (rows: BomRow[]) => boolean;
};

const ALL_COLUMNS: BomColumn[] = [
  { key: "ref", label: "Ref", fixed: 30, value: (r) => r.ref },
  {
    key: "item",
    label: "Item",
    flex: 1.25,
    value: (r) => r.data.library_item_name,
  },
  {
    key: "kind",
    label: "Kind",
    fixed: 52,
    // Trims carry their specific kind (falling back to plain "Trim"); the
    // column only exists when there are trim rows at all.
    value: (r) =>
      r.group === "trim"
        ? r.data.trim_kind
          ? TRIM_KIND_LABEL[r.data.trim_kind]
          : "Trim"
        : null,
    present: (rows) => rows.some((r) => r.group === "trim"),
  },
  {
    key: "composition",
    label: "Composition",
    flex: 1.25,
    value: (r) => r.data.composition,
    present: (rows) => rows.some((r) => r.data.composition !== null),
  },
  {
    key: "colour",
    label: "Colour",
    fixed: 62,
    value: (r) => r.data.colour,
    present: (rows) => rows.some((r) => r.data.colour !== null),
  },
  {
    key: "gsm",
    label: "GSM",
    fixed: 32,
    align: "right",
    value: (r) => (r.data.gsm !== null ? formatNumber(r.data.gsm) : null),
    present: (rows) => rows.some((r) => r.data.gsm !== null),
  },
  {
    key: "width",
    label: "Width (cm)",
    fixed: 46,
    align: "right",
    value: (r) =>
      r.data.width_cm !== null ? formatNumber(r.data.width_cm) : null,
    present: (rows) => rows.some((r) => r.data.width_cm !== null),
  },
  {
    key: "placement",
    label: "Placement",
    flex: 1,
    value: (r) => r.data.placement,
    present: (rows) => rows.some((r) => r.data.placement !== null),
  },
  {
    key: "qty",
    label: "Qty",
    fixed: 50,
    align: "right",
    value: (r) =>
      r.data.quantity !== null
        ? `${formatNumber(r.data.quantity)}${r.data.unit ? QTY_UNIT_SUFFIX[r.data.unit] : ""}`
        : null,
    present: (rows) => rows.some((r) => r.data.quantity !== null),
  },
  {
    key: "unitCost",
    label: "Unit cost",
    fixed: 44,
    align: "right",
    value: (r) =>
      r.data.unit_cost !== null ? formatMoney(r.data.unit_cost) : null,
    present: (rows) => rows.some((r) => r.data.unit_cost !== null),
  },
  {
    key: "total",
    label: "Total",
    fixed: 44,
    align: "right",
    value: (r) => {
      const total = rowTotal(r.data);
      return total !== null ? formatMoney(total) : null;
    },
    present: (rows) => rows.some((r) => rowTotal(r.data) !== null),
  },
];

/** The columns visible for a given row set — decided ONCE against all rows so
 *  every continuation page shares an identical column layout. */
export function visibleBomColumns(rows: BomRow[]): BomColumn[] {
  return ALL_COLUMNS.filter((c) => (c.present ? c.present(rows) : true));
}

/** Resolved per-column widths: fixed columns keep their points, the flex
 *  columns split what's left by weight. */
function columnWidths(columns: BomColumn[]): number[] {
  const tableW = PAGE_W - MARGIN * 2;
  const fixedTotal = columns.reduce((n, c) => n + (c.fixed ?? 0), 0);
  const flexTotal = columns.reduce((n, c) => n + (c.flex ?? 0), 0);
  const flexSpace = Math.max(0, tableW - fixedTotal);
  return columns.map((c) =>
    c.fixed !== undefined ? c.fixed : (flexSpace * (c.flex ?? 0)) / flexTotal,
  );
}

// ---- Pagination ------------------------------------------------------------------

export type BomDisplayRow =
  | { kind: "group"; label: string }
  | { kind: "row"; row: BomRow };

// Table band geometry — the same page bands as every other page.
const TABLE_TOP = MARGIN + HEADER_H + 10;
const TABLE_BOTTOM = PAGE_H - MARGIN - FOOTER_H - 6;
const HEAD_ROW_H = 17;
const GROUP_ROW_H = 14;
const DATA_ROW_H = 14;
/** Rows budget per page, in points, beneath the repeated column captions. */
const PAGE_BUDGET = TABLE_BOTTOM - TABLE_TOP - HEAD_ROW_H;

/**
 * Chunk the grouped rows into pages by the fixed row heights. Each page gets
 * the column captions again; a group whose rows continue onto the next page
 * re-announces itself there as "{Group} (continued)".
 */
export function paginateBom(rows: BomRow[]): BomDisplayRow[][] {
  const pages: BomDisplayRow[][] = [];
  let current: BomDisplayRow[] = [];
  let used = 0;
  let openGroup: BomRow["group"] | null = null;

  function push(row: BomDisplayRow, height: number) {
    if (used + height > PAGE_BUDGET && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      // Re-announce the group a data row continues under.
      if (row.kind === "row" && openGroup === row.row.group) {
        current.push({
          kind: "group",
          label: `${GROUP_LABEL[row.row.group]} (continued)`,
        });
        used += GROUP_ROW_H;
      }
    }
    current.push(row);
    used += height;
  }

  for (const row of rows) {
    if (row.group !== openGroup) {
      openGroup = row.group;
      push({ kind: "group", label: GROUP_LABEL[row.group] }, GROUP_ROW_H);
    }
    push({ kind: "row", row }, DATA_ROW_H);
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

// ---- Page component ---------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: INK,
    backgroundColor: "#FFFFFF",
  },
});

export type PdfBomPageData = {
  header: PdfHeaderData;
  footer: PdfFooterData;
  rows: BomDisplayRow[];
  /** Shared across all BOM pages — computed once from the full row set. */
  columns: BomColumn[];
};

export function BomPage({ data }: { data: PdfBomPageData }) {
  const widths = columnWidths(data.columns);

  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      <Header data={data.header} title="Bill of Materials" />

      <View
        style={{
          position: "absolute",
          left: MARGIN,
          top: TABLE_TOP,
          width: PAGE_W - MARGIN * 2,
        }}
      >
        {/* Column captions — repeated on every BOM page. */}
        <View
          style={{
            flexDirection: "row",
            height: HEAD_ROW_H,
            alignItems: "center",
            backgroundColor: BOX_BG,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: HAIRLINE,
          }}
        >
          {data.columns.map((col, i) => (
            <Text
              key={col.key}
              style={{
                width: widths[i],
                paddingHorizontal: 4,
                fontSize: 6.5,
                fontFamily: "Helvetica-Bold",
                color: MUTED,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                textAlign: col.align ?? "left",
              }}
            >
              {col.label}
            </Text>
          ))}
        </View>

        {data.rows.map((display, ri) =>
          display.kind === "group" ? (
            <View
              key={ri}
              style={{
                height: GROUP_ROW_H,
                justifyContent: "center",
                borderBottomWidth: 0.5,
                borderBottomColor: HAIRLINE,
              }}
            >
              <Text
                style={{
                  paddingHorizontal: 4,
                  fontSize: 6.5,
                  fontFamily: "Helvetica-Bold",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {display.label}
              </Text>
            </View>
          ) : (
            <View
              key={ri}
              style={{
                flexDirection: "row",
                height: DATA_ROW_H,
                alignItems: "center",
                borderBottomWidth: 0.5,
                borderBottomColor: HAIRLINE,
              }}
            >
              {data.columns.map((col, i) => {
                const value = col.value(display.row);
                return (
                  <Text
                    key={col.key}
                    style={{
                      width: widths[i],
                      paddingHorizontal: 4,
                      fontSize: 7,
                      color: value === null ? MUTED : INK,
                      fontFamily:
                        col.key === "ref" ? "Helvetica-Bold" : "Helvetica",
                      textAlign: col.align ?? "left",
                      maxLines: 1,
                      textOverflow: "ellipsis",
                    }}
                  >
                    {value ?? "—"}
                  </Text>
                );
              })}
            </View>
          ),
        )}
      </View>

      <Footer data={data.footer} />
    </Page>
  );
}
