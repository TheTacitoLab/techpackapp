import type {
  CanvasAnnotation,
  CanvasLayerType,
  ConstructionAnnotationData,
  ResolvedLibraryItem,
} from "@/types";

/** The two `layer_type`s the Construction canvas layer covers. */
export const CONSTRUCTION_FAMILY_TYPES: readonly CanvasLayerType[] = [
  "stitch",
  "construction_note",
];

export type ConstructionSubType = "stitch" | "construction_note";

export function isConstructionFamilyType(layerType: CanvasLayerType): boolean {
  return (CONSTRUCTION_FAMILY_TYPES as readonly string[]).includes(layerType);
}

/**
 * Display label per sub-type — the segmented control at creation and the
 * read-only "Type:" row in edit mode (sub-type is fixed forever once created,
 * since it determines the reference-code prefix: S for stitch, CN for note).
 */
export const CONSTRUCTION_SUBTYPE_LABEL: Record<ConstructionSubType, string> = {
  stitch: "Stitch Type",
  construction_note: "Construction Note",
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Derive a single editable SPI default from a library item's `spi_range`
 * property. The seeded ranges are STRINGS — "10-12", "8-10", even
 * "42 stitches" (Bartack) — so this extracts the numbers and returns the
 * rounded midpoint of a range, or the lone value when there's only one.
 * Null when the property is missing or carries no number at all; never the
 * raw range string.
 */
export function spiDefaultFromRange(spiRange: string | null): number | null {
  if (!spiRange) return null;
  const matches = spiRange.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const first = Number(matches[0]);
  if (matches.length === 1) return first;
  return Math.round((first + Number(matches[1])) / 2);
}

/** The stitch-specific properties of a `stitch_type` library item. */
export type StitchLibraryDetails = {
  spiRange: string | null;
  isoCode: string | null;
  useCase: string | null;
};

/**
 * Read the seeded `stitch_type` properties (`spi_range`, `iso_code`,
 * `use_case` — confirmed against `supabase/migrations/0010_library_seed.sql`)
 * defensively off a library item's free-form jsonb.
 */
export function stitchLibraryDetails(
  item: ResolvedLibraryItem,
): StitchLibraryDetails {
  const props = item.properties as Record<string, unknown> | null;
  return {
    spiRange: asString(props?.spi_range),
    isoCode: asString(props?.iso_code),
    useCase: asString(props?.use_case),
  };
}

/**
 * One-line summary for a stitch in the picker combobox — SPI range + ISO code
 * + use case, whichever are present. Falls back to the item's `description`,
 * then null (picker just shows the name).
 */
export function stitchSummaryLine(item: ResolvedLibraryItem): string | null {
  const { spiRange, isoCode, useCase } = stitchLibraryDetails(item);
  const parts = [
    spiRange ? `SPI ${spiRange}` : null,
    isoCode ? `ISO ${isoCode}` : null,
    useCase,
  ].filter((v): v is string => !!v);
  if (parts.length > 0) return parts.join(" · ");
  return item.description ?? null;
}

/**
 * Auto-fill the denormalised stitch fields onto the annotation's data from the
 * selected library item. `library_item_image_url` (the seeded SVG-diagram data
 * URI) is captured here so the list panel — and the eventual PDF export — can
 * render the stitch icon straight off the annotation without a join back to
 * `library_items`, the same precedent as Fabrics & Trim denormalising
 * composition/gsm. `spi` is the derived single-number default (editable on the
 * pin afterwards).
 */
export function constructionDataFromLibraryItem(
  item: ResolvedLibraryItem,
): Pick<
  ConstructionAnnotationData,
  "library_item_id" | "library_item_name" | "library_item_image_url" | "spi"
> {
  return {
    library_item_id: item.id,
    library_item_name: item.name,
    library_item_image_url: asString(item.image_url),
    spi: spiDefaultFromRange(stitchLibraryDetails(item).spiRange),
  };
}

/**
 * Read an annotation's `data` jsonb as `ConstructionAnnotationData`,
 * defensively — every field defaults to null rather than throwing. Pins placed
 * before the dedicated editor existed store only `{ label, notes }`; the label
 * is surfaced as a display fallback for whichever field titles that sub-type
 * (stitch name for stitch pins, note text for note pins — only the one
 * matching the pin's `layer_type` is ever shown). Data is never rewritten to
 * the new shape automatically — only an explicit save via the new editor
 * migrates it.
 */
export function readConstructionData(
  data: CanvasAnnotation["data"],
): ConstructionAnnotationData {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return {
    library_item_id: asString(raw.library_item_id),
    library_item_name: asString(raw.library_item_name) ?? asString(raw.label),
    library_item_image_url: asString(raw.library_item_image_url),
    spi: asNumber(raw.spi),
    thread_colour: asString(raw.thread_colour),
    note_text: asString(raw.note_text) ?? asString(raw.label),
    placement: asString(raw.placement),
    notes: asString(raw.notes),
  };
}
