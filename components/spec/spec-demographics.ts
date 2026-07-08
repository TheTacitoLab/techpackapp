/**
 * Size Specifications — demographic-aware size runs.
 *
 * Each Spec Sheet owns its size run (0037): the user picks a demographic, a
 * sizing system (women's only — alpha vs numeric; youth/men's are always
 * alpha), then TICKS which sizes from that ladder apply to the sheet. These
 * ladders are the tick lists.
 *
 * Framework-free and side-effect-free so both the stepped-flow UI and the
 * server-action validation can share ONE source of truth for the ladders and
 * labels (the house "shared constants have one implementation" rule). The
 * labels use the engine's canonical ladder spelling ("2XL", not "XXL") so a
 * ticked run feeds straight into `lib/spec-grading.ts` without translation.
 */

import type { SpecDemographic, SpecSizingSystem } from "@/types";

export interface DemographicOption {
  value: SpecDemographic;
  label: string;
  description: string;
}

/** The demographic buttons in step 2, in display order. */
export const DEMOGRAPHIC_OPTIONS: readonly DemographicOption[] = [
  {
    value: "youth",
    label: "Youth Unisex",
    description: "Kids' sizing, YXXS–YXL, lengths grade too.",
  },
  {
    value: "mens",
    label: "Men's",
    description: "Adult men's alpha sizing, S–6XL.",
  },
  {
    value: "womens",
    label: "Women's",
    description: "Adult women's, alpha (XS–6XL) or numeric (0, 2, 4…).",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Type your own size labels.",
  },
];

const YOUTH_RUN = ["YXXS", "YXS", "YS", "YM", "YL", "YXL"] as const;
const MENS_RUN = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"] as const;
const WOMENS_ALPHA_RUN = [
  "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL",
] as const;
// Even UK/US dress sizes — the engine expands even numeric spans at step 2, so
// this ladder round-trips through parseSizeRun unchanged.
const WOMENS_NUMERIC_RUN = [
  "0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24",
] as const;

/**
 * The full ladder a demographic offers for ticking. Women's depends on the
 * chosen sizing system; youth/men's ignore it (always alpha). Custom has no
 * predefined ladder — the UI collects free-entry labels instead, so this
 * returns [].
 */
export function ladderFor(
  demographic: SpecDemographic,
  sizingSystem: SpecSizingSystem,
): readonly string[] {
  switch (demographic) {
    case "youth":
      return YOUTH_RUN;
    case "mens":
      return MENS_RUN;
    case "womens":
      return sizingSystem === "numeric" ? WOMENS_NUMERIC_RUN : WOMENS_ALPHA_RUN;
    case "custom":
      return [];
  }
}

/** Whether this demographic exposes the alpha/numeric switch (women's only). */
export function hasSizingSystemChoice(demographic: SpecDemographic): boolean {
  return demographic === "womens";
}

/** Whether this demographic collects free-entry size labels (custom only). */
export function isCustomDemographic(demographic: SpecDemographic): boolean {
  return demographic === "custom";
}

const DEMOGRAPHIC_LABELS: Record<SpecDemographic, string> = {
  youth: "Youth Unisex",
  mens: "Men's",
  womens: "Women's",
  custom: "Custom",
};

/** Plain-language demographic name for the sheet-list summary. */
export function demographicLabel(demographic: SpecDemographic): string {
  return DEMOGRAPHIC_LABELS[demographic];
}

/**
 * The seeded Grading Profile name that matches a demographic, so step 5C can
 * surface the right "GarSpec standard" first. Custom/womens-numeric still map
 * to their block's profile (numeric women's just grade uniformly — the profile
 * increments are per step, not per label).
 */
export function seededProfileNameFor(
  demographic: SpecDemographic,
): string | null {
  switch (demographic) {
    case "youth":
      return "Youth Unisex";
    case "mens":
      return "Men's";
    case "womens":
      return "Women's";
    case "custom":
      return null;
  }
}
