/**
 * Pure pin-array logic. Pins are a per-user preference stored in
 * `profiles.preferences.pins` as an ORDERED array of `{ type, id }` entries —
 * order IS pin order in the sidebar. Only products and collections are
 * pinnable, max 10 total across both types. This module is the only place
 * the `pins` jsonb shape is read, and it is dependency-free so it runs under
 * Node type-stripping for tests.
 */

export const MAX_PINS = 10;

export const MAX_PINS_ERROR =
  "You can pin up to 10 items. Unpin something first.";

export type PinType = "product" | "collection";

export type PinEntry = {
  type: PinType;
  id: string;
};

/** Stable identity for a pin — same type + same id = same pin. */
export function pinKey(entry: PinEntry): string {
  return `${entry.type}:${entry.id}`;
}

function isPinType(value: unknown): value is PinType {
  return value === "product" || value === "collection";
}

/**
 * Defensive reader for the `pins` key of `profiles.preferences`. Malformed
 * input (wrong container shape, invalid entries, duplicates) degrades to the
 * valid subset — never throws. Order is preserved; duplicates keep their
 * first occurrence.
 */
export function pinsFromPreferences(preferences: unknown): PinEntry[] {
  const obj =
    preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : {};
  const raw = obj.pins;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const pins: PinEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const { type, id } = item as Record<string, unknown>;
    if (!isPinType(type) || typeof id !== "string" || id.length === 0) continue;
    const entry: PinEntry = { type, id };
    const key = pinKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    pins.push(entry);
  }
  return pins;
}

/**
 * Append a pin. Pinning something already pinned is a harmless no-op; the
 * 11th pin is rejected with a friendly error the UI surfaces as-is.
 */
export function addPin(
  pins: readonly PinEntry[],
  entry: PinEntry,
): { pins: PinEntry[]; error: string | null } {
  if (pins.some((p) => pinKey(p) === pinKey(entry))) {
    return { pins: [...pins], error: null };
  }
  if (pins.length >= MAX_PINS) {
    return { pins: [...pins], error: MAX_PINS_ERROR };
  }
  return { pins: [...pins, entry], error: null };
}

/** Remove a pin (no-op when absent). Order of the rest is preserved. */
export function removePin(
  pins: readonly PinEntry[],
  entry: PinEntry,
): PinEntry[] {
  return pins.filter((p) => pinKey(p) !== pinKey(entry));
}

/**
 * Drop dangling pins — entries whose target no longer exists. `validKeys`
 * holds `pinKey(...)` values for every pinned product/collection that still
 * exists in the workspace.
 */
export function prunePins(
  pins: readonly PinEntry[],
  validKeys: ReadonlySet<string>,
): PinEntry[] {
  return pins.filter((p) => validKeys.has(pinKey(p)));
}
