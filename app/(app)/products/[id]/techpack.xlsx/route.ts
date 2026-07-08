import { buildBomRows } from "@/lib/bom-rows";
import { buildTechpackWorkbook } from "@/lib/excel-techpack";
import { exportFilename } from "@/lib/export-filename";
import { resolveSpecTables } from "@/lib/spec-sheet-resolve";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CanvasAnnotation,
  GradingProfile,
  ProductSpecRow,
  ProductSpecSheet,
  ProductSpecValue,
  ResolvedSpecSheet,
} from "@/types";

/**
 * GET /products/{id}/techpack.xlsx
 *
 * The tech pack's STRUCTURED DATA as one Excel workbook — the spreadsheet
 * twin of the PDF export, for factories importing into their own ERP/QC
 * sheets: a "BOM" tab (from the product's Fabrics & Trim pins, the same row
 * derivation as the on-screen table and PDF BOM page) and one tab per Spec
 * Sheet (the full graded table via the same engine resolution as the spec PDF
 * pages — the numbers match the PDF exactly). Whole-product scope in V1: the
 * BOM plus every Spec Sheet; per-section selection arrives with the Export
 * Hub. Auth + workspace scoping match every other data path. Generation is
 * server-side into a single in-memory buffer (workbooks here are KBs, the
 * same pattern as the PDF route), answered as an attachment download.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name, style_number")
    .eq("id", id)
    .eq("workspace_id", user.profile.workspace_id)
    .single();
  if (!product) return new Response("Not found", { status: 404 });

  const [pagesResult, specSheetsResult] = await Promise.all([
    supabase
      .from("canvas_pages")
      .select("id, canvas_slots(id, canvas_annotations(*))")
      .eq("product_id", product.id),
    supabase
      .from("product_spec_sheets")
      .select("*, product_spec_rows(*), product_spec_values(*)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true }),
  ]);

  // Every annotation across the product's pages — buildBomRows keeps only the
  // Fabrics & Trim family and orders them exactly as the app/PDF do.
  type RawSlot = { id: string; canvas_annotations: CanvasAnnotation[] };
  type RawPage = { id: string; canvas_slots: RawSlot[] };
  const annotations = ((pagesResult.data ?? []) as unknown as RawPage[])
    .flatMap((page) => page.canvas_slots ?? [])
    .flatMap((slot) => slot.canvas_annotations ?? []);
  const bomRows = buildBomRows(annotations);

  // Spec Sheets — the same embed shape and profile lookup as the PDF route;
  // resolution (engine re-grade of auto sheets) happens in the shared
  // `resolveSpecTables`, so Excel and PDF cannot diverge.
  type RawSpecSheet = ProductSpecSheet & {
    product_spec_rows: ProductSpecRow[];
    product_spec_values: ProductSpecValue[];
  };
  const specSheets: ResolvedSpecSheet[] = (
    (specSheetsResult.data ?? []) as unknown as RawSpecSheet[]
  ).map(({ product_spec_rows, product_spec_values, ...sheetRest }) => ({
    ...sheetRest,
    rows: product_spec_rows ?? [],
    values: product_spec_values ?? [],
  }));
  const profileIds = [
    ...new Set(
      specSheets
        .map((s) => s.grading_profile_id)
        .filter((pid): pid is string => pid !== null),
    ),
  ];
  const profilesById = new Map<string, GradingProfile>();
  if (profileIds.length > 0) {
    // RLS scopes this to seeded globals + the workspace's own profiles.
    const { data: profiles } = await supabase
      .from("grading_profiles")
      .select("*")
      .in("id", profileIds);
    for (const profile of (profiles ?? []) as GradingProfile[]) {
      profilesById.set(profile.id, profile);
    }
  }
  const specTables = resolveSpecTables(specSheets, profilesById);

  let xlsx: Uint8Array<ArrayBuffer>;
  try {
    xlsx = await buildTechpackWorkbook({
      productName: product.name,
      styleNumber: product.style_number,
      bomRows,
      specTables,
    });
  } catch (err) {
    console.error("[xlsx] buildTechpackWorkbook failed:", err);
    return new Response("Excel generation failed", { status: 500 });
  }

  return new Response(xlsx, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename(product.style_number, product.name, "xlsx")}"`,
      "Cache-Control": "no-store",
    },
  });
}
