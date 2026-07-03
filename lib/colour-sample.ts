import { normaliseFitMode, slotSampleTransform } from "@/lib/cover-geometry";

/**
 * Cross-browser image colour sampler. Reads the true pixel colour under a click
 * on a locked slot's image by replaying the exact same base-fit (cover/contain)
 * + pan/zoom framing math the renderer uses (see `lib/cover-geometry.ts`) onto
 * an offscreen canvas, then reading that single pixel back.
 *
 * Deliberately does NOT use the `EyeDropper` API (Chromium-only) — this works
 * identically in Chrome, Safari and Firefox with no feature branching, because a
 * 2D canvas + `getImageData` is universally supported.
 *
 * CORS (canvas tainting) — findings for the `product-assets` bucket:
 *   The bucket is PRIVATE (migration 0015); images render from long-lived signed
 *   URLs on the Supabase Storage domain. Supabase Storage serves permissive CORS
 *   (`Access-Control-Allow-Origin: *`) on its object/sign endpoints by default,
 *   and hosted projects expose no per-bucket CORS toggle to change — so in the
 *   normal case NO manual dashboard step is required: `getImageData` is allowed.
 *   The one caveat that can still taint a read is browser HTTP-cache pollution —
 *   if the visible <img> (no crossOrigin) cached a response the crossOrigin load
 *   reuses without the header. That is exactly why every read is wrapped so a
 *   `SecurityError` degrades to `null` (→ manual hex entry), never a crash. If a
 *   deployment ever finds sampling blocked, the fix is a Storage CORS allow-rule
 *   for the app origin in the project's Storage settings; the code needs no change.
 */

// Loaded images are cached per URL so re-sampling the same slot is instant and
// doesn't re-request over the network. Promises are cached (not just resolved
// images) so concurrent samples of the same URL share one load.
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    // MUST be set before `src`: requests the image with CORS so the canvas it is
    // drawn onto stays untainted and `getImageData` is permitted. If the server
    // doesn't return `Access-Control-Allow-Origin`, the load fails here (onerror)
    // rather than tainting the canvas — either way sampling falls back cleanly.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("colour-sample: image failed to load"));
    img.src = src;
  });
  // Don't cache a failed load — a transient error should be retryable.
  promise.catch(() => {
    if (imageCache.get(src) === promise) imageCache.delete(src);
  });
  imageCache.set(src, promise);
  return promise;
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Sample the colour at a click point on a locked slot's image.
 *
 * @param clickXFraction 0–1 fraction of the slot's rendered width, same convention as annotation x/y.
 * @param clickYFraction 0–1 fraction of the slot's rendered height.
 * @returns an uppercase `#RRGGBB` hex string, or `null` if sampling failed or was
 *   unavailable (CORS/tainted canvas, image load failure, zero-size slot, …). The
 *   caller treats `null` as "fall back to manual hex entry", never a hard error.
 */
export async function sampleColourAtPoint(
  asset: { file_url: string; width: number | null; height: number | null },
  slot: { crop_x: number; crop_y: number; zoom: number; fit_mode: string },
  slotRenderedWidth: number,
  slotRenderedHeight: number,
  clickXFraction: number,
  clickYFraction: number,
): Promise<string | null> {
  try {
    const boxWidth = Math.round(slotRenderedWidth);
    const boxHeight = Math.round(slotRenderedHeight);
    if (boxWidth <= 0 || boxHeight <= 0) return null;

    const img = await loadImage(asset.file_url);
    // Prefer the browser's decoded intrinsic size — exactly what object-fit uses
    // on the visible <img>, so the sampler can't drift from the render. Fall back
    // to the stored asset dimensions only if it's somehow unavailable.
    const naturalWidth = img.naturalWidth || asset.width || 0;
    const naturalHeight = img.naturalHeight || asset.height || 0;
    if (naturalWidth <= 0 || naturalHeight <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = boxWidth;
    canvas.height = boxHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const { scale, translateX, translateY } = slotSampleTransform(
      naturalWidth,
      naturalHeight,
      boxWidth,
      boxHeight,
      slot.crop_x,
      slot.crop_y,
      slot.zoom,
      normaliseFitMode(slot.fit_mode),
    );
    // Reproduce the on-screen render into the offscreen canvas: the slot's base
    // fit (cover or contain), then translate + scale about centre. Drawing the
    // image at its natural size lets the context transform place every natural
    // pixel exactly where the browser paints it on the visible slot. In 'fit'
    // mode a click on the letterbox reads the blank canvas (transparent black →
    // '#000000'); the colourway flow already treats any sample as a starting
    // point the user can override, so no special-casing is needed here.
    ctx.setTransform(scale, 0, 0, scale, translateX, translateY);
    ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);

    // The click fraction is the same 0–1 slot convention as annotation x/y, so
    // `fraction * boxSize` is the exact box pixel the user clicked. getImageData
    // reads the raw backing store and ignores the current transform, so these are
    // plain canvas coordinates.
    const px = clampInt(clickXFraction * boxWidth, 0, boxWidth - 1);
    const py = clampInt(clickYFraction * boxHeight, 0, boxHeight - 1);
    const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`.toUpperCase();
  } catch {
    // SecurityError (tainted canvas), image load rejection, etc. Manual hex entry
    // is always available, so a failed sample is a silent, graceful no-op.
    return null;
  }
}
