/**
 * The single home for the slot image's cover + pan/zoom framing math, shared by
 * the visual renderer and the pixel sampler so the two can never drift apart.
 *
 * The visible slot renders the locked image as an `<img>` with:
 *
 *   width: 100%; height: 100%; object-fit: cover;
 *   transform: translate(crop_x px, crop_y px) scale(zoom);
 *   transform-origin: center;
 *
 * i.e. the browser first fits the natural image into the slot's rendered WxH box
 * with `object-fit: cover` (uniform scale to cover, centred, overflow clipped),
 * then applies the CSS transform about the box centre. `slotImageCssTransform`
 * builds that transform string — used verbatim by the renderer. `coverSampleTransform`
 * reproduces the FULL mapping (cover base + translate + scale) as one explicit
 * affine transform an offscreen `<canvas>` can apply, so pixel sampling reads the
 * exact colour the user sees under a click, at any crop/zoom.
 */

/**
 * The CSS `transform` string applied to a slot image. Both the framing (unlocked)
 * and annotation (locked) renderers use this so the on-screen transform is defined
 * in exactly one place — the same place `coverSampleTransform` mirrors.
 */
export function slotImageCssTransform(
  cropX: number,
  cropY: number,
  zoom: number,
): string {
  return `translate(${cropX}px, ${cropY}px) scale(${zoom})`;
}

/** An affine transform (uniform scale + translation) mapping natural-image pixels to slot-box pixels. */
export type CoverSampleTransform = {
  /** Uniform scale from natural-image pixels to slot-box pixels (object-fit cover base × zoom). */
  scale: number;
  translateX: number;
  translateY: number;
};

/**
 * Reproduce the exact on-screen mapping as an affine transform a canvas can apply.
 * A natural-image pixel `(nx, ny)` lands on box pixel:
 *   `(scale * nx + translateX, scale * ny + translateY)`.
 *
 * Derivation (x axis; y is symmetric), with `O = boxWidth/2` the transform origin
 * and `t = cropX` the framing offset:
 *   cover:   `X  = (boxWidth - naturalWidth * coverScale) / 2 + nx * coverScale`
 *   framing: `X' = zoom * (X - O) + O + t`
 *   ⇒ `X' = (coverScale * zoom) * nx + boxWidth/2 + cropX - (coverScale * zoom) * naturalWidth / 2`
 */
export function coverSampleTransform(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  cropX: number,
  cropY: number,
  zoom: number,
): CoverSampleTransform {
  // object-fit: cover — scale so the natural image covers the whole box (the
  // larger of the two axis ratios), then centre. The framing transform scales
  // that about the box centre by `zoom`, so the effective scale is their product.
  const coverScale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const scale = coverScale * zoom;
  const translateX = boxWidth / 2 + cropX - (scale * naturalWidth) / 2;
  const translateY = boxHeight / 2 + cropY - (scale * naturalHeight) / 2;
  return { scale, translateX, translateY };
}
