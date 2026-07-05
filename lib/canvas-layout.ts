/**
 * The SINGLE source of truth for the tech-pack page's image-area layout SHAPE:
 * the landscape-A4 page bands, the fixed image-area aspect ratio, how that area
 * subdivides per template (single = 1, split = 2-across, triple = 3-across,
 * quad = 2×2), the proportional gutter between cells, and the proportional
 * inset from a cell's border to its image box.
 *
 * Both the PDF renderer (via `lib/pdf/page-geometry.ts`) AND the on-screen
 * annotation canvas (`components/canvas/page-canvas.tsx`) consume this module,
 * so the on-screen slot containers are EXACT proportional replicas of the PDF's
 * slot boxes — same aspect, same arrangement, same gutters — and cannot drift.
 * "What you frame on screen is what exports."
 *
 * Unit-agnostic: every function takes an image-area rectangle in WHATEVER unit
 * the caller works in (PDF points on the export side, screen px on the canvas
 * side) and returns rectangles in the same unit. Gutter and inset are fractions
 * of the area WIDTH, so the arrangement is identical in proportion at any scale.
 */

import type { CanvasTemplate } from "@/types";

export type LayoutRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// ---- Landscape-A4 page bands (points) ---------------------------------------
// These define the whole-page proportion; the image-area aspect the on-screen
// replica adopts is DERIVED from them below, so screen and print share ONE
// definition of the page shape.

/** Landscape A4 in PDF points. */
export const PAGE_W = 841.89;
export const PAGE_H = 595.28;

export const MARGIN = 24;
export const HEADER_H = 64;
/** Gap between the header rule and the top of the canvas zone. */
export const HEADER_GAP = 10;
export const FOOTER_H = 30;
/** Main zone split: slots left, callout column right. */
export const CALLOUT_W = 216;
export const ZONE_GAP = 12;

/**
 * The canvas zone splits into a FIXED-height image area on top and a notes band
 * beneath — the SAME split on every page regardless of layout, so imagery
 * always commands the same large, consistent space. The notes band is a fixed
 * quarter (floored at ~20mm) and the image area takes the rest.
 */
export const NOTES_MIN_H = 56.7; // ≈20mm in points
export const NOTES_BAND_FRACTION = 1 / 4;
export const NOTES_GAP = 10;

/** The main (slots) zone rectangle on the page. */
export function slotsZone(): LayoutRect {
  return {
    left: MARGIN,
    top: MARGIN + HEADER_H + HEADER_GAP,
    width: PAGE_W - MARGIN * 2 - CALLOUT_W - ZONE_GAP,
    height: PAGE_H - MARGIN * 2 - HEADER_H - HEADER_GAP - FOOTER_H,
  };
}

/** The callout column rectangle on the page. */
export function calloutZone(): LayoutRect {
  const zone = slotsZone();
  return {
    left: zone.left + zone.width + ZONE_GAP,
    top: zone.top,
    width: CALLOUT_W,
    height: zone.height,
  };
}

/**
 * Split a slots zone into its fixed-height image area (top) and notes band
 * (bottom). Pure geometry — the same split the PDF has always used, now shared
 * so the on-screen canvas can mirror it.
 */
export function zoneBands(zone: LayoutRect): {
  imageArea: LayoutRect;
  notesBox: LayoutRect;
} {
  const notesHeight = Math.max(zone.height * NOTES_BAND_FRACTION, NOTES_MIN_H);
  const imageArea: LayoutRect = {
    left: zone.left,
    top: zone.top,
    width: zone.width,
    height: zone.height - notesHeight - NOTES_GAP,
  };
  const notesBox: LayoutRect = {
    left: zone.left,
    top: imageArea.top + imageArea.height + NOTES_GAP,
    width: zone.width,
    height: notesHeight,
  };
  return { imageArea, notesBox };
}

/**
 * The fixed image-area aspect ratio (width / height) — the SHAPE the on-screen
 * replica adopts so its cells are proportional to the PDF's. Derived from the
 * page bands above (not hardcoded) so a change to the page proportion updates
 * screen and print together.
 */
