"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ANNOTATION_LAYERS,
  resolveColourForLayerType,
  resolveLayerColour,
  type LayerColourOverrides,
  type LayerKey,
} from "@/components/canvas/layers";
import type { CanvasLayerType } from "@/types";

/**
 * The workspace's layer marker colours, resolved live. Mounted once in the
 * `(app)` layout — seeded from `workspaces.layer_colours`, which
 * `getCurrentUser()` already fetches — so every marker surface (pin badges,
 * measurement lines, layer buttons, list-panel dots) reads the SAME resolved
 * colour without threading a prop through the whole canvas tree.
 *
 * "Read live" is the design decision: colour is never baked into an
 * annotation, so `applyOverrides` (the optimistic write used by the colour
 * editor) instantly recolours every existing pin of a layer, everywhere.
 * Local state is resynced from the server prop via the app's established
 * render-time adjustment pattern — a new server render (the save action's
 * revalidation) simply becomes the next baseline.
 */
interface LayerColoursValue {
  /** The raw override map (only overridden layers carry a key). */
  overrides: LayerColourOverrides;
  /** Resolved marker colour for a layer: override, else built-in default. */
  colourFor: (key: LayerKey) => string;
  /** Resolved marker colour for a pin's `layer_type`. */
  colourForType: (t: CanvasLayerType) => string;
  /** Optimistically replace the override map (the editor persists separately). */
  applyOverrides: (next: LayerColourOverrides) => void;
}

// Default value = "no overrides", so anything rendered outside the provider
// (previews, tests) still resolves to the built-in colours instead of crashing.
const LayerColoursContext = createContext<LayerColoursValue>({
  overrides: {},
  colourFor: (key) => resolveLayerColour(key, {}),
  colourForType: (t) => resolveColourForLayerType(t, {}),
  applyOverrides: () => {},
});

/** Key-wise equality — the map has at most one entry per layer. */
function sameOverrides(
  a: LayerColourOverrides,
  b: LayerColourOverrides,
): boolean {
  return ANNOTATION_LAYERS.every((l) => a[l.key] === b[l.key]);
}

export function LayerColoursProvider({
  initial,
  children,
}: {
  initial: LayerColourOverrides;
  children: ReactNode;
}) {
  const [local, setLocal] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    // Content-aware resync: `initial` is a freshly parsed object on EVERY
    // server render of the layout, so a reference change alone (any unrelated
    // refresh/revalidation) must not clobber an optimistic edit whose
    // debounced save hasn't landed yet. Only genuinely different server truth
    // (our own save round-tripping, or another session's change) resyncs.
    if (!sameOverrides(initial, local)) setLocal(initial);
  }

  const value = useMemo<LayerColoursValue>(
    () => ({
      overrides: local,
      colourFor: (key) => resolveLayerColour(key, local),
      colourForType: (t) => resolveColourForLayerType(t, local),
      applyOverrides: setLocal,
    }),
    [local],
  );

  return (
    <LayerColoursContext.Provider value={value}>
      {children}
    </LayerColoursContext.Provider>
  );
}

export function useLayerColours(): LayerColoursValue {
  return useContext(LayerColoursContext);
}
