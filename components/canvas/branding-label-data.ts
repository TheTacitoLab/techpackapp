import type {
  BrandingLabelAnnotationData,
  BrandingType,
  CanvasAnnotation,
  CanvasLayerType,
  LabelType,
  LibraryCategory,
  ResolvedLibraryItem,
} from "@/types";

/**
 * The family a Branding & Labels pin belongs to — Branding (B) for applied
 * branded elements, Label (L) for functional garment labels — mirroring how
 * Fabrics & Trim splits into fabric/trim. The family IS the pin's layer_type
 * (it fixes the reference-code prefix, immutable after creation); the
 * specific type within a family is a stored data field, never in the code.
 */
export type BrandingLabelFamilyKey = "branding" | "label";

/** The two `layer_type`s the Branding & Labels canvas layer covers. */
export const BRANDING_LABEL_FAMILY_TYPES: readonly CanvasLayerType[] = [
  "branding",
  "label",
];

export function isBrandingLabelType(layerType: CanvasLayerType): boolean {
  return (BRANDING_LABEL_FAMILY_TYPES as readonly string[]).includes(layerType);
}

/** Display label for the family segmented control (new-pin creation only). */
export const BRANDING_LABEL_FAMILY_LABEL: Record<BrandingLabelFamilyKey, string> =
  {
    branding: "Branding",
    label: "Labels",
  };

/**
 * The Master Library categories each family's OPTIONAL artwork/spec link
 * draws from — the pre-existing `print_type` (artwork specs) for Branding and
 * `label_type` for Labels, both already carrying field definitions in the
 * shared `FIELD_CONFIG`, so the inline quick-add works for them unchanged.
 */
export const BRANDING_LABEL_LIBRARY_CATEGORIES: Record<
  BrandingLabelFamilyKey,
  readonly LibraryCategory[]
> = {
  branding: ["print_type"],
  label: ["label_type"],
};

/** Dropdown order for the Branding-type field. */
export const BRANDING_TYPES: readonly BrandingType[] = [
  "screen_print",
  "heat_transfer",
  "embroidery",
  "woven_badge",
  "silicone_badge",
  "reflective",
  "sublimation",
  "deboss_emboss",
  "applique",
  "other",
];

export const BRANDING_TYPE_LABEL: Record<BrandingType, string> = {
  screen_print: "Screen print",
  heat_transfer: "Heat transfer",
  embroidery: "Embroidery",
  woven_badge: "Woven badge",
  silicone_badge: "Silicone badge",
  reflective: "Reflective print",
  sublimation: "Sublimation print",
  deboss_emboss: "Deboss / emboss",
  applique: "Appliqué",
  other: "Other",
};

/** Dropdown order for the Label-type field. */
export const LABEL_TYPES: readonly LabelType[] = [
  "brand_label",
  "care_label",
  "size_tab",
  "woven_label",
  "heat_transfer_label",
  "origin_label",
  "content_label",
  "rfid_label",
  "other",
];

export const LABEL_TYPE_LABEL: Record<LabelType, string> = {
  brand_label: "Brand label",
  care_label: "Care label",
  size_tab: "Size tab",
  woven_label: "Woven label",
  heat_transfer_label: "Heat-transfer label",
  origin_label: "Origin label",
  content_label: "Content label",
  rfid_label: "RFID label",
  other: "Other",
};

/**
 * The human-readable specific type of a pin, from whichever family field is
 * set — "Embroidery", "Care label" — or null when the type isn't chosen yet.
 * One helper so the editor, list panel/tooltip, and the future PDF export all
 * print the same words.
 */
export function brandingLabelTypeLabel(
  d: Pick<BrandingLabelAnnotationData, "branding_type" | "label_type">,
): string | null {
  if (d.branding_type) return BRANDING_TYPE_LABEL[d.branding_type];
  if (d.label_type) return LABEL_TYPE_LABEL[d.label_type];
  return null;
}

/**
 * "30×26mm" from width/height — the compact dimensions string real tech packs
 * use. One-sided values still render ("30mm"); both-null renders nothing.
 */
export function formatDimensionsMm(
  width: number | null,
  height: number | null,
): string | null {
  if (width !== null && height !== null) return `${width}×${height}mm`;
  if (width !== null) return `${width}mm`;
  if (height !== null) return `${height}mm`;
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

/**
 * One-line summary for a library item in this layer's picker: the key spec
 * fields of the `label_type` / `print_type` categories (matching their
 * `FIELD_CONFIG` fields), whichever are present. Falls back to the item's
 * description, then null (picker just shows the name).
 */
export function brandingLabelSummaryLine(
  item: ResolvedLibraryItem,
): string | null {
  const props = item.properties as Record<string, unknown> | null;
  const parts = [
    asString(readProp(props, "size_mm")),
    asString(readProp(props, "construction")),
    asString(readProp(props, "attachment")),
    asString(readProp(props, "artwork_format")),
    asString(readProp(props, "colour_mode")),
  ].filter((v): v is string => !!v);
  if (parts.length > 0) return parts.slice(0, 3).join(" · ");
  return item.description ?? null;
}

/**
 * Denormalise the OPTIONAL library link onto the pin: id, name, and image
 * (for the list-panel thumbnail + future PDF, same slot Construction's stitch
 * diagrams use), plus a flat `colour` property if the item carries one —
 * "auto-fill where available", everything stays editable on the pin.
 */
export function brandingLabelDataFromLibraryItem(item: ResolvedLibraryItem): {
  library_item_id: string;
  library_item_name: string;
  library_item_image_url: string | null;
  colour: string | null;
} {
  const props = item.properties as Record<string, unknown> | null;
  return {
    library_item_id: item.id,
    library_item_name: item.name,
    library_item_image_url: item.image_url,
    colour:
      asString(readProp(props, "colour")) ?? asString(readProp(props, "color")),
  };
}

/**
 * Read an annotation's `data` jsonb as `BrandingLabelAnnotationData`,
 * defensively — every field defaults to null rather than throwing, and the
 * two type fields are validated against their unions so a bad value can only
 * degrade to "no type", never crash a render.
 */
export function readBrandingLabelData(
  data: CanvasAnnotation["data"],
): BrandingLabelAnnotationData {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const rawBranding = asString(raw.branding_type);
  const rawLabel = asString(raw.label_type);

  return {
    branding_type: (BRANDING_TYPES as readonly string[]).includes(
      rawBranding ?? "",
    )
      ? (rawBranding as BrandingType)
      : null,
    label_type: (LABEL_TYPES as readonly string[]).includes(rawLabel ?? "")
      ? (rawLabel as LabelType)
      : null,
    library_item_id: asString(raw.library_item_id),
    library_item_name: asString(raw.library_item_name),
    library_item_image_url: asString(raw.library_item_image_url),
    width_mm: asNumber(raw.width_mm),
    height_mm: asNumber(raw.height_mm),
    placement: asString(raw.placement),
    colour: asString(raw.colour),
    notes: asString(raw.notes),
  };
}
