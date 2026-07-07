/**
 * The Size Specification PDF page(s) — the export twin of the on-screen Spec
 * Sheet (`components/spec/spec-sheet-table.tsx`): one titled table per Spec
 * Sheet, POM rows down the side (code + name), the sheet's size run across, a
 * tolerance column, in the established page chrome (shared Header/Footer,
 * hairline rules). A product with several sheets (Youth + Men's + Women's)
 * renders each as its own section, in list (created_at) order.
 *
 * Values are the FULLY-RESOLVED sheet: stored cells as entered, every other
 * auto-mode column re-graded live through the same `gradeSheet` engine the UI
 * uses — computed values are never persisted, so the export re-derives them.
 * The physically-measured sample column(s) are marked (tinted + a SAMPLE tag
 * in the header) so the factory can tell measured from graded. A caption
 * under the table names the Grading Profile and the knit/woven tolerance
 * basis.
 *
 * Pagination never clips: sheets too WIDE for landscape A4 split their size
 * columns into chunks (the code/name/tolerance columns repeat on every chunk,
 * each capped so a full adult ladder still fits one page); sheets too TALL
 * continue onto pages that repeat the column captions, titled "(continued)".
 */

import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  formatSpecValue,
  gradableRow,
  gradingRulesFromProfile,
  storedValuesByRow,
  toleranceSetForFabric,
} from "@/components/spec/spec-data";
import { demographicLabel } from "@/components/spec/spec-demographics";
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
import {
  findSizeIndex,
  gradeSheet,
  normalizeSizeLabel,
  toleranceForRow,
} from "@/lib/spec-grading";
import type { GradingProfile, ResolvedSpecSheet } from "@/types";

// ---- Table geometry --------------------------------------------------------------

// The same page bands as the BOM table pages.
const TABLE_TOP = MARGIN + HEADER_H + 10;
const TABLE_BOTTOM = PAGE_H - MARGIN - FOOTER_H - 6;
const HEAD_ROW_H = 17;
const DATA_ROW_H = 14;
/** The one-line profile/tolerance caption under the table (gap + text). */
const CAPTION_H = 14;

const TABLE_W = PAGE_W - MARGIN * 2;
const CODE_W = 36;
/** The POM name column never shrinks below this; it absorbs spare width. */
const NAME_MIN_W = 150;
const TOL_W = 40;
/** Size columns stay readable between these bounds (7pt values + padding). */
const SIZE_MIN_W = 42;
const SIZE_MAX_W = 72;

/** Size columns per page chunk — 13, so a full adult ladder (XXS–8XL) still
 *  fits one landscape page; longer runs continue on extra chunk pages. */
export const MAX_SIZE_COLS = Math.floor(
  (TABLE_W - CODE_W - NAME_MIN_W - TOL_W) / SIZE_MIN_W,
);

/** POM rows per page beneath the repeated captions, above the caption line. */
const ROWS_PER_PAGE = Math.floor(
  (TABLE_BOTTOM - TABLE_TOP - HEAD_ROW_H - CAPTION_H) / DATA_ROW_H,
);

// Sample-column marking: a slightly deeper tint than the caption band for the
// header cell (which also carries the SAMPLE tag), the caption-band tint for
// the value cells — visible but subtle in print.
const SAMPLE_HEAD_BG = "#EDECEA";
const SAMPLE_CELL_BG = BOX_BG;

// ---- Page content ------------------------------------------------------------------

export type SpecPageColumn = { label: string; isSample: boolean };

export type SpecPageRow = {
  code: string;
  name: string;
  /** Pre-formatted "±1.2"; null renders as an em dash. */
  tolerance: string | null;
  /** Formatted values aligned with `columns`; null renders as an em dash. */
  values: (string | null)[];
};

/** One rendered page's content — header/footer numbering is attached by the
 *  route, exactly like the BOM pages. */
export type SpecSheetPageContent = {
  /** The header's centre title, e.g. "Size Specification — Men's". */
  title: string;
  columns: SpecPageColumn[];
  rows: SpecPageRow[];
  /** Grading Profile + tolerance basis + unit, under the table. */
  caption: string;
};

