/**
 * The single home for the slot image's base-fit + pan/zoom framing math, shared
 * by the visual renderer and the pixel sampler so the two can never drift apart.
 *
 * The visible slot renders the image as an `<img>` with:
 *
 *   width: 100%; height: 100%; object-fit: cover | contain;   ← fit_mode
 *   transform: translate(crop_x px, crop_y px) scale(zoom);
 *   transform-origin: center;
 *
 * i.e. the browser first fits the natural image into the slot's rendered WxH box
 * with the slot's fit mode — `cover` ('fill': uniform scale to cover, centred,
 * overflow clipped) or `contain` ('fit': uniform scale to fit entirely, centred,
 * letterboxed) — then applies the CSS transform about the box centre. BOTH
 * object-fit modes use the SAME rule shape (one uniform base scale, centred), so
 * every derivation below holds for both; the only difference is whether the base
 * scale is the larger (`cover`) or smaller (`contain`) of the two axis ratios.
 *
 * `slotImageCssTransform` builds the transform string — used verbatim by the
 * renderer (it is fit-mode independent; the mode lives in `object-fit`, mapped by
 * `slotImageObjectFit`). `slotSampleTransform` reproduces the FULL mapping (base
 * fit + translate + scale) as one explicit affine transform an offscreen
 * `<canvas>` can apply, so pixel sampling reads the exact colour the user sees
 * under a click, at any crop/zoom, in either mode.
 */

/** How a slot fits its image: cover-and-crop ('fill') or letterbox ('fit'). */
export type SlotFitMode = "fill" | "fit";

/**
 * Narrow the DB's text column to a `SlotFitMode`. Anything unexpected (legacy
 * rows, bad data) degrades to 'fill' — the original behaviour — never a crash.
 */
export function normaliseFitMode(value: string | null | undefined): SlotFitMode {
  return value === "fit" ? "fit" : "fill";
}

/** The CSS `object-fit` value pairing with a fit mode — the renderer half of the
 * contract whose sampler half is the min/max choice in `slotSampleTransform`. */
export function slotImageObjectFit(fitMode: SlotFitMode): "cover" | "contain" {
  return fitMode === "fit" ? "contain" : "cover";
}

/**
 * The CSS `transform` string applied to a slot image. Both the framing (unlocked)
 * and annotation (locked) renderers use this so the on-screen transform is defined
 * in exactly one place — the same place `slotSampleTransform` mirrors.
 */
export function slotImageCssTransform(
  cropX: number,
  cropY: number,
  zoom: number,
): string {
  return `translate(${cropX}px, ${cropY}px) scale(${zoom})`;
}

/**
 * The uniform base scale `object-fit` applies before the framing transform:
 * `cover` takes the LARGER of the two axis ratios (image covers the box),
 * `contain` the SMALLER (image fits inside the box). Centred in both cases.
 */
export function slotImageBaseScale(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  fitMode: SlotFitMode,
): number {
  const rx = boxWidth / naturalWidth;
  const ry = boxHeight / naturalHeight;
  return fitMode === "fit" ? Math.min(rx, ry) : Math.max(rx, ry);
}

/** An affine transform (uniform scale + translation) mapping natural-image pixels to slot-box pixels. */
export type SlotSampleTransform = {
  /** Uniform scale from natural-image pixels to slot-box pixels (object-fit base × zoom). */
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
 * and `t = cropX` the framing offset. `object-fit` (cover AND contain alike)
 * paints the image centred at a uniform `baseScale`:
 *   base:    `X  = (boxWidth - naturalWidth * baseScale) / 2 + nx * baseScale`
 *   framing: `X' = zoom * (X - O) + O + t`
 *   ⇒ `X' = (baseScale * zoom) * nx + boxWidth/2 + cropX - (baseScale * zoom) * naturalWidth / 2`
 *
 * The fit mode enters ONLY through `baseScale` (max vs min of the axis ratios);
 * the centring and framing algebra — the part originally brute-force verified —
 * is identical in both modes.
 */
export function slotSampleTransform(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  cropX: number,
  cropY: number,
  zoom: number,
  fitMode: SlotFitMode,
): SlotSampleTransform {
  const baseScale = slotImageBaseScale(
    naturalWidth,
    naturalHeight,
    boxWidth,
    boxHeight,
    fitMode,
  );
  const scale = baseScale * zoom;
  const translateX = boxWidth / 2 + cropX - (scale * naturalWidth) / 2;
  const translateY = boxHeight / 2 + cropY - (scale * naturalHeight) / 2;
  return { scale, translateX, translateY };
}

/**
 * The rectangle (in slot-box pixels) the image actually occupies on screen —
 * derived from the same affine as the sampler, so display maths (e.g. the
 * framing pan clamp) can never disagree with what is painted.
 */
export function displayedImageRect(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  cropX: number,
  cropY: number,
  zoom: number,
  fitMode: SlotFitMode,
): { left: number; top: number; width: number; height: number } {
  const { scale, translateX, translateY } = slotSampleTransform(
    naturalWidth,
    naturalHeight,
    boxWidth,
    boxHeight,
    cropX,
    cropY,
    zoom,
    fitMode,
  );
  return {
    left: translateX,
    top: translateY,
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
}
