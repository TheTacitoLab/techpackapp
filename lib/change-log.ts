/**
 * The product Change Log — the ONE place spec changes are recorded and read.
 *
 * `logChange` is the shared helper every spec-mutating server action calls
 * after a successful write (annotations, BOM data via fabric/trim pins,
 * colourways, spec sheets, pages/slots/images, product setup, version bumps).
 * Entries are stamped with the product's CURRENT version label so the log
 * groups cleanly by version; the actor column stays unpopulated until
 * collaboration ships.
 *
 * What is deliberately NEVER logged (meta activity, not specification):
 * page notes, internal notes, exports/downloads, views, opening the editor,
 * section collapse state, marking sections complete, slot framing (debounced
 * pan/zoom), pin moves and badge offsets (pure geometry), lock/unlock, and
 * workspace-library CRUD (labels, master library, grading profiles, brands/
 * seasons/collections — they are workspace entities, not one product's spec;
 * APPLYING a grading profile to a sheet IS logged).
 *
 * Logging must never break the mutation it records: `logChange` swallows its
 * own failures (console.error only). Best-effort by design.
 */

import { productVersionLabel } from "@/lib/product-version";
import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";
import type { CanvasLayerType } from "@/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** How many entries the product page fetches (newest first). */
export const CHANGE_LOG_FETCH_LIMIT = 200;

/**
 * The section/area a change belongs to — a small app-defined slug stored as
 * text (display labels below). Aligned with the product sections where a
 * 1:1 exists; annotation layers get their own areas so "Fabric F2 updated"
 * files under Fabrics & Trim rather than a generic bucket.
 */
export type ChangeArea =
  | "product_setup"
  | "assets"
  | "pages"
  | "technical_details"
  | "colourways"
  | "fabric_trim"
  | "measurements"
  | "construction"
  | "branding"
  | "specs"
  | "version";

export const CHANGE_AREA_LABELS: Record<ChangeArea, string> = {
  product_setup: "Product Setup",
  assets: "Asset Upload",
  pages: "Pages",
  technical_details: "Technical Details",
  colourways: "Colourways",
  fabric_trim: "Fabrics & Trim",
  measurements: "Measurements",
  construction: "Construction",
  branding: "Branding & Labels",
  specs: "Size Specifications",
  version: "Version",
};

/** Display label for a stored area slug — unknown/legacy slugs degrade to text. */
export function changeAreaLabel(area: string): string {
  return (CHANGE_AREA_LABELS as Record<string, string>)[area] ?? area;
}

/** The Change Log area a pin of this layer files under. */
export function changeAreaForLayer(layerType: CanvasLayerType): ChangeArea {
  switch (layerType) {
    case "colourway":
      return "colourways";
    case "fabric":
    case "trim":
      return "fabric_trim";
    case "measurement":
      return "measurements";
    case "stitch":
    case "construction_note":
      return "construction";
    case "branding":
    case "label":
      return "branding";
    default:
      // Retired/auxiliary layer types (thread, packaging, detail_callout…)
      // file under the section that hosts them.
      return "technical_details";
  }
}

/**
 * The human noun for a pin in log descriptions ("Fabric F2 updated"). Total
 * over the enum so retired types can still be described if legacy pins are
 * edited.
 */
export const LAYER_NOUN: Record<CanvasLayerType, string> = {
  fabric: "Fabric",
  trim: "Trim",
  hardware: "Hardware",
  elastic: "Elastic",
  branding: "Branding",
  label: "Label",
  label_component: "Label",
  print: "Print",
  stitch: "Stitch",
  thread: "Thread",
  packaging: "Packaging",
  measurement: "Measurement",
  construction_note: "Construction note",
  detail_callout: "Detail callout",
  colourway: "Colourway pin",
};

/** Human labels for annotation `data` keys in "updated (…)" descriptions. */
const FIELD_LABELS: Record<string, string> = {
  library_item_id: "linked item",
  library_item_name: "linked item",
  library_item_image_url: "linked item",
  category: "category",
  composition: "composition",
  colour: "colour",
  gsm: "GSM",
  width_cm: "width",
  trim_kind: "trim kind",
  placement: "placement",
  quantity: "quantity",
  unit: "unit",
  unit_cost: "unit cost",
  supplier_code: "supplier code",
  notes: "notes",
  colour_name: "colour name",
  hex: "hex",
  pantone: "Pantone",
  name: "name",
  value: "value",
  spi: "SPI",
  thread_colour: "thread colour",
  note_text: "note",
  branding_type: "type",
  label_type: "type",
  width_mm: "width",
  height_mm: "height",
};

/**
 * The keys of `patch` whose values actually differ from `existing`, as
 * deduped human labels — so "Fabric F2 updated (width, unit cost)" names what
 * changed and a save that changed nothing produces NO log entry.
 */
export function changedFieldLabels(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): string[] {
  // "", undefined and a missing key all mean "no value" to every editor
  // (the generic pin editor round-trips missing keys as "") — collapse them
  // to null so a save that changed nothing never fabricates a log entry.
  const normalize = (value: unknown) =>
    value === undefined || value === "" ? null : value;
  const labels: string[] = [];
  for (const key of Object.keys(patch)) {
    const before = normalize(existing[key]);
    const after = normalize(patch[key]);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const label = FIELD_LABELS[key] ?? key.replaceAll("_", " ");
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

/** "(width, unit cost)" / "(name, value +2 more)" — capped field list. */
export function describeChangedFields(labels: string[]): string {
  const shown = labels.slice(0, 3).join(", ");
  const extra = labels.length - 3;
  return extra > 0 ? `(${shown} +${extra} more)` : `(${shown})`;
}

/** Structured metadata carried on a `version` (bump) entry's `data` jsonb. */
export type VersionBumpMeta = {
  note: string | null;
  previous: string | null;
};

/** Defensive reader for a bump entry's jsonb (the one place it is decoded). */
export function readVersionBumpMeta(raw: unknown): VersionBumpMeta {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    note: typeof record.note === "string" && record.note ? record.note : null,
    previous: typeof record.previous === "string" ? record.previous : null,
  };
}

/**
 * Append one Change Log entry, stamped with the product's current version.
 * Called AFTER the mutation it records has succeeded; never throws — a
 * logging failure must not fail the spec change itself.
 */
export async function logChange(
  supabase: ServerClient,
  input: {
    productId: string;
    workspaceId: string;
    area: ChangeArea;
    description: string;
    meta?: Record<string, Json>;
  },
): Promise<void> {
  try {
    const { data: product, error: versionError } = await supabase
      .from("products")
      .select("version_major, version_minor")
      .eq("id", input.productId)
      .eq("workspace_id", input.workspaceId)
      .single();
    // Never fabricate a version stamp: a mis-filed entry in an append-only
    // log is worse than a dropped one (best-effort by design), and a wrong
    // stamp would also break the display's grouped-by-version contiguity.
    if (versionError || !product) {
      console.error(
        "[change-log] entry skipped, version read failed:",
        versionError?.message ?? "product not found",
      );
      return;
    }
    const version = productVersionLabel(
      product.version_major,
      product.version_minor,
    );

    const { error } = await supabase.from("product_change_log").insert({
      product_id: input.productId,
      workspace_id: input.workspaceId,
      version,
      area: input.area,
      description: input.description,
      data: (input.meta ?? {}) as Json,
      // actor_id deliberately unpopulated — collaboration-ready, not live.
    });
    if (error) console.error("[change-log] insert failed:", error.message);
  } catch (err) {
    console.error("[change-log] failed:", err);
  }
}
