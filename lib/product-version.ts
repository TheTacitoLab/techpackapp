/**
 * The product's manual version number — v{major}.{minor}, starting at v1.0
 * (`products.version_major` / `version_minor`, migration 0038). The label is
 * always DERIVED through here so the header chip, the Change Log grouping,
 * the identity section and the PDF/Excel exports can never format it
 * differently. Bumping is a deliberate user action ("New version" in the
 * product header): minor for a routine updated pack, major for a full
 * revision. No snapshots or diffs — the number plus the version-grouped
 * change log IS the versioning model for now.
 */

export type VersionBumpKind = "minor" | "major";

/** "v1.0", "v2.3" — the one label format used everywhere. */
export function productVersionLabel(major: number, minor: number): string {
  return `v${major}.${minor}`;
}

/** The version a bump produces: minor → v1.1, major → v2.0. */
export function nextProductVersion(
  major: number,
  minor: number,
  kind: VersionBumpKind,
): { major: number; minor: number } {
  return kind === "major"
    ? { major: major + 1, minor: 0 }
    : { major, minor: minor + 1 };
}
