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
