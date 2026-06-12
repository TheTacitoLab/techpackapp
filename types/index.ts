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
 * Shape of the `identity` section's `product_sections.data` jsonb. Holds only
 * the fields that don't warrant top-level `products` columns — material
 * summary, classification, and internal notes. Everything structural (name,
 * style number, dates, prices, designer, factory, season…) lives on the
 * `products` row directly and is NOT duplicated here.
 */
export type IdentitySectionData = {
  // Group 3 — Material Summary
  main_fabric_id: string | null;
  main_fabric_name: string | null;
  main_fabric_composition: string | null;
  colourways: Colourway[];
  lining_description: string | null;
  // Group 5 — Product Classification
  end_use: string | null;
  fit_type: string | null;
  construction_method: string | null;
  // Group 6 — Internal
  internal_notes: string | null;
  // Meta — versioning is a later phase; this is just the last write timestamp.
  last_saved: string | null;
};