export const IMAGE_AREA_ASPECT = (() => {
  const { imageArea } = zoneBands(slotsZone());
  return imageArea.width / imageArea.height;
})();

// ---- Cell subdivision (shared by PDF + canvas) ------------------------------

/** The PDF's original image-area width in points — the reference the gutter and
 *  inset ratios are calibrated against, so at PDF scale they reduce to exactly
 *  the 8pt gutter / 3pt inset the export has always used (byte-identical PDF). */
const REFERENCE_AREA_W = slotsZone().width;

/** Gutter between cells, as a fraction of the image-area width. */
export const CELL_GAP_RATIO = 8 / REFERENCE_AREA_W;

/** Inset from a cell's border to its image box, as a fraction of the image-area
 *  width. On the PDF it keeps the clipped image off the border stroke; on screen
 *  it makes the frozen lock-box aspect equal the PDF's inner-box aspect, so an
 *  image fills its box identically in both. */
export const CELL_INSET_RATIO = 3 / REFERENCE_AREA_W;

/**
 * Subdivide an image-area rectangle into the template's equal cells, with
 * proportional gutters between them. Returned in `slot_index` order:
 *   single = one cell, split = two columns, triple = three columns, quad = 2×2.
 */
export function templateCells(
  template: CanvasTemplate,
  area: LayoutRect,
): LayoutRect[] {
  const gap = area.width * CELL_GAP_RATIO;

  if (template === "single") return [{ ...area }];

  if (template === "split") {
    const w = (area.width - gap) / 2;
    return [0, 1].map((i) => ({
      left: area.left + i * (w + gap),
      top: area.top,
      width: w,
      height: area.height,
    }));
  }

  if (template === "triple") {
    const w = (area.width - gap * 2) / 3;
    return [0, 1, 2].map((i) => ({
      left: area.left + i * (w + gap),
      top: area.top,
      width: w,
      height: area.height,
    }));
  }

  // quad — 2×2
  const w = (area.width - gap) / 2;
  const h = (area.height - gap) / 2;
  return [0, 1, 2, 3].map((i) => ({
    left: area.left + (i % 2) * (w + gap),
    top: area.top + Math.floor(i / 2) * (h + gap),
    width: w,
    height: h,
  }));
}

/** Inset a cell to its image box by the shared proportional inset. `areaWidth`
 *  is the enclosing image area's width, so the inset scales with the render. */
export function cellImageBox(cell: LayoutRect, areaWidth: number): LayoutRect {
  const inset = areaWidth * CELL_INSET_RATIO;
  return {
    left: cell.left + inset,
    top: cell.top + inset,
    width: cell.width - inset * 2,
    height: cell.height - inset * 2,
  };
}

export type CellLayout = {
  /** The bordered grid cell (the framed box drawn on the page). */
  cell: LayoutRect;
  /** The image box inside the cell — the frozen slot box maps onto this. */
  inner: LayoutRect;
};

/**
 * The complete per-slot cell + inner-image-box layout for a template within an
 * image area. The ONE function both the PDF renderer and the on-screen canvas
 * call, so their cells are guaranteed identical in proportion.
 */
export function templateCellLayout(
  template: CanvasTemplate,
  area: LayoutRect,
): CellLayout[] {
  return templateCells(template, area).map((cell) => ({
    cell,
    inner: cellImageBox(cell, area.width),
  }));
}

/**
 * Fit a rectangle of the image-area aspect into an available box, centred
 * (letterboxed). Used by the on-screen replica so it stays true to the page
 * proportion on a differently-shaped screen — the "print preview" look.
 */
export function fitImageArea(
  availWidth: number,
  availHeight: number,
): { width: number; height: number } {
  if (availWidth <= 0 || availHeight <= 0) return { width: 0, height: 0 };
  let width = availWidth;
  let height = width / IMAGE_AREA_ASPECT;
  if (height > availHeight) {
    height = availHeight;
    width = height * IMAGE_AREA_ASPECT;
  }
  return { width, height };
}
