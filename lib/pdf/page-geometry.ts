/**
 * PDF SLOT-FRAMING geometry for the canvas-to-PDF export — the bridge between
 * the shared page-layout SHAPE (`lib/canvas-layout.ts`) and each slot's frozen
 * framing. NO react-pdf imports here, so it stays unit-testable and shares both
 * `lib/canvas-layout.ts` (page bands + cell subdivision — the SAME module the
 * on-screen canvas uses) and `lib/cover-geometry.ts` (image fit — the SAME
 * functions the on-screen renderer and colour sampler use).
 *
 * Model: every locked slot froze the box it was framed in (`lock_width` /
 * `lock_height`, CSS px). The PDF lays the image and pins out in that exact
 * lock-space box, then scales EVERYTHING by one uniform factor
 * `k = pdfBox / lockBox` — pins (slot-box fractions) and the image rect (from
 * the imported `displayedImageRect`) share `k`, the same drift-free guarantee
 * the screen has. Because the on-screen slot container is now a proportional
 * replica of the PDF cell (same module, same aspect), the frozen lock box has
 * the PDF inner-box aspect, so `k` fills the box edge-to-edge — no residual
 * padding.
 */

import {
  displayedImageRect,
  normaliseFitMode,
} from "@/lib/cover-geometry";
import {
  calloutZone,
  slotsZone,
  templateCellLayout,
  zoneBands,
  type LayoutRect,
  FOOTER_H,
  HEADER_H,
  MARGIN,
  PAGE_H,
  PAGE_W,
} from "@/lib/canvas-layout";
import type { CanvasTemplate } from "@/types";

/** Alias kept for the PDF renderer's existing call sites. */
export type PdfRect = LayoutRect;

// Re-exported so the react-pdf renderer keeps a single import surface for the
// page bands it draws chrome against (header, footer, callout column).
export { PAGE_W, PAGE_H, MARGIN, HEADER_H, FOOTER_H, calloutZone };

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
 * Lay one slot out inside its (already inset) image box.
 *
 * With frozen lock dims: the slot box is the lock box contain-fitted into the
 * inner box (uniform k) and CENTRED — the PDF is "yet another container size".
 * Since the on-screen slot container is a proportional replica of this inner
 * box (shared layout module → same aspect), k fills it edge-to-edge; only a
 * legacy slot locked at a different aspect letterboxes, consistently on screen
 * and PDF. Without lock dims (never-filled, or slots locked before migration
 * 0025): the inner box is used as the reference (k = 1 against itself) —
 * fraction-based pins stay exact; only the pixel crop offsets are approximate
 * until the slot is re-locked. Flagged via `approximate`.
 */
export function slotGeometry(
  inner: PdfRect,
  framing: SlotFramingInput,
  naturalWidth: number | null,
  naturalHeight: number | null,
): PdfSlotGeometry {
  const hasLockDims =
    framing.lock_width !== null &&
    framing.lock_height !== null &&
    framing.lock_width > 0 &&
    framing.lock_height > 0;

  const lockW = hasLockDims ? framing.lock_width! : inner.width;
  const lockH = hasLockDims ? framing.lock_height! : inner.height;
  // Without frozen dims the crop offsets are CSS px in an unknown box — they
  // are meaningless against the pt-sized box and can shove the image far out
  // of view. Zero them (zoom is dimensionless and kept): the slot renders its
  // centred base fit, honest if unrefined, until the slot is re-locked.
  const cropX = hasLockDims ? framing.crop_x : 0;
  const cropY = hasLockDims ? framing.crop_y : 0;

  const k = Math.min(inner.width / lockW, inner.height / lockH);
  const boxW = lockW * k;
  const boxH = lockH * k;
  const box: PdfRect = {
    left: inner.left + (inner.width - boxW) / 2,
    top: inner.top + (inner.height - boxH) / 2,
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
  /** The frozen slot box + image/pin geometry, contain-fitted and centred inside the inset cell. */
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
 * notes band beneath (`zoneBands`), then subdivide the image area into the
 * template's equal cells + inset image boxes (`templateCellLayout` — the SAME
 * shared module the on-screen canvas uses). Each slot's frozen box is
 * contain-fitted and centred inside its inset box (`slotGeometry`).
 */
export function canvasZoneLayout(
  template: CanvasTemplate,
  slots: readonly SlotLayoutInput[],
): CanvasZoneLayout {
  const { imageArea, notesBox } = zoneBands(slotsZone());
  const cells = templateCellLayout(template, imageArea);

  const slotLayouts = slots.map((slot, i): CanvasSlotLayout | null => {
    const layout = cells[i];
    if (!layout) return null;
    return {
      cell: layout.cell,
      geo: slotGeometry(
        layout.inner,
        slot.framing,
        slot.naturalWidth,
        slot.naturalHeight,
      ),
    };
  });

  return { slots: slotLayouts, imageArea, notesBox };
}

/** A pin's tip position in points relative to the slot box (fractions × box). */
export function pinPoint(
  box: PdfRect,
  xFraction: number,
  yFraction: number,
): { x: number; y: number } {
  return { x: xFraction * box.width, y: yFraction * box.height };
}
