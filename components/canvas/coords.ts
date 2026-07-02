/**
 * Slot-relative coordinate math, shared by every canvas interaction so the
 * conversion lives in exactly one place. Pin placement (PageCanvas'
 * handleCanvasClick), pin tip-dragging and badge-dragging (AnnotationPin) all
 * route through here, so a click that lands on a point and a drag that ends on
 * that same point produce byte-identical fractions.
 */

/** Clamp to the 0–1 range used for all slot-relative coordinates. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Convert an absolute pointer position (clientX/clientY) into a 0–1 fraction of
 * the slot, using the slot overlay's on-screen bounding rect. Because the rect
 * is the already-scaled on-screen box, this is correct at any `stageZoom`
 * without the caller ever needing to know the zoom factor — the same reason the
 * original click handler was zoom-proof.
 */
export function clientToFraction(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}
