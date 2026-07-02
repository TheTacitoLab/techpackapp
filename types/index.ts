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
 * Reference-code prefix per annotation layer. `createAnnotation` counts existing
 * pins of a layer for the product and appends the next number (F1, T2, M1…).
 * Exported so the canvas UI and the generated BOM render the same codes — the
 * single source of truth for both the zod enum and the prefixes.
 */
/**
 * Structured `data` jsonb shape for Fabrics & Trim annotations (`layer_type` in
 * fabric/trim/hardware/elastic). Fields auto-filled from the selected Master
 * Library item at pick-time (`library_item_id`, `library_item_name`,
 * `category`, `composition`, `colour`, `gsm`, `supplier_code`) are denormalised
 * onto the annotation so the BOM and pin UI never need a join back to
 * `library_items`; `placement`/`quantity`/`unit`/`notes` are per-instance and
 * entered on this pin only. `gsm` is fabric-specific and null for trims/
 * hardware/elastics. Annotations created before this session store only
 * `{ label, notes }` — those legacy fields are read as a display fallback
 * (never migrated) so old pins keep working; see `readFabricTrimData` in
 * `components/canvas/fabric-trim-data.ts`.
 */
export type FabricTrimAnnotationData = {
  library_item_id: string | null;
  library_item_name: string | null;
  category: LibraryCategory | null;
  composition: string | null;
  colour: string | null;
  gsm: number | null;
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
 * A colourway plus the annotations placed in it, ordered for the grouped list
 * panel. Built product-side (never in the panel component) and passed down —
 * Colourways is the only layer that renders grouped, so this stays specific to
 * it rather than a generic multi-level grouping system.
 */
export type ColourwayGroup = {
  colourway: CanvasColourway;
  annotations: CanvasAnnotation[];
};

export const LAYER_PREFIX: Record<CanvasLayerType, string> = {
  fabric: "F",
  trim: "T",
  hardware: "H",
  elastic: "E",
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
