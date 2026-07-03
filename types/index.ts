import type { Enums, Tables } from "@/types/database.types";

// Row aliases
export type Workspace = Tables<"workspaces">;
export type Profile = Tables<"profiles">;
export type Brand = Tables<"brands">;
export type Season = Tables<"seasons">;
export type Collection = Tables<"collections">;
export type Product = Tables<"products">;
export type SectionTemplate = Tables<"section_templates">;
export type ProductSection = Tables<"product_sections">;
export type Label = Tables<"labels">;
export type ProductLabel = Tables<"product_labels">;
export type LibraryItem = Tables<"library_items">;
export type WorkspaceLibraryToggle = Tables<"workspace_library_toggles">;
export type PlatformAdmin = Tables<"platform_admins">;

// Enum aliases
export type UserRole = Enums<"user_role">;
export type ProductStatus = Enums<"product_status">;
export type SectionStatus = Enums<"section_status">;
export type LibraryCategory = Enums<"library_category">;
export type LibrarySource = Enums<"library_source">;

/**
 * A product's section row merged with its template metadata (label + icon),
 * ready for data-driven rendering on the dashboard.
 */
export type ResolvedSection = ProductSection & {
  label: string;
  icon: string;
};

/**
 * A library item resolved for a workspace's view. `isGlobal` distinguishes the
 * TechPackApp catalogue from the workspace's own items; `isHidden` is true only
 * for global items the workspace has toggled off (surfaced in the "hidden" view
 * of the manager, excluded from the default resolved library elsewhere).
 */
export type ResolvedLibraryItem = LibraryItem & {
  isGlobal: boolean;
  isHidden: boolean;
};

/** A single colourway row in the Identity section's material summary. */
export type Colourway = {
  name: string;
  pantone: string;
  hex: string;
};

/**
 * Shape of the `identity` (Product Setup) section's `product_sections.data`
 * jsonb. Holds only the fields that don't warrant top-level `products` columns —
 * the guided "about this product" description, use & fit, and internal notes.
 * Everything structural (name, style number, dates, prices, designer, factory,
 * season…) lives on the `products` row directly and is NOT duplicated here.
 *
 * Note: earlier (Phase 3c) material-summary keys — `main_fabric_id`,
 * `main_fabric_name`, `main_fabric_composition`, `colourways`,
 * `lining_description` — plus `construction_method` are no longer written or
 * read by the form. Any values saved under those keys remain untouched in the
 * jsonb and will be migrated forward by the future Materials & Components and
 * Construction Details sections.
 */
export type IdentitySectionData = {
  // Group 1 — About this product (guided description)
  product_description: string | null;
  key_features: string | null;
  fit_description: string | null;
  // Use & Fit
  end_use: string | null;
  fit_type: string | null;
  // Internal
  internal_notes: string | null;
  // Meta — versioning is a later phase; this is just the last write timestamp.
  last_saved: string | null;
};

// ---- Canvas (Phase 4a) ------------------------------------------------------
// The shared canvas system behind Design & Colourways, Measurements & Fit, and
// Construction Details: product image assets → pages → slots → annotation pins.

// Row aliases
export type ProductAsset = Tables<"product_assets">;
export type CanvasPage = Tables<"canvas_pages">;
export type CanvasSlot = Tables<"canvas_slots">;
export type CanvasAnnotation = Tables<"canvas_annotations">;
export type CanvasColourway = Tables<"canvas_colourways">;

// Enum aliases
export type CanvasTemplate = Enums<"canvas_template">;
export type CanvasLayerType = Enums<"canvas_layer_type">;

/**
 * A slot resolved for rendering: the chosen asset (null when the slot is empty)
 * and the annotation pins placed on it. Assembled server-side from canvas_slots
 * + product_assets + canvas_annotations and handed to the canvas UI.
 */
export type ResolvedSlot = CanvasSlot & {
  asset: ProductAsset | null;
  annotations: CanvasAnnotation[];
};

/** A canvas page with its slots resolved (assets + annotations attached). */
export type ResolvedCanvasPage = CanvasPage & {
  slots: ResolvedSlot[];
};

/**
 * The Trim umbrella's sub-types. "Trim" is one material family (one plain T
 * reference sequence); the specific kind — zip vs elastic vs binding — is this
 * stored field, shown in the BOM and list panel but NEVER encoded in the
 * reference code (matching how real tech packs number trims: one Trims
 * section, sequentially numbered, with a type column).
 */
export type TrimKind = "fastener" | "elastic" | "binding" | "drawcord" | "other";

/**
 * Structured `data` jsonb shape for Fabrics & Trim annotations (`layer_type` in
 * fabric/trim — the two material families since the 0023 restructure). Fields
 * auto-filled from the selected Master Library item at pick-time
 * (`library_item_id`, `library_item_name`, `category`, `composition`,
 * `colour`, `gsm`, `supplier_code`) are denormalised onto the annotation so
 * the BOM and pin UI never need a join back to `library_items`;
 * `placement`/`quantity`/`unit`/`notes` are per-instance and entered on this
 * pin only. `gsm` is fabric-specific and null for trims. `trim_kind` is set
 * only on trim pins (null for fabric) and stays editable after creation — it
 * is descriptive, never part of the reference code. Annotations created
 * before the dedicated editor store only `{ label, notes }` — those legacy
 * fields are read as a display fallback (never migrated) so old pins keep
 * working; see `readFabricTrimData` in
 * `components/canvas/fabric-trim-data.ts`.
 */
