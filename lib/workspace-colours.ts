/**
 * Pure helpers for the workspace colour library. Framework-free so `npm test`
 * can load them directly (Node type-stripping, no JSX).
 *
 * The stored shape is always "#RRGGBB", uppercase — the same convention the
 * canvas sampler emits, the native colour input produces, and the
 * `workspace_colours_hex_ck` CHECK in migration 0041 enforces (the CHECK is
 * case-insensitive; uppercasing here keeps display and equality checks
 * uniform).
 */

/** Matches the stored shape: "#" + exactly six hex digits (either case). */
export const WORKSPACE_COLOUR_HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Normalise user-typed hex to the stored "#RRGGBB" (uppercase) shape:
 * whitespace is trimmed and a missing "#" prefix is forgiven, but anything
 * that isn't exactly six hex digits (no 3-digit shorthand) returns null so
 * the caller can surface a validation message instead of storing junk.
 */
export function normaliseHex(input: string): string | null {
  const trimmed = input.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return WORKSPACE_COLOUR_HEX.test(withHash) ? withHash.toUpperCase() : null;
}
