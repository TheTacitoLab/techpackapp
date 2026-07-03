"use client";

import { useUserPreferences } from "@/components/user-preferences-context";

/**
 * Settings-side control for the SAME per-user preference the canvas unlock
 * dialog's "Don't show this again" writes — so a dismissed warning can always
 * be re-enabled from here. Checked (the default) = warning shown.
 */
export function UnlockWarningToggle() {
  const { hideUnlockWarning, setHideUnlockWarning } = useUserPreferences();

  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={!hideUnlockWarning}
        onChange={(e) => setHideUnlockWarning(!e.target.checked)}
        className="accent-foreground mt-0.5 size-4"
      />
      <span>
        Show a warning when unlocking slots with annotations
        <span className="text-muted-foreground block text-xs">
          Re-framing an unlocked image can move existing pins out of position;
          the warning reminds you before it happens.
        </span>
      </span>
    </label>
  );
}
