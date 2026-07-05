/**
 * Pure layout math for the canvas-to-PDF export — NO react-pdf imports here,
 * so it is unit-testable and shares `lib/cover-geometry.ts` with the on-screen
 * renderer and the colour sampler (the single-source-of-truth requirement).
 *
 * Model: every locked slot froze the box it was framed in (`lock_width` /
 * `lock_height`, CSS px). The PDF lays the image and pins out in that exact
 * lock-space box, then scales EVERYTHING by one uniform factor
 * `k = pdfBox / lockBox` — pins (slot-box fractions) and the image rect (from
 * the imported `displayedImageRect`) share `k`, which is the same drift-free
 * guarantee the screen has.
 */

import {
  displayedImageRect,
  normaliseFitMode,
} from "@/lib/cover-geometry";
import type { CanvasTemplate } from "@/types";

export type PdfRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Landscape A4 in PDF points. */
export const PAGE_W = 841.89;
export const PAGE_H = 595.28;

/** The agreed template's fixed bands (all in points). */
export const MARGIN = 24;
export const HEADER_H = 64;
export const FOOTER_H = 30;
/** Main zone split: slots left ~70%, callout column right ~30%. */
export const CALLOUT_W = 216;
export const ZONE_GAP = 12;

/**
 * The canvas zone splits into a FIXED-height image area on top and a notes band
 * beneath — the SAME split on every exported page regardless of the layout, so
 * imagery (the most-used part of a tech pack) always commands the same large,
 * consistent space and a Single view fills exactly the region a Quad grid does.
 *
 * Proportions of the slots zone height: the notes band is a fixed quarter
 * (≈25%, floored at ~20mm so it always has room for a few ruled lines) and the
 * image area takes the rest (≈73% after the gap) — a generous, layout-invariant
 * majority. The callout column is untouched and still runs the full zone
 * height to the right.
 */
export const NOTES_MIN_H = 56.7; // ≈20mm in points
export const NOTES_BAND_FRACTION = 1 / 4;
export const NOTES_GAP = 10;

/**
 * Inset applied to each grid cell before the frozen slot box is fitted into it,
 * so the clipped image can never paint over the cell's border stroke
 * (@react-pdf clips at the border box and draws children above the stroke).
 */
export const CELL_INSET = 3;

/** The main (slots) zone rectangle on the page. */
export function slotsZone(): PdfRect {
  return {
    left: MARGIN,
    top: MARGIN + HEADER_H + 10,
    width: PAGE_W - MARGIN * 2 - CALLOUT_W - ZONE_GAP,
    height: PAGE_H - MARGIN * 2 - HEADER_H - 10 - FOOTER_H,
  };
}

/** The callout column rectangle on the page. */
export function calloutZone(): PdfRect {
  const zone = slotsZone();
  return {
    left: zone.left + zone.width + ZONE_GAP,
    top: zone.top,
    width: CALLOUT_W,
    height: zone.height,
  };
}

const CELL_GAP = 8;

/**
 * The container-box cells inside the slots zone, mirroring the on-screen
 * templates (GRID_CLASS): single = one cell, split = two columns, quad = 2×2.
 * Returned in `slot_index` order.
 */
export function templateCells(template: CanvasTemplate, zone: PdfRect): PdfRect[] {
  if (template === "single") return [zone];
  if (template === "split") {
    const w = (zone.width - CELL_GAP) / 2;
    return [
      { left: zone.left, top: zone.top, width: w, height: zone.height },
      { left: zone.left + w + CELL_GAP, top: zone.top, width: w, height: zone.height },
    ];
  }
  if (template === "triple") {
    // Three equal columns across, gutters between — mirrors the on-screen
    // grid-cols-3 template.
    const w = (zone.width - CELL_GAP * 2) / 3;
    return [0, 1, 2].map((i) => ({
      left: zone.left + i * (w + CELL_GAP),
      top: zone.top,
      width: w,
      height: zone.height,
    }));
  }
  // quad — 2×2
  const w = (zone.width - CELL_GAP) / 2;
  const h = (zone.height - CELL_GAP) / 2;
  return [0, 1, 2, 3].map((i) => ({
    left: zone.left + (i % 2) * (w + CELL_GAP),
    top: zone.top + Math.floor(i / 2) * (h + CELL_GAP),
    width: w,
    height: h,
  }));
}

export type SlotFramingInput = {
  crop_x: number;
  crop_y: number;
  zoom: number;
  fit_mode: string;
  lock_width: number | null;
  lock_height: number | null;
};

export type PdfSlotGeometry = {
  /** The slot's drawn box in page points — the lock box scaled by k, centred in its cell. */
  box: PdfRect;
  /** The uniform lock-space → PDF scale factor. */
  k: number;
  /** The image's rectangle in points, RELATIVE to `box` (may overflow it — the box clips). */
  imageRect: PdfRect | null;
  /** True when lock dims were missing and the cell itself was used as the reference box. */
  approximate: boolean;
};