export type PdfSpecSheetPageData = {
  header: PdfHeaderData;
  footer: PdfFooterData;
  content: SpecSheetPageContent;
};

/** The caption naming the profile and tolerance basis, so the factory knows
 *  where the graded numbers came from. */
function sheetCaption(
  sheet: ResolvedSpecSheet,
  profile: GradingProfile | null,
  anchor: string | null,
): string {
  const parts: string[] = [];
  if (sheet.mode === "manual") {
    parts.push("Measurements entered manually");
  } else if (profile) {
    parts.push(
      anchor
        ? `Graded from the ${anchor} sample with the “${profile.name}” profile`
        : `Graded with the “${profile.name}” profile`,
    );
    if (profile.break_size_label) {
      parts.push(`size break at ${profile.break_size_label}`);
    }
  } else {
    parts.push("No grading profile applied — sample column(s) only");
  }
  parts.push(`${sheet.fabric_type === "woven" ? "woven" : "knit"} tolerances`);
  parts.push(`values in ${sheet.unit || "cm"}`);
  return parts.join(" · ");
}

/**
 * Resolve and paginate every Spec Sheet into page contents. Sheets with no
 * size run or no rows have nothing to table and are skipped; a product with
 * no sheets at all yields [] and the document simply has no spec pages.
 */
