import type { LibraryCategory } from "@/types";

/**
 * The single source of truth for "what fields does a library item of category
 * X need" — shared by the Settings Master Library form (`library-manager.tsx`)
 * and the inline quick-add form the annotation editors open from their picker
 * (`library-quick-add-form.tsx`). Extracted from LibraryManager so the two
 * creation surfaces can never drift apart; a future layer's categories
 * (branding/labels) plug in here once and both surfaces pick them up.
 */

export const CATEGORY_META: { key: LibraryCategory; label: string }[] = [
  { key: "fabric", label: "Fabrics" },
  { key: "trim", label: "Trims" },
  { key: "fastener", label: "Fasteners" },
  { key: "elastic", label: "Elastics" },
  { key: "stitch_type", label: "Stitch Types" },
  { key: "thread", label: "Thread" },
  { key: "label_type", label: "Labels" },
  { key: "embellishment", label: "Embellishments" },
  { key: "packaging", label: "Packaging" },
  { key: "interlining", label: "Interlining" },
];

/** Singular, lowercase noun per category — "Add new fastener to library". */
export const CATEGORY_SINGULAR: Record<LibraryCategory, string> = {
  fabric: "fabric",
  trim: "trim",
  fastener: "fastener",
  elastic: "elastic",
  stitch_type: "stitch type",
  thread: "thread",
  label_type: "label",
  embellishment: "embellishment",
  packaging: "packaging",
  interlining: "interlining",
};

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number";
  placeholder?: string;
};

// Per-category property fields rendered dynamically in the add/edit forms.
export const FIELD_CONFIG: Record<LibraryCategory, FieldDef[]> = {
  fabric: [
    { key: "composition", label: "Composition", type: "text", placeholder: "92% Polyester / 8% Elastane" },
    { key: "gsm", label: "GSM", type: "number", placeholder: "180" },
    { key: "width_cm", label: "Width (cm)", type: "number", placeholder: "150" },
    { key: "construction", label: "Construction", type: "text", placeholder: "Single Jersey Knit" },
    { key: "finish", label: "Finish", type: "text", placeholder: "Moisture-wicking" },
    { key: "stretch", label: "Stretch", type: "text", placeholder: "4-way" },
  ],
  trim: [
    { key: "width_mm", label: "Width (mm)", type: "number", placeholder: "20" },
    { key: "composition", label: "Composition", type: "text", placeholder: "100% Polyester" },
  ],
  fastener: [
    { key: "brand", label: "Brand", type: "text", placeholder: "YKK" },
    { key: "zip_type", label: "Type", type: "text", placeholder: "Nylon Coil" },
    { key: "gauge", label: "Gauge / Size", type: "text", placeholder: "#5" },
    { key: "pull_type", label: "Pull / Mechanism", type: "text", placeholder: "Auto-lock slider" },
    { key: "material", label: "Material", type: "text", placeholder: "Brass" },
    { key: "finish", label: "Finish", type: "text", placeholder: "Matte" },
  ],
  elastic: [
    { key: "width_mm", label: "Width (mm)", type: "number", placeholder: "30" },
    { key: "elastic_type", label: "Type", type: "text", placeholder: "Flat woven" },
    { key: "stretch_pct", label: "Stretch %", type: "number", placeholder: "130" },
    { key: "composition", label: "Composition", type: "text", placeholder: "65% Polyester / 35% Rubber" },
  ],
  stitch_type: [
    { key: "spi_range", label: "SPI Range", type: "text", placeholder: "10-12" },
    { key: "thread_weight", label: "Thread Weight", type: "number", placeholder: "120" },
    { key: "iso_code", label: "ISO Code", type: "text", placeholder: "504" },
    { key: "use_case", label: "Typical Use", type: "text", placeholder: "Edge finishing, seams" },
  ],
  thread: [
    { key: "brand", label: "Brand", type: "text", placeholder: "Coats" },
    { key: "thread_ref", label: "Reference", type: "text", placeholder: "Epic" },
    { key: "weight", label: "Weight", type: "number", placeholder: "80" },
    { key: "thread_type", label: "Type", type: "text", placeholder: "Spun Polyester" },
  ],
  label_type: [
    { key: "size_mm", label: "Size", type: "text", placeholder: "55x30mm" },
    { key: "construction", label: "Construction", type: "text", placeholder: "Damask woven" },
    { key: "attachment", label: "Attachment", type: "text", placeholder: "Sew-in (centre fold)" },
    { key: "wash_fastness", label: "Wash Fastness", type: "text", placeholder: "High" },
  ],
  embellishment: [
    { key: "artwork_format", label: "Artwork Format", type: "text", placeholder: "AI / EPS vector" },
    { key: "colour_mode", label: "Colour Mode", type: "text", placeholder: "Spot (Pantone)" },
    { key: "max_colours", label: "Max Colours", type: "number", placeholder: "8" },
    { key: "placement_notes", label: "Notes", type: "text", placeholder: "Separated layers" },
  ],
  packaging: [
    { key: "size", label: "Size", type: "text", placeholder: "30x40cm" },
    { key: "gauge_micron", label: "Gauge (micron)", type: "number", placeholder: "50" },
    { key: "material", label: "Material", type: "text", placeholder: "LDPE" },
    { key: "pkg_type", label: "Type", type: "text", placeholder: "Self-seal" },
  ],
  interlining: [
    { key: "gsm", label: "GSM", type: "number", placeholder: "40" },
    { key: "interlining_type", label: "Type", type: "text", placeholder: "Woven fusible" },
    { key: "width_cm", label: "Width (cm)", type: "number", placeholder: "90" },
    { key: "bonding_temp", label: "Bonding Temp", type: "text", placeholder: "130°C" },
    { key: "stretch_direction", label: "Stretch", type: "text", placeholder: "None" },
  ],
};

/** Categories whose items carry colour variants (`properties.colours`). */
export const COLOUR_CATEGORIES = new Set<LibraryCategory>([
  "fabric",
  "trim",
  "fastener",
  "elastic",
  "thread",
]);

export const HEX = /^#[0-9A-Fa-f]{6}$/;

export type Colour = { name: string; pantone_tcx: string; hex: string };

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseColours(props: Record<string, unknown>): Colour[] {
  const raw = props.colours;
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const o = asRecord(c);
    return {
      name: typeof o.name === "string" ? o.name : "",
      pantone_tcx: typeof o.pantone_tcx === "string" ? o.pantone_tcx : "",
      hex: typeof o.hex === "string" ? o.hex : "#000000",
    };
  });
}

/**
 * Assemble the `properties` jsonb from the form's field values + colour rows —
 * the exact coercion both creation surfaces must share (blank fields dropped,
 * numeric fields stored as numbers, unnamed colour rows dropped).
 */
export function buildLibraryProperties(
  fields: FieldDef[],
  values: Record<string, string>,
  colours: Colour[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key]?.trim();
    if (!raw) continue;
    properties[f.key] =
      f.type === "number" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }
  const clean = colours.filter((c) => c.name.trim());
  if (clean.length) properties.colours = clean;
  return properties;
}
