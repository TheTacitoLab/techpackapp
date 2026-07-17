import type { Json } from "@/types/database.types";
import {
  SENSITIVE_VISIBILITY_GROUPS,
  VISIBILITY_GROUPS,
  VISIBILITY_SECTION_KEYS,
  type VisibilityFieldGroups,
  type VisibilityGroupKey,
  type VisibilitySectionKey,
} from "@/types/visibility";

/**
 * Pure helpers around the Visibility Profile field-group map — building
 * defaults, decoding the stored jsonb, and clone naming. Everything derives
 * from `VISIBILITY_GROUPS` (types/visibility.ts) so a group added there flows
 * through defaults, reader, and builder UI without further changes.
 */

/** Build a full map with every group set by `fill(section, group)`. */
function buildFieldGroups(
  fill: (section: VisibilitySectionKey, group: VisibilityGroupKey) => boolean,
): VisibilityFieldGroups {
  const result = {} as Record<VisibilitySectionKey, Record<string, boolean>>;
  for (const section of VISIBILITY_SECTION_KEYS) {
    result[section] = {};
    for (const group of VISIBILITY_GROUPS[section]) {
      result[section][group] = fill(section, group);
    }
  }
  return result as VisibilityFieldGroups;
}

export function isSensitiveGroup(group: VisibilityGroupKey): boolean {
  return SENSITIVE_VISIBILITY_GROUPS.includes(group);
}

/** Everything off — the base the defensive reader falls back onto. */
export function emptyFieldGroups(): VisibilityFieldGroups {
  return buildFieldGroups(() => false);
}

/**
 * A NEW profile's starting point: a sensible minimal base — core identity and
 * the flats — with everything else (and always pricing/costs) off, so
 * visibility is opted INTO, never out of.
 */
export function newProfileFieldGroups(): VisibilityFieldGroups {
  return buildFieldGroups(
    (_, group) => group === "core_identity" || group === "flats_annotations",
  );
}

/**
 * The seeded "Factory Merchandiser" starter: everything on EXCEPT the
 * sensitive groups (pricing, costs) — the 90% case. Must stay in lockstep
 * with the jsonb seeded in migration 0043.
 */
export function factoryMerchandiserFieldGroups(): VisibilityFieldGroups {
  return buildFieldGroups((_, group) => !isSensitiveGroup(group));
}

/**
 * Decode a `visibility_profiles.field_groups` jsonb defensively: unknown
 * sections/groups are dropped, missing or non-boolean leaves become FALSE
 * (absent = hidden — the safe direction for a visibility model), never throws.
 */
export function readFieldGroups(data: Json | null): VisibilityFieldGroups {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return buildFieldGroups((section, group) => {
    const sectionRaw = raw[section];
    if (
      !sectionRaw ||
      typeof sectionRaw !== "object" ||
      Array.isArray(sectionRaw)
    ) {
      return false;
    }
    return (sectionRaw as Record<string, unknown>)[group] === true;
  });
}

/** Count of enabled groups vs total, for the profile list's summary line. */
export function countEnabledGroups(groups: VisibilityFieldGroups): {
  enabled: number;
  total: number;
} {
  let enabled = 0;
  let total = 0;
  for (const section of VISIBILITY_SECTION_KEYS) {
    for (const group of VISIBILITY_GROUPS[section]) {
      total += 1;
      if (groups[section][group as keyof VisibilityFieldGroups[typeof section]])
        enabled += 1;
    }
  }
  return { enabled, total };
}

/** Max profile name length (shared by zod schema and clone naming). */
export const PROFILE_NAME_MAX = 60;

/**
 * The clone's name: ` (copy)` appended, trimmed from the ORIGINAL name first
 * so repeated cloning doesn't stack suffixes into `(copy) (copy)`, and the
 * result always fits PROFILE_NAME_MAX (base is shortened, suffix never lost).
 */
export function cloneProfileName(name: string): string {
  const suffix = " (copy)";
  const base = name.endsWith(suffix)
    ? name.slice(0, -suffix.length)
    : name;
  const maxBase = PROFILE_NAME_MAX - suffix.length;
  return `${base.slice(0, maxBase)}${suffix}`;
}