export function buildSpecSheetPages(
  sheets: readonly ResolvedSpecSheet[],
  profilesById: ReadonlyMap<string, GradingProfile>,
): SpecSheetPageContent[] {
  const pages: SpecSheetPageContent[] = [];

  for (const sheet of sheets) {
    const sizeRun = sheet.size_run ?? [];
    const rows = [...sheet.rows].sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
    if (sizeRun.length === 0 || rows.length === 0) continue;

    const stored = storedValuesByRow(sheet.values ?? []);
    const profile = sheet.grading_profile_id
      ? (profilesById.get(sheet.grading_profile_id) ?? null)
      : null;
    const sampleSizes = sheet.sample_sizes ?? [];
    const anchor = sampleSizes[0] ?? sheet.sample_size_label ?? null;

    // Auto sheets re-grade through the SAME engine the on-screen sheet uses —
    // stored sample column(s) + profile are the single source of truth.
    let computed: Record<string, Record<string, number | null>> | null = null;
    if (
      sheet.mode === "auto" &&
      profile &&
      anchor !== null &&
      findSizeIndex(sizeRun, anchor) !== -1
    ) {
      const sampleValues: Record<string, number | null> = {};
      for (const r of rows) {
        sampleValues[r.id] = stored[r.id]?.[normalizeSizeLabel(anchor)] ?? null;
      }
      computed = gradeSheet(
        rows.map(gradableRow),
        anchor,
        sampleValues,
        gradingRulesFromProfile(profile),
        sizeRun,
      );
    }

    const toleranceSet = profile
      ? toleranceSetForFabric(profile, sheet.fabric_type)
      : {};
    const sampleKeys = new Set(sampleSizes.map((s) => normalizeSizeLabel(s)));
    const displayName =
      sheet.name ?? sheet.template_name ?? demographicLabel(sheet.demographic);
    const baseTitle = `Size Specification — ${displayName}`;
    const caption = sheetCaption(sheet, profile, anchor);

    // Wide runs: size columns split across chunk pages; code/name/tolerance
    // repeat on every chunk so each page reads standalone.
    const chunks: string[][] = [];
    for (let i = 0; i < sizeRun.length; i += MAX_SIZE_COLS) {
      chunks.push(sizeRun.slice(i, i + MAX_SIZE_COLS));
    }

    for (const chunk of chunks) {
      const columns: SpecPageColumn[] = chunk.map((label) => ({
        label,
        isSample: sampleKeys.has(normalizeSizeLabel(label)),
      }));
      const chunkTitle =
        chunks.length > 1
          ? `${baseTitle} (${chunk[0]}–${chunk[chunk.length - 1]})`
          : baseTitle;

      const displayRows: SpecPageRow[] = rows.map((row) => {
        const tolerance = toleranceForRow(
          row.grade_category,
          row.sub_kind,
          row.tolerance_override,
          toleranceSet,
        );
        return {
          code: row.code,
          name: row.name,
          tolerance: tolerance !== null ? `±${formatSpecValue(tolerance)}` : null,
          values: chunk.map((label) => {
            const value =
              stored[row.id]?.[normalizeSizeLabel(label)] ??
              computed?.[row.id]?.[label] ??
              null;
            return value !== null ? formatSpecValue(value) : null;
          }),
        };
      });

      // Tall sheets: continue onto pages that repeat the column captions.
      for (let start = 0; start < displayRows.length; start += ROWS_PER_PAGE) {
        pages.push({
          title: start === 0 ? chunkTitle : `${chunkTitle} (continued)`,
          columns,
          rows: displayRows.slice(start, start + ROWS_PER_PAGE),
          caption,
        });
      }
    }
  }

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

function HeadCell({
  width,
  label,
  align,
}: {
  width: number;
  label: string;
  align?: "right";
}) {
  return (
    <Text
      style={{
        width,
        paddingHorizontal: 4,
        fontSize: 6.5,
        fontFamily: "Helvetica-Bold",
        color: MUTED,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        textAlign: align ?? "left",
      }}
    >
      {label}
    </Text>
  );
}

export function SpecSheetPage({ data }: { data: PdfSpecSheetPageData }) {
  const { title, columns, rows, caption } = data.content;
  const sizeW = Math.min(
    SIZE_MAX_W,
    (TABLE_W - CODE_W - NAME_MIN_W - TOL_W) / columns.length,
  );
  const nameW = TABLE_W - CODE_W - TOL_W - sizeW * columns.length;

  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      <Header data={data.header} title={title} />

      <View
        style={{
          position: "absolute",
          left: MARGIN,
          top: TABLE_TOP,
          width: TABLE_W,
        }}
      >
        {/* Column captions — repeated on every spec page. */}
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
          <HeadCell width={CODE_W} label="Code" />
          <HeadCell width={nameW} label="Measurement" />
          <HeadCell width={TOL_W} label="Tol ±" align="right" />
          {columns.map((col) => (
            <View
              key={col.label}
              style={{
                width: sizeW,
                height: HEAD_ROW_H,
                justifyContent: "center",
                alignItems: "flex-end",
                paddingHorizontal: 4,
                backgroundColor: col.isSample ? SAMPLE_HEAD_BG : undefined,
              }}
            >
              <Text
                style={{
                  fontSize: 6.5,
                  fontFamily: "Helvetica-Bold",
                  color: INK,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {col.label}
              </Text>
              {col.isSample && (
                <Text
                  style={{ fontSize: 4.5, color: MUTED, letterSpacing: 0.6 }}
                >
                  SAMPLE
                </Text>
              )}
            </View>
          ))}
        </View>

        {rows.map((row, ri) => (
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
            <Text
              style={{
                width: CODE_W,
                paddingHorizontal: 4,
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
              }}
            >
              {row.code}
            </Text>
            <Text
              style={{
                width: nameW,
                paddingHorizontal: 4,
                fontSize: 7,
                maxLines: 1,
                textOverflow: "ellipsis",
              }}
            >
              {row.name}
            </Text>
            <Text
              style={{
                width: TOL_W,
                paddingHorizontal: 4,
                fontSize: 7,
                color: row.tolerance === null ? MUTED : INK,
                textAlign: "right",
              }}
            >
              {row.tolerance ?? "—"}
            </Text>
            {row.values.map((value, ci) => (
              <View
                key={ci}
                style={{
                  width: sizeW,
                  height: DATA_ROW_H,
                  justifyContent: "center",
                  backgroundColor: columns[ci].isSample
                    ? SAMPLE_CELL_BG
                    : undefined,
                }}
              >
                <Text
                  style={{
                    paddingHorizontal: 4,
                    fontSize: 7,
                    color: value === null ? MUTED : INK,
                    textAlign: "right",
                  }}
                >
                  {value ?? "—"}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 6 }}>
          {caption}
        </Text>
      </View>

      <Footer data={data.footer} />
    </Page>
  );
}
