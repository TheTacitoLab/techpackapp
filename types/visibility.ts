/**
 * The canonical Visibility Profile field-group list — the SINGLE source of
 * truth for what a profile can toggle. The profile builder UI, the zod schema
 * in partner-actions, and (from P2) the resolver that strips hidden groups
 * from a partner's rendered view all derive from this constant; the
 * `field_groups` jsonb on `visibility_profiles` (migration 0043) mirrors it
 * exactly. Profiles toggle these COARSE groups, never individual columns, so
 * a partner can't end up with an incoherent half-view (a BOM with materials
 * hidden but costs shown). Hidden groups are REMOVED from the partner view
 * entirely — no "hidden by brand" placeholders.
 */
export const VISIBILITY_GROUPS = {
  product_setup: [
    "core_identity",
    "description_fit",
    "production_tracking",
    "pricing",
  ],
  technical_drawings: ["flats_annotations", "colourways", "page_notes"],
  bill_of_materials: ["materials_construction", "costs"],
  size_specifications: ["measurements_grading", "tolerances"],
  documents: ["attachments"],
} as const satisfies Record<string, readonly string[]>;

export type VisibilitySectionKey = keyof typeof VISIBILITY_GROUPS;

/** Every group key across all sections (they're globally unique). */
export type VisibilityGroupKey =
  (typeof VISIBILITY_GROUPS)[VisibilitySectionKey][number];

/**
 * The decoded shape of `visibility_profiles.field_groups`: one boolean per
 * group, nested under its section. Always fully populated app-side — the
 * defensive reader in `lib/visibility-profiles.ts` fills missing keys with
 * false (absent = hidden, the safe direction).
 */
export type VisibilityFieldGroups = {
  [S in VisibilitySectionKey]: Record<
    (typeof VISIBILITY_GROUPS)[S][number],
    boolean
  >;
};

export const VISIBILITY_SECTION_KEYS = Object.keys(
  VISIBILITY_GROUPS,
) as VisibilitySectionKey[];

/** Display labels for the builder's five section tabs. */
export const VISIBILITY_SECTION_LABEL: Record<VisibilitySectionKey, string> = {
  product_setup: "Product Setup",
  technical_drawings: "Technical Drawings",
  bill_of_materials: "Bill of Materials",
  size_specifications: "Size Specifications",
  documents: "Documents",
};

/** Display labels for the individual field-group checkboxes. */
export const VISIBILITY_GROUP_LABEL: Record<VisibilityGroupKey, string> = {
  core_identity: "Core identity",
  description_fit: "Description & fit",
  production_tracking: "Production tracking",
  pricing: "Pricing",
  flats_annotations: "Flats & annotations",
  colourways: "Colourways",
  page_notes: "Page notes",
  materials_construction: "Materials & construction",
  costs: "Costs",
  measurements_grading: "Measurements & grading",
  tolerances: "Tolerances",
  attachments: "Attachments",
};

/**
 * Commercially sensitive groups: wholesale/retail pricing and BOM costs.
 * Always their own toggles, visually flagged in the builder, and OFF in any
 * new profile until deliberately enabled.
 */
export const SENSITIVE_VISIBILITY_GROUPS: readonly VisibilityGroupKey[] = [
  "pricing",
  "costs",
];
