"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { setPinned } from "@/app/(app)/pins/actions";
import {
  addPin,
  pinKey,
  removePin,
  type PinEntry,
  type PinType,
} from "@/lib/pins";

/**
 * The current user's pins (profiles.preferences.pins), provided app-wide
 * from the `(app)` layout — same optimistic pattern as
 * `UserPreferencesProvider`, so every pin toggle (sidebar, collection cards,
 * product cards, page headers) reads/writes ONE live ordered array. The
 * array shape + rules (max 10, product/collection only) live in `lib/pins.ts`
 * so the server layout can parse the seed value and the actions share the
 * exact same logic.
 *
 * The layout seeds RESOLVED pins (dangling entries already filtered out), so
 * the client-side cap check counts exactly what the sidebar shows; the
 * server prunes the stored array on every write.
 */
interface PinsValue {
  pins: PinEntry[];
  isPinned: (type: PinType, id: string) => boolean;
  /** Optimistically apply + persist; reverts (with a toast) on failure. */
  togglePin: (type: PinType, id: string) => void;
}

// Default (no provider): nothing pinned, toggles a no-op — graceful for
// anything rendered outside the app layout.
const PinsContext = createContext<PinsValue>({
  pins: [],
  isPinned: () => false,
  togglePin: () => {},
});

const pinsSignature = (pins: PinEntry[]) => pins.map(pinKey).join("|");

export function PinsProvider({
  initial,
  children,
}: {
  initial: PinEntry[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    // Content-aware resync: `initial` is a fresh array every server render,
    // so only genuinely different server truth may clobber an optimistic
    // toggle that hasn't round-tripped yet.
    if (pinsSignature(initial) !== pinsSignature(local)) {
      setLocal(initial);
    }
  }

  // setPinned is a read-modify-write of the stored array — two overlapping
  // calls would lose one pin. Chaining every call through this queue keeps
  // same-tab toggles strictly ordered.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const value = useMemo<PinsValue>(() => {
    const keys = new Set(local.map(pinKey));
    return {
      pins: local,
      isPinned: (type, id) => keys.has(pinKey({ type, id })),
      togglePin: (type, id) => {
        const entry: PinEntry = { type, id };
        const pinned = !keys.has(pinKey(entry));

        // Failure undoes THIS toggle only (inverse op, not a snapshot), so
        // other in-flight toggles' optimistic state survives a revert.
        const revert = () =>
          setLocal((cur) =>
            pinned ? removePin(cur, entry) : addPin(cur, entry).pins,
          );

        if (pinned) {
          // Surface the cap immediately — no round-trip for the 11th pin.
          const attempt = addPin(local, entry);
          if (attempt.error) {
            toast.error(attempt.error);
            return;
          }
          setLocal(attempt.pins);
        } else {
          setLocal(removePin(local, entry));
        }

        queueRef.current = queueRef.current
          .then(() => setPinned({ type, id, pinned }))
          .then((result) => {
            if (result.error) {
              toast.error(result.error);
              revert();
              return;
            }
            // The sidebar's pinned list is server-rendered from the layout.
            router.refresh();
          })
          .catch(() => {
            toast.error(pinned ? "Could not pin." : "Could not unpin.");
            revert();
          });
      },
    };
  }, [local, router]);

  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>;
}

export function usePins(): PinsValue {
  return useContext(PinsContext);
}
