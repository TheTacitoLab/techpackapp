"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { setHideUnlockWarning as persistHideUnlockWarning } from "@/app/(app)/settings/actions";

/**
 * Per-user UI preferences (profiles.preferences), provided app-wide from the
 * `(app)` layout — the same optimistic pattern as `LayerColoursProvider`, so
 * the canvas unlock dialog and the Settings toggle read/write ONE live value.
 * First (and so far only) preference: hiding the unlock-with-annotations
 * warning.
 */
export type UserPreferences = {
  hideUnlockWarning: boolean;
};

/** Narrow the raw profiles.preferences jsonb; anything malformed → defaults. */
export function parseUserPreferences(raw: unknown): UserPreferences {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return { hideUnlockWarning: obj.hide_unlock_warning === true };
}

interface UserPreferencesValue extends UserPreferences {
  /** Optimistically apply + persist; reverts (with a toast) on failure. */
  setHideUnlockWarning: (hidden: boolean) => void;
}

// Default (no provider): warning shown, setter a no-op — graceful for
// anything rendered outside the app layout.
const UserPreferencesContext = createContext<UserPreferencesValue>({
  hideUnlockWarning: false,
  setHideUnlockWarning: () => {},
});

export function UserPreferencesProvider({
  initial,
  children,
}: {
  initial: UserPreferences;
  children: ReactNode;
}) {
  const [local, setLocal] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    // Content-aware resync (see LayerColoursProvider): `initial` is a fresh
    // object every server render, so only genuinely different server truth
    // may clobber an optimistic toggle that hasn't round-tripped yet.
    if (initial.hideUnlockWarning !== local.hideUnlockWarning) setLocal(initial);
  }

  const value = useMemo<UserPreferencesValue>(
    () => ({
      ...local,
      setHideUnlockWarning: (hidden) => {
        const prev = local;
        setLocal({ ...local, hideUnlockWarning: hidden });
        void persistHideUnlockWarning(hidden).catch(() => {
          toast.error("Could not save the preference.");
          setLocal(prev);
        });
      },
    }),
    [local],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesValue {
  return useContext(UserPreferencesContext);
}
