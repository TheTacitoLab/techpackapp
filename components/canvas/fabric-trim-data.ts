import type {
  CanvasAnnotation,
  CanvasLayerType,
  FabricTrimAnnotationData,
  LibraryCategory,
  ResolvedLibraryItem,
  TrimKind,
} from "@/types";

/**
 * The material family a Fabrics & Trim pin belongs to — since the 0023
 * restructure just Fabric (F) and Trim (T), where Trim is an umbrella whose
 * specific kind (fastener/elastic/binding/drawcord/other) is the pin's
 * `data.trim_kind` field, not a separate layer_type. The retired `hardware`/
 * `elastic` layer_types still exist in the DB enum but are never created or
 * offered anywhere (their pins were cleared in migration 0023).
 */
export type FabricFamilyKey = "fabric" | "trim";

/** The two `layer_type`s the Fabrics & Trim canvas layer covers. */
export const FABRIC_FAMILY_TYPES: readonly CanvasLayerType[] = [
  "fabric",
  "trim",
];

export function isFabricFamilyType(layerType: CanvasLayerType): boolean {
  return (FABRIC_FAMILY_TYPES as readonly string[]).includes(layerType);
}

/**
 * The Master Library keeps finer-grained categories than the two material
 * families: fasteners and elastics are their own `library_category` values
 * (confirmed against the enum in `supabase/migrations/0008_library_schema.sql`),
 * but on the canvas they are all just trims. So the Trim family's picker
 * surfaces the `trim`, `fastener` AND `elastic` categories in one list — the
 * library items themselves are untouched by the restructure.
 */
export const FABRIC_FAMILY_LIBRARY_CATEGORIES: Record<
  FabricFamilyKey,
  readonly LibraryCategory[]
> = {
  fabric: ["fabric"],
  trim: ["trim", "fastener", "elastic"],
};

/** Display label for the family segmented control (new-pin creation only). */
export const FABRIC_FAMILY_LABEL: Record<FabricFamilyKey, string> = {
  fabric: "Fabric",
  trim: "Trim",
};

/** Dropdown order for the Trim-type field. */
export const TRIM_KINDS: readonly TrimKind[] = [
  "fastener",
  "elastic",
  "binding",
  "drawcord",
  "other",
];

export const TRIM_KIND_LABEL: Record<TrimKind, string> = {
  fastener: "Fastener",
  elastic: "Elastic",
  binding: "Binding",
  drawcord: "Drawcord",
  other: "Other",
};

/**
 * The trim kind a library item implies, if any: picking a zip from the
 * `fastener` category (or a waistband elastic from `elastic`) auto-fills the
 * pin's Trim type, since the item's category already states what it is.
 * Items from the broad `trim` category imply nothing — binding vs drawcord
 * vs other stays the user's call.
 */
export function trimKindFromLibraryCategory(
  category: LibraryCategory,
): TrimKind | null {
  if (category === "fastener") return "fastener";
  if (category === "elastic") return "elastic";
  return null;
}

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

  const rawKind = asString(raw.trim_kind);
  const trimKind = (TRIM_KINDS as readonly string[]).includes(rawKind ?? "")
    ? (rawKind as TrimKind)
    : null;

  return {
    library_item_id: asString(raw.library_item_id),
    library_item_name: asString(raw.library_item_name) ?? asString(raw.label),
    category: asString(raw.category) as LibraryCategory | null,
    composition: asString(raw.composition),
    colour: asString(raw.colour),
    gsm: asNumber(raw.gsm),
    trim_kind: trimKind,
    placement: asString(raw.placement),
    quantity: asNumber(raw.quantity),
    unit: asString(raw.unit) as FabricTrimAnnotationData["unit"],
    supplier_code: asString(raw.supplier_code),
    notes: asString(raw.notes),
  };
}