export type FabricTrimAnnotationData = {
  library_item_id: string | null;
  library_item_name: string | null;
  category: LibraryCategory | null;
  composition: string | null;
  colour: string | null;
  gsm: number | null;
  trim_kind: TrimKind | null;
  placement: string | null;
  quantity: number | null;
  unit: "per_metre" | "per_unit" | "per_kg" | null;
  supplier_code: string | null;
  notes: string | null;
};

/**
 * Structured `data` jsonb shape for Colourway annotations (`layer_type` =
 * 'colourway'). All fields are manual this session — `hex` gets image-sampling
 * in Session B, and `pantone` stays manual forever (never auto-derived, for
 * accuracy/liability). The pin's colourway grouping and two-level reference code
 * (C1.2) live on the annotation row itself (`colourway_id`, `reference_code`),
 * not here — this jsonb is only the colour's own attributes.
 */
export type ColourwayAnnotationData = {
  colour_name: string | null;
  hex: string | null;
  pantone: string | null;
  notes: string | null;
};

/**
 * Structured `data` jsonb shape for Construction annotations (`layer_type` in
 * stitch/construction_note — one shape shared by both sub-types, mirroring how
 * Fabrics & Trim shares one shape across its four). Stitch pins denormalise
 * the picked Master Library item at selection time (`library_item_id`,
 * `library_item_name`, `library_item_image_url`) so the list panel — and the
 * future PDF export — can render the stitch's SVG diagram straight off the
 * annotation, no join back to `library_items`; `spi` is a single editable
 * number derived from the item's `spi_range` (never the raw range string) and
 * `thread_colour` is manual per-garment entry (same reasoning as Colourways'
 * manual Pantone). Note pins carry only `note_text`. Pins created before the
 * dedicated editor store `{ label, notes }` — read as a display fallback,
 * never migrated; see `readConstructionData` in
 * `components/canvas/construction-data.ts`.
 */
export type ConstructionAnnotationData = {
  // Set only for stitch-type pins
  library_item_id: string | null;
  library_item_name: string | null;
  library_item_image_url: string | null;
  spi: number | null;
  thread_colour: string | null;
  // Set only for construction-note pins
  note_text: string | null;
  // Shared by both types
  placement: string | null;
  notes: string | null;
};

/**
 * Structured `data` jsonb shape for Measurement annotations (`layer_type` =
 * 'measurement', `pin_type` = 'line'). A freehand dimension: one name, one
 * value, one unit — deliberately NOT related to the Grading size chart (a
 * separate, later feature with per-size structure); the two never share data.
 * Line geometry (`x`, `y`, `end_x`, `end_y`) lives on the annotation row's own
 * columns, not here. Pins created by the old generic editor store `{ label,
 * notes }` — label is read as a display fallback for `name`, never migrated;
 * see `readMeasurementData` in `components/canvas/measurement-data.ts`.
 */
export type MeasurementAnnotationData = {
  name: string | null;
  value: number | null;
  unit: "cm" | "mm" | "in" | null;
  notes: string | null;
};

/**
 * A colourway plus the annotations placed in it, ordered for the grouped list
 * panel. Built product-side (never in the panel component) and passed down —
 * Colourways is the only layer that renders grouped, so this stays specific to
 * it rather than a generic multi-level grouping system.
 */
export type ColourwayGroup = {
  colourway: CanvasColourway;
  annotations: CanvasAnnotation[];
};

/**
 * Reference-code prefix per annotation layer. `createAnnotation` counts existing
 * pins of a layer for the product and appends the next number (F1, T2, M1…).
 * Exported so the canvas UI and the generated BOM render the same codes — the
 * single source of truth for both the zod enum and the prefixes. Retired
 * types keep an entry only because the DB enum still contains them (the
 * record must stay total over `CanvasLayerType`); they are filtered out of
 * the accepted-input list via `RETIRED_LAYER_TYPES` below.
 */
export const LAYER_PREFIX: Record<CanvasLayerType, string> = {
  fabric: "F",
  trim: "T",
  hardware: "H", // retired — see RETIRED_LAYER_TYPES
  elastic: "E", // retired — see RETIRED_LAYER_TYPES
  label_component: "L",
  print: "P",
  stitch: "S",
  thread: "Th",
  packaging: "Pk",
  measurement: "M",
  construction_note: "CN",
  detail_callout: "DC",
  colourway: "C",
};

/**
 * Layer types still physically present in the `canvas_layer_type` DB enum but
 * no longer used anywhere (0023 restructure: hardware/elastic pins became
 * `trim` pins carrying `data.trim_kind`). Postgres can't cheaply drop enum
 * values, so they stay in the enum; this list is what keeps them out of the
 * app — `createAnnotation` rejects them and no UI offers them.
 */
export const RETIRED_LAYER_TYPES: readonly CanvasLayerType[] = [
  "hardware",
  "elastic",
];
