/**
 * Per-user preference shape + parser for `profiles.preferences` (jsonb).
 * Lives OUTSIDE the client provider module so the SERVER `(app)` layout can
 * call `parseUserPreferences` when seeding the provider — client-module
 * exports can't be invoked from the server (same reason `SETTINGS_TABS` has
 * its own config module).
 */
export type UserPreferences = {
  hideUnlockWarning: boolean;
};

/** Narrow the raw profiles.preferences jsonb; anything malformed → defaults.
 *  Unknown keys are ignored — a stored `hide_fullscreen_hint` (from the
 *  retired fullscreen hint; the editor is always fullscreen now) is simply
 *  never read. */
export function parseUserPreferences(raw: unknown): UserPreferences {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    hideUnlockWarning: obj.hide_unlock_warning === true,
  };
}
