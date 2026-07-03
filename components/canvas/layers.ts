import { isValidHex } from "@/components/canvas/colourway-data";
import type { CanvasLayerType } from "@/types";

/**
 * The four annotation layers of Technical Details — the single source of truth
 * for layer buttons, per-layer pin colours, and annotation count dots. Each
 * layer owns a family of `canvas_layer_type`s; new pins placed while a layer is
 * active default to that layer's `primaryType` (the pin editor can still switch
 * to a specific sub-type).
 *
 * Colours are per-layer brand-neutral hues applied via inline `style` (they are
 * intentionally NOT Tailwind tokens — lime/`brand` stays reserved for UI accent
 * such as the active page border, never a layer colour). `defaultColor` is only
 * the BUILT-IN FALLBACK: the workspace can override each layer's marker colour
 * (workspaces.layer_colours), so render-time consumers must resolve through
 * `useLayerColours()` (layer-colours-context.tsx) / `resolveLayerColour` —
 * never read `defaultColor` directly for drawing.
 */
export type LayerKey = "colourway" | "fabric" | "measurement" | "construction";

export type LayerIconName = "Palette" | "Layers" | "Ruler" | "Hammer";

export interface AnnotationLayer {
  key: LayerKey;
  label: string;
  icon: LayerIconName;
  /** Built-in marker colour — the fallback when the workspace has no override. */
  defaultColor: string;
  /** Every `layer_type` this button owns (pins of any count toward it). */
  types: CanvasLayerType[];
  /** The `layer_type` a new pin gets when this layer is the active one. */
  primaryType: CanvasLayerType;
}

export const ANNOTATION_LAYERS: readonly AnnotationLayer[] = [
  {
    key: "colourway",
    label: "Colourways",
    icon: "Palette",
    defaultColor: "#EC4899",
    types: ["colourway"],
    primaryType: "colourway",
  },
  {
    // Two material families since the 0023 restructure: Fabric (F) and Trim
    // (T, an umbrella whose kind lives in `data.trim_kind`). The retired
    // `hardware`/`elastic` layer_types are deliberately NOT listed — pins of
    // those types no longer exist (cleared in 0023) and must not be offered.
    key: "fabric",
    label: "Fabrics & Trim",
    icon: "Layers",
    defaultColor: "#3B82F6",
    types: ["fabric", "trim"],
    primaryType: "fabric",
  },
  {
    key: "measurement",
    label: "Measurements",
    icon: "Ruler",
    defaultColor: "#F59E0B",
    types: ["measurement"],
    primaryType: "measurement",
  },
  {
    key: "construction",
    label: "Construction",
    icon: "Hammer",
    defaultColor: "#8B5CF6",
    types: ["construction_note", "stitch"],
    primaryType: "construction_note",
  },
] as const;

/** Neutral fallback for layer_types not owned by any of the four families. */
const FALLBACK_COLOR = "#6B7280";

/** The owning layer for a given `layer_type`, or `undefined` if unmapped. */
export function layerForType(t: CanvasLayerType): AnnotationLayer | undefined {
  return ANNOTATION_LAYERS.find((layer) => layer.types.includes(t));
}

// ---- Workspace colour overrides ---------------------------------------------

/**
 * The workspace's per-layer marker colour overrides (workspaces.layer_colours):
 * hex strings keyed by `LayerKey`, missing keys meaning "use the built-in
 * default". Stored workspace-wide so markers look the same on every tech pack.
 */
export type LayerColourOverrides = Partial<Record<LayerKey, string>>;

/**
 * Narrow the raw `workspaces.layer_colours` jsonb into a typed override map,
 * dropping unknown keys and anything that isn't a `#RRGGBB` string (the shared
 * `isValidHex`) — a bad or legacy value can only ever degrade to the built-in
 * default, never crash a render.
 */
export function parseLayerColours(raw: unknown): LayerColourOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const overrides: LayerColourOverrides = {};
  for (const layer of ANNOTATION_LAYERS) {
    const value = (raw as Record<string, unknown>)[layer.key];
    if (typeof value === "string" && isValidHex(value)) {
      overrides[layer.key] = value.toUpperCase();
    }
  }
  return overrides;
}

/** The marker colour for a layer: the workspace override, else the built-in. */
export function resolveLayerColour(
  key: LayerKey,
  overrides: LayerColourOverrides,
): string {
  return overrides[key] ?? layerByKey(key).defaultColor;
}

/** The colour a pin of the given `layer_type` should render in. */
export function resolveColourForLayerType(
  t: CanvasLayerType,
  overrides: LayerColourOverrides,
): string {
  // One scan: this is the hot path (every pin/line/list row resolves through
  // it, and all of them at once whenever a colour changes).
  const layer = layerForType(t);
  return layer ? (overrides[layer.key] ?? layer.defaultColor) : FALLBACK_COLOR;
}

/** The layer config for a layer key (always defined for a valid key). */
export function layerByKey(key: LayerKey): AnnotationLayer {
  const layer = ANNOTATION_LAYERS.find((l) => l.key === key);
  if (!layer) throw new Error(`Unknown layer key: ${key}`);
  return layer;
}

/**
 * Readable text colour (near-black or white) for text drawn on top of a layer
 * colour — the amber measurement layer needs dark text, the rest need white.
 * Standard relative-luminance test on the sRGB hex.
 */
export function readableTextOn(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

/**
 * Count a set of annotations by owning layer key. Used for the layer-button
 * global totals and the per-page count dots.
 */
export function countByLayer(
  layerTypes: CanvasLayerType[],
): Record<LayerKey, number> {
  const counts: Record<LayerKey, number> = {
    colourway: 0,
    fabric: 0,
    measurement: 0,
    construction: 0,
  };
  for (const t of layerTypes) {
    const layer = layerForType(t);
    if (layer) counts[layer.key] += 1;
  }
  return counts;
}
