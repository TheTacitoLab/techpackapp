/**
 * Per-user preference shape + parser for `profiles.preferences` (jsonb).
 * Lives OUTSIDE the client provider module so the SERVER `(app)` layout can
 * call `parseUserPreferences` when seeding the provider — client-module
 * exports can't be invoked from the server (same reason `SETTINGS_TABS` has
 * its own config module).
 */
export type UserPreferences = {
  hideUnlockWarning: boolean;
  /** Suppresses the gentle "use fullscreen for a true-to-print view" hint shown
   *  near the canvas fullscreen control. Set by the hint's dismiss button. */
  hideFullscreenHint: boolean;
};

/** Narrow the raw profiles.preferences jsonb; anything malformed → defaults. */
export function parseUserPreferences(raw: unknown): UserPreferences {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    hideUnlockWarning: obj.hide_unlock_warning === true,
    hideFullscreenHint: obj.hide_fullscreen_hint === true,
  };
}
