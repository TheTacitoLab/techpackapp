import { layerForType } from "@/components/canvas/layers";
import { readColourwayData } from "@/components/canvas/colourway-data";
import { readConstructionData } from "@/components/canvas/construction-data";
import { readFabricTrimData } from "@/components/canvas/fabric-trim-data";
import {
  formatMeasurementValue,
  readMeasurementData,
} from "@/components/canvas/measurement-data";
import type { CanvasAnnotation } from "@/types";

/**
 * A short, uniform summary of an annotation for the tooltip and list panel.
 * The two optional fields are the row's alternative LEADING VISUALS — one
 * generic slot, extended per layer rather than parallel systems: `swatch` is a
 * hex rendered as a colour dot (Colourways), `icon` an image URL rendered as a
 * small thumbnail (Construction stitch pins, via the denormalised
 * `library_item_image_url` SVG data URI). Layers with neither leave both null.
 */
export type AnnotationSummary = {
  title: string;
  detail: string | null;
  swatch?: string | null;
  icon?: string | null;
};

/** Cap a free-text preview (note pins) so tooltips/rows stay one line-ish. */
function truncatePreview(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

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

  if (layer?.key === "colourway") {
    const d = readColourwayData(annotation.data);
    const detailParts = [d.pantone, d.hex].filter((v): v is string => !!v);
    return {
      title: d.colour_name ?? "Untitled colour",
      detail: detailParts.length > 0 ? detailParts.join(" · ") : d.notes,
      swatch: d.hex,
    };
  }

  if (layer?.key === "construction") {
    const d = readConstructionData(annotation.data);
    if (annotation.layer_type === "stitch") {
      const detailParts = [
        d.spi !== null ? `SPI ${d.spi}` : null,
        d.thread_colour,
        d.placement,
      ].filter((v): v is string => !!v);
      return {
        title: d.library_item_name ?? "Untitled stitch",
        detail: detailParts.length > 0 ? detailParts.join(" · ") : d.notes,
        icon: d.library_item_image_url,
      };
    }
    // construction_note: the note text IS the content — preview it as the title.
    return {
      title: d.note_text ? truncatePreview(d.note_text) : "Untitled note",
      detail: d.placement ?? d.notes,
    };
  }

  if (layer?.key === "measurement") {
    // The measurements table row: code badge + name + value — the same shape
    // the eventual PDF export's measurements table will print. Rows with no
    // value yet get an explicit muted hint rather than a blank.
    const d = readMeasurementData(annotation.data);
    return {
      title: d.name ?? "Untitled measurement",
      detail: formatMeasurementValue(d.value, d.unit) ?? "No value yet",
    };
  }

  // Layers without structured data (none today): legacy label/notes.
  const { label, notes } = readLegacyLabelNotes(annotation.data);
  return {
    title: label ?? `Untitled ${layerLabel.toLowerCase()}`,
    detail: notes,
  };
}