/**
 * Lay one slot out inside its cell.
 *
 * With frozen lock dims: the slot box is the lock box contain-fitted into the
 * cell (uniform k) and CENTRED — the PDF is "yet another container size". The
 * image fills that box edge-to-edge preserving its framing/aspect; any spare
 * cell space from aspect differences sits cleanly inside the cell's border
 * around the box. Without lock dims (never-filled slots, or slots locked
 * before migration 0022): the CELL is used as the reference box (k = 1 against
 * itself) — fractions-based pins are still exact; only the pixel crop offsets
 * are approximate until the slot is re-locked. Flagged via `approximate`.
 */
export function slotGeometry(
  cell: PdfRect,
  framing: SlotFramingInput,
  naturalWidth: number | null,
  naturalHeight: number | null,
): PdfSlotGeometry {
  const hasLockDims =
    framing.lock_width !== null &&
    framing.lock_height !== null &&
    framing.lock_width > 0 &&
    framing.lock_height > 0;

  const lockW = hasLockDims ? framing.lock_width! : cell.width;
  const lockH = hasLockDims ? framing.lock_height! : cell.height;
  // Without frozen dims the crop offsets are CSS px in an unknown box — they
  // are meaningless against the pt-sized cell and can shove the image far out
  // of view. Zero them (zoom is dimensionless and kept): the slot renders its
  // centred base fit, honest if unrefined, until the slot is re-locked.
  const cropX = hasLockDims ? framing.crop_x : 0;
  const cropY = hasLockDims ? framing.crop_y : 0;

  const k = Math.min(cell.width / lockW, cell.height / lockH);
  const boxW = lockW * k;
  const boxH = lockH * k;
  const box: PdfRect = {
    left: cell.left + (cell.width - boxW) / 2,
    top: cell.top + (cell.height - boxH) / 2,
    width: boxW,
    height: boxH,
  };

  let imageRect: PdfRect | null = null;
  if (naturalWidth && naturalHeight) {
    // Lock-space rect from the SAME shared function the screen renderer and
    // colour sampler are built on, then uniformly scaled by k.
    const r = displayedImageRect(
      naturalWidth,
      naturalHeight,
      lockW,
      lockH,
      cropX,
      cropY,
      framing.zoom,
      normaliseFitMode(framing.fit_mode),
    );
    imageRect = {
      left: r.left * k,
      top: r.top * k,
      width: r.width * k,
      height: r.height * k,
    };
  }

  return { box, k, imageRect, approximate: !hasLockDims };
}

export type SlotLayoutInput = {
  framing: SlotFramingInput;
  naturalWidth: number | null;
  naturalHeight: number | null;
};

export type CanvasSlotLayout = {
  /** The fixed grid cell — the bordered box drawn on the page. */
  cell: PdfRect;
  /** The frozen slot box + image/pin geometry, contain-fitted and centred inside the cell. */
  geo: PdfSlotGeometry;
};

export type CanvasZoneLayout = {
  /** Per-slot cell+geometry in slots order; null when the template has no cell for that index. */
  slots: (CanvasSlotLayout | null)[];
  /** The fixed-height image area subdivided into the cells (same on every layout). */
  imageArea: PdfRect;
  /** The always-present notes band beneath the image area. */
  notesBox: PdfRect;
};

/**
 * Lay the whole canvas zone out with a FIXED-height image area on top and the
 * notes band beneath — the split is identical on every layout, so only the
 * internal subdivision (1 / 2-across / 3-across / 2×2) changes. The image area
 * is then divided into the template's equal cells, and each slot's frozen box
 * is contain-fitted and centred inside its cell (`slotGeometry`), inset from
 * the cell border so the clipped image never touches the stroke.
 */
export function canvasZoneLayout(
  template: CanvasTemplate,
  slots: readonly SlotLayoutInput[],
): CanvasZoneLayout {
  const zone = slotsZone();
  // Fixed split: a quarter (floored at the ~20mm minimum) for the notes band,
  // the rest for the image area — same on Single / Split / Triple / Quad.
  const notesHeight = Math.max(zone.height * NOTES_BAND_FRACTION, NOTES_MIN_H);
  const imageArea: PdfRect = {
    left: zone.left,
    top: zone.top,
    width: zone.width,
    height: zone.height - notesHeight - NOTES_GAP,
  };
  const cells = templateCells(template, imageArea);

  const slotLayouts = slots.map((slot, i): CanvasSlotLayout | null => {
    const cell = cells[i];
    if (!cell) return null;
    const inner: PdfRect = {
      left: cell.left + CELL_INSET,
      top: cell.top + CELL_INSET,
      width: cell.width - CELL_INSET * 2,
      height: cell.height - CELL_INSET * 2,
    };
    return {
      cell,
      geo: slotGeometry(
        inner,
        slot.framing,
        slot.naturalWidth,
        slot.naturalHeight,
      ),
    };
  });

  return {
    slots: slotLayouts,
    imageArea,
    notesBox: {
      left: zone.left,
      top: imageArea.top + imageArea.height + NOTES_GAP,
      width: zone.width,
      height: notesHeight,
    },
  };
}

/** A pin's tip position in points relative to the slot box (fractions × box). */
export function pinPoint(
  box: PdfRect,
  xFraction: number,
  yFraction: number,
): { x: number; y: number } {
  return { x: xFraction * box.width, y: yFraction * box.height };
}
