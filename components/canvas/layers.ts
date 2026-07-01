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
 * such as the active page border, never a layer colour).
 */
export type LayerKey = "colourway" | "fabric" | "measurement" | "construction";

export type LayerIconName = "Palette" | "Layers" | "Ruler" | "Hammer";

export interface AnnotationLayer {
  key: LayerKey;
  label: string;
  icon: LayerIconName;
  color: string;
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
    color: "#EC4899",
    types: ["colourway"],
    primaryType: "colourway",
  },
  {
    key: "fabric",
    label: "Fabrics & Trim",
    icon: "Layers",
    color: "#3B82F6",
    types: ["fabric", "trim", "hardware", "elastic"],
    primaryType: "fabric",
  },
  {
    key: "measurement",
    label: "Measurements",
    icon: "Ruler",
    color: "#F59E0B",
    types: ["measurement"],
    primaryType: "measurement",
  },
  {
    key: "construction",
    label: "Construction",
    icon: "Hammer",
    color: "#8B5CF6",
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

/** The colour a pin of the given `layer_type` should render in. */
export function colourForLayerType(t: CanvasLayerType): string {
  return layerForType(t)?.color ?? FALLBACK_COLOR;
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
