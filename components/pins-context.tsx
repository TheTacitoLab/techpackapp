"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { pruneDanglingPins, setPinned } from "@/app/(app)/pins/actions";
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
  hasDangling = false,
  children,
}: {
  initial: PinEntry[];
  /**
   * True when the server layout filtered out pins whose target no longer
   * exists — triggers a one-shot durable cleanup of the stored array.
   */
  hasDangling?: boolean;
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

  // Lazy cleanup: the render already filtered dangling pins out; persist
  // that pruning once so deleted items don't hold pin slots forever.
  const prunedRef = useRef(false);
  useEffect(() => {
    if (!hasDangling || prunedRef.current) return;
    prunedRef.current = true;
    void pruneDanglingPins().catch(() => {
      // Purely janitorial — never bother the user if it fails.
    });
  }, [hasDangling]);

  const value = useMemo<PinsValue>(() => {
    const keys = new Set(local.map(pinKey));
    return {
      pins: local,
      isPinned: (type, id) => keys.has(pinKey({ type, id })),
      togglePin: (type, id) => {
        const entry: PinEntry = { type, id };
        const pinned = !keys.has(pinKey(entry));
        const prev = local;

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

        void setPinned({ type, id, pinned })
          .then((result) => {
            if (result.error) {
              toast.error(result.error);
              setLocal(prev);
              return;
            }
            // The sidebar's pinned list is server-rendered from the layout.
            router.refresh();
          })
          .catch(() => {
            toast.error(pinned ? "Could not pin." : "Could not unpin.");
            setLocal(prev);
          });
      },
    };
  }, [local, router]);

  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>;
}

export function usePins(): PinsValue {
  return useContext(PinsContext);
}
