"use client";

import { useUserPreferences } from "@/components/user-preferences-context";

/**
 * Settings-side control for the SAME per-user preference the canvas fullscreen
 * hint's "Got it" dismiss writes — so a dismissed hint can be brought back from
 * here. Checked (the default) = hint shown.
 */
export function FullscreenHintToggle() {
  const { hideFullscreenHint, setHideFullscreenHint } = useUserPreferences();

  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={!hideFullscreenHint}
        onChange={(e) => setHideFullscreenHint(!e.target.checked)}
        className="accent-foreground mt-0.5 size-4"
      />
      <span>
        Show the fullscreen hint on the annotation canvas
        <span className="text-muted-foreground block text-xs">
          A gentle nudge that fullscreen brings the on-screen scale closest to
          the printed page.
        </span>
      </span>
    </label>
  );
}
