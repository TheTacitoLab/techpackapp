import type { CanvasAnnotation, MeasurementAnnotationData } from "@/types";

/** The selectable units, in display order. */
export const MEASUREMENT_UNITS: readonly NonNullable<
  MeasurementAnnotationData["unit"]
>[] = ["cm", "mm", "in"];

export type MeasurementUnit = NonNullable<MeasurementAnnotationData["unit"]>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Compact dimension label — "60mm", "12.5cm", or just "60" when no unit was
 * chosen. Null when there's no value: callers decide the empty-state copy
 * (the list row shows a "No value yet" hint, the canvas label simply omits it).
 */
export function formatMeasurementValue(
  value: number | null,
  unit: MeasurementAnnotationData["unit"],
): string | null {
  if (value === null) return null;
  return `${value}${unit ?? ""}`;
}

/**
 * Read an annotation's `data` jsonb as `MeasurementAnnotationData`,
 * defensively — every field defaults to null rather than throwing. Measurement
 * pins placed before this editor existed (the old generic label/notes form)
 * store `{ label, notes }`; label is surfaced as a `name` fallback so old pins
 * render sensibly. Never rewritten automatically — only an explicit save via
 * the new editor migrates it.
 */
export function readMeasurementData(
  data: CanvasAnnotation["data"],
): MeasurementAnnotationData {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const unit = asString(raw.unit);
  return {
    name: asString(raw.name) ?? asString(raw.label),
    value: asNumber(raw.value),
    unit: (MEASUREMENT_UNITS as readonly string[]).includes(unit ?? "")
      ? (unit as MeasurementUnit)
      : null,
    notes: asString(raw.notes),
  };
}
