import { layerForType } from "@/components/canvas/layers";
import { readFabricTrimData } from "@/components/canvas/fabric-trim-data";
import type { CanvasAnnotation } from "@/types";

/** A short, uniform summary of an annotation for the tooltip and list panel. */
export type AnnotationSummary = { title: string; detail: string | null };

function readLegacyLabelNotes(data: CanvasAnnotation["data"]): {
  label: string | null;
  notes: string | null;
} {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const label = typeof raw.label === "string" && raw.label ? raw.label : null;
  const notes = typeof raw.notes === "string" && raw.notes ? raw.notes : null;
  return { label, notes };
}

/**
 * The single shared summary function for both the pin hover tooltip
 * (`annotation-pin.tsx`) and the list panel row (`annotation-list-panel.tsx`)
 * — one place to extend per-layer formatting as later layers (Colourways,
 * Construction, Measurements) get their own structured data, instead of
 * duplicating this logic in both consumers.
 */
export function getAnnotationSummary(
  annotation: CanvasAnnotation,
): AnnotationSummary {
  const layer = layerForType(annotation.layer_type);
  const layerLabel = layer?.label ?? annotation.layer_type;

  if (layer?.key === "fabric") {
    const d = readFabricTrimData(annotation.data);
    const title = d.library_item_name ?? `Untitled ${layerLabel.toLowerCase()}`;
    const detailParts = [d.composition, d.colour, d.placement].filter(
      (v): v is string => !!v,
    );
    return {
      title,
      detail: detailParts.length > 0 ? detailParts.join(" · ") : d.notes,
    };
  }

  // Generic layers (measurement, construction, colourway): legacy label/notes.
  const { label, notes } = readLegacyLabelNotes(annotation.data);
  return {
    title: label ?? `Untitled ${layerLabel.toLowerCase()}`,
    detail: notes,
  };
}
