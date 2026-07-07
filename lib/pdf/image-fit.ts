/**
 * The one image-sizing contract every PDF page shares: an image is a data URI
 * PLUS its natural pixel size, and boxes are fitted with our own math.
 * react-pdf's `objectFit` cannot be relied on across sources (verified: an
 * SVG data URI renders at natural size, ignoring the style box), so the
 * cover, the per-page header logo — anything outside the slot geometry —
 * sizes images through `containFit` instead.
 */

export type PdfImage = {
  src: string;
  width: number;
  height: number;
};

/** width/height scaled to fit inside a box, never cropping or stretching. */
export function containFit(
  image: PdfImage,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const scale = Math.min(boxW / image.width, boxH / image.height);
  return { width: image.width * scale, height: image.height * scale };
}
