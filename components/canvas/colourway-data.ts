import type {
  CanvasAnnotation,
  CanvasColourway,
  ColourwayAnnotationData,
} from "@/types";

/** A full 6-digit hex like #1A2B3C. */
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Read an annotation's `data` jsonb as `ColourwayAnnotationData`, defensively —
 * every field defaults to null rather than throwing. A colour pin's grouping
 * (`colourway_id`) and reference code live on the row, never in here. `label`
 * is honoured as a legacy fallback for `colour_name` so any pin created via the
 * old generic form still shows a sensible title.
 */
export function readColourwayData(
  data: CanvasAnnotation["data"],
): ColourwayAnnotationData {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return {
    colour_name: asString(raw.colour_name) ?? asString(raw.label),
    hex: asString(raw.hex),
    pantone: asString(raw.pantone),
    notes: asString(raw.notes),
  };
}

/**
 * Display label for a colourway in a selector or read-only line, e.g.
 * "Navy (C1)" — the name plus its stable sequence code.
 */
export function colourwayLabel(colourway: CanvasColourway): string {
  return `${colourway.name} (C${colourway.sequence_number})`;
}
