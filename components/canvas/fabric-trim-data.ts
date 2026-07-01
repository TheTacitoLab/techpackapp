import type {
  CanvasAnnotation,
  CanvasLayerType,
  FabricTrimAnnotationData,
  LibraryCategory,
  ResolvedLibraryItem,
} from "@/types";

/** The four `layer_type`s the Fabrics & Trim canvas layer covers. */
export const FABRIC_FAMILY_TYPES: readonly CanvasLayerType[] = [
  "fabric",
  "trim",
  "hardware",
  "elastic",
];

export function isFabricFamilyType(layerType: CanvasLayerType): boolean {
  return (FABRIC_FAMILY_TYPES as readonly string[]).includes(layerType);
}

/**
 * `library_items.category` doesn't name-match `canvas_layer_type` 1:1 — the
 * canvas layer_type `hardware` corresponds to the library category `fastener`
 * (there is no `hardware` library category). Confirmed against the enum in
 * `supabase/migrations/0008_library_schema.sql`.
 */
export const FABRIC_FAMILY_TO_LIBRARY_CATEGORY: Record<
  "fabric" | "trim" | "hardware" | "elastic",
  LibraryCategory
> = {
  fabric: "fabric",
  trim: "trim",
  hardware: "fastener",
  elastic: "elastic",
};

/** Display label for the sub-type segmented control (new-pin creation only). */
export const FABRIC_FAMILY_LABEL: Record<
  "fabric" | "trim" | "hardware" | "elastic",
  string
> = {
  fabric: "Fabric",
  trim: "Trim",
  hardware: "Fastener",
  elastic: "Elastic",
};

function readProp(
  properties: Record<string, unknown> | null,
  key: string,
): unknown {
  return properties?.[key] ?? null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One entry of a library item's `properties.colours` array, if present. */
export type LibraryColourOption = { name: string; hex?: string };

/**
 * Library items store colour variants as `properties.colours: [{name, hex,
 * pantone_tcx}]` (confirmed against the seed data in
 * `supabase/migrations/0010_library_seed.sql`) — not a single flat `colour`
 * string. Falls back to a flat `colour`/`color` property for items that might
 * carry one, else returns an empty list (the editor then free-types colour).
 */
export function libraryColourOptions(
  item: ResolvedLibraryItem,
): LibraryColourOption[] {
  const props = item.properties as Record<string, unknown> | null;
  const raw = props?.colours;
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (c): c is { name: string; hex?: string } =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as { name?: unknown }).name === "string",
      )
      .map((c) => ({ name: c.name, hex: typeof c.hex === "string" ? c.hex : undefined }));
  }
  const flat = asString(readProp(props, "colour")) ?? asString(readProp(props, "color"));
  return flat ? [{ name: flat }] : [];
}

/**
 * Auto-fill the denormalised library fields onto a new/updated annotation's
 * data from the selected library item. `supplier_code` isn't present in any
 * current seed data (no library item carries one yet) — read defensively so
 * this stays correct if/when it's added, and it's editable per-pin regardless.
 */
export function fabricTrimDataFromLibraryItem(
  item: ResolvedLibraryItem,
  colour: string | null,
): Pick<
  FabricTrimAnnotationData,
  | "library_item_id"
  | "library_item_name"
  | "category"
  | "composition"
  | "colour"
  | "gsm"
  | "supplier_code"
> {
  const props = item.properties as Record<string, unknown> | null;
  return {
    library_item_id: item.id,
    library_item_name: item.name,
    category: item.category,
    composition: asString(readProp(props, "composition")),
    colour,
    gsm: asNumber(readProp(props, "gsm")),
    supplier_code: asString(readProp(props, "supplier_code")),
  };
}

/**
 * One-line summary for a library item in the picker combobox, generic across
 * categories: composition for fabrics, otherwise a small set of common
 * property keys seen across trim/fastener/elastic items (brand, gauge,
 * material, width/size) — whichever are present, joined. Falls back to the
 * item's `description` column, then null (picker just shows the name).
 */
export function libraryItemSummaryLine(item: ResolvedLibraryItem): string | null {
  const props = item.properties as Record<string, unknown> | null;
  const composition = asString(readProp(props, "composition"));
  if (composition) return composition;

  const parts = [
    asString(readProp(props, "brand")),
    asString(readProp(props, "material")),
    readProp(props, "gauge") != null ? `Gauge ${String(readProp(props, "gauge"))}` : null,
    readProp(props, "size_mm") != null ? `${String(readProp(props, "size_mm"))}mm` : null,
    readProp(props, "width_mm") != null ? `${String(readProp(props, "width_mm"))}mm wide` : null,
    readProp(props, "elastic_type") != null ? String(readProp(props, "elastic_type")) : null,
  ].filter((v): v is string => !!v);

  if (parts.length > 0) return parts.join(" · ");
  return item.description ?? null;
}

/**
 * Read an annotation's `data` jsonb as `FabricTrimAnnotationData`, defensively
 * — every field defaults to null rather than throwing. Annotations created
 * before this session only have `{ label, notes }`; those are surfaced as a
 * display fallback (`library_item_name` <- `label`) so old pins render
 * sensibly instead of showing blank fields. Data is never rewritten to the new
 * shape automatically — only an explicit save (via the new editor) migrates it.
 */
export function readFabricTrimData(
  data: CanvasAnnotation["data"],
): FabricTrimAnnotationData {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return {
    library_item_id: asString(raw.library_item_id),
    library_item_name: asString(raw.library_item_name) ?? asString(raw.label),
    category: asString(raw.category) as LibraryCategory | null,
    composition: asString(raw.composition),
    colour: asString(raw.colour),
    gsm: asNumber(raw.gsm),
    placement: asString(raw.placement),
    quantity: asNumber(raw.quantity),
    unit: asString(raw.unit) as FabricTrimAnnotationData["unit"],
    supplier_code: asString(raw.supplier_code),
    notes: asString(raw.notes),
  };
}
