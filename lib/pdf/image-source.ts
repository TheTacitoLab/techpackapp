/**
 * Source-image preparation for the PDF exports — the step between "fetched the
 * asset bytes" and "handed them to @react-pdf".
 *
 * WHY THIS EXISTS. Uploads are stored at their original resolution (see
 * `components/canvas/asset-upload.ts` — no resize on the way in), so a tech
 * pack routinely carries 4000–8000 px flats and photographs. Embedding those
 * verbatim is what made the full-document export fall over on the serverless
 * host: every source file is held as a Buffer AND as its ~1.33× base64 data
 * URI, pdfkit then decodes every PNG to a raw RGBA bitmap (width × height × 4
 * bytes) to re-deflate it, and the same bytes land in the response. A handful
 * of multi-megapixel images is enough to exhaust a 1 GB function — a process
 * death the route's own try/catch can never turn into a clean 500, which is
 * exactly the "function has crashed" 502 the export was returning.
 *
 * WHAT IT DOES. Rasters are auto-oriented, downscaled so neither edge exceeds
 * MAX_EDGE, and re-encoded — the page can only ever show ~566 × 322 pt of
 * image, so anything beyond that budget costs memory, CPU and download size
 * while adding no visible detail. SVGs pass through untouched (vector, tiny,
 * and rasterising them would LOSE quality). An image already inside the budget
 * and comfortably small is passed through byte-for-byte.
 *
 * Aspect ratio is preserved exactly, because the page geometry places images
 * from `product_assets.width/height` (the ORIGINAL pixel dimensions recorded at
 * upload), not from the bytes we embed — a downscale must not move anything.
 *
 * Every failure degrades to the original bytes rather than throwing: a resize
 * is an optimisation, never a precondition for exporting.
 */

import type { Sharp } from "sharp";

/** Longest edge, in pixels, an embedded raster keeps. The largest slot a page
 *  can draw is ~566 × 322 pt, so 2000 px still leaves ~250 DPI at full bleed
 *  and holds up under the canvas's 4× max zoom on the region actually shown.
 *  Override with PDF_IMAGE_MAX_EDGE if a workspace needs more or less. */
const MAX_EDGE = readEnvInt("PDF_IMAGE_MAX_EDGE", 2000, 256, 8000);

/** JPEG quality for re-encoded photographic sources. */
const JPEG_QUALITY = readEnvInt("PDF_IMAGE_JPEG_QUALITY", 80, 40, 100);

/** An image within MAX_EDGE and under this size is already cheap enough to
 *  embed as-is — re-encoding it would only risk generational quality loss. */
const PASSTHROUGH_MAX_BYTES = 600 * 1024;

/** How large a downscaled LOSSLESS encode may be before it is re-encoded as
 *  JPEG instead. This is really a content test dressed as a size test: at
 *  2000 px a technical flat lands around 700 KB as PNG, a photograph around
 *  6 MB. Line work — where JPEG ringing would actually show — therefore stays
 *  lossless, and only genuinely photographic content pays for it. */
const LOSSLESS_MAX_BYTES = 1024 * 1024;

/** Hard ceiling on a single source file. Beyond this the asset is treated as
 *  unavailable (a visible "Image unavailable" box) rather than risking the
 *  whole export on one pathological upload. ~50 MB is far past any real
 *  garment image. */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

/** Rasters we can decode and re-encode. WebP is included: uploads accept it
 *  (`ACCEPTED_IMAGE_TYPES`) but @react-pdf cannot rasterise it, so it used to
 *  degrade to an "Image unavailable" box — transcoding it here makes those
 *  assets render. */
const RESIZABLE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Types @react-pdf can embed once we are done. SVG never passes through the
 *  resizer; every raster leaves it as PNG or JPEG. */
export const PDF_EMBEDDABLE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

export type PreparedImage = { data: Buffer; contentType: string };

function readEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

/**
 * `sharp` is a native module and lives outside the bundle (it is on Next's
 * default `serverExternalPackages` list). Load it lazily and remember a
 * failure, so a host that cannot load the binary falls back to today's
 * pass-through behaviour for the whole request instead of failing every image.
 */
let sharpModule: ((input: Buffer) => Sharp) | null | undefined;

async function loadSharp(): Promise<((input: Buffer) => Sharp) | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    const mod = await import("sharp");
    sharpModule = (mod.default ?? mod) as unknown as (input: Buffer) => Sharp;
  } catch (err) {
    console.warn("[pdf] sharp unavailable, embedding images unresized:", err);
    sharpModule = null;
  }
  return sharpModule;
}

/** Whether these bytes need the resizer at all. */
function needsPreparation(bytes: Buffer, contentType: string): boolean {
  if (!RESIZABLE_TYPES.has(contentType)) return false;
  // WebP always needs transcoding — @react-pdf cannot embed it.
  if (contentType === "image/webp") return true;
  return bytes.byteLength > PASSTHROUGH_MAX_BYTES;
}

/**
 * Encode a resized pipeline, choosing the format by what the image IS rather
 * than by a blanket rule — a tech pack's line work must not pick up JPEG
 * ringing just because a photograph elsewhere in the document needed it.
 *
 *  · already-lossy source (JPEG) → JPEG, since a lossless re-encode would only
 *    inflate it without recovering anything;
 *  · transparent source → PNG, the only one of the two with an alpha channel;
 *  · otherwise → PNG, unless it is still heavy at this size, which is the
 *    signature of photographic content: flats land near 700 KB, photographs
 *    nearer 6 MB.
 *
 * Default PNG compression deliberately — level 9 costs seconds per image on a
 * serverless CPU for a few percent of size.
 */
async function encode(
  pipeline: Sharp,
  sourceType: string,
  hasAlpha: boolean,
): Promise<PreparedImage> {
  const jpeg = async (): Promise<PreparedImage> => ({
    data: await pipeline
      .clone()
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer(),
    contentType: "image/jpeg",
  });

  if (sourceType === "image/jpeg") return jpeg();

  const png = await pipeline.clone().png().toBuffer();
  if (!hasAlpha && png.byteLength > LOSSLESS_MAX_BYTES) return jpeg();
  return { data: png, contentType: "image/png" };
}

/**
 * Downscale/re-encode one fetched image for embedding. Returns the prepared
 * bytes with the content type they are actually in — the caller must use the
 * RETURNED type, since a WebP source comes back as PNG or JPEG.
 *
 * Non-raster input (SVG), an unavailable `sharp`, or any decode failure returns
 * the input unchanged; the render then behaves exactly as it did before.
 */
export async function prepareImageForPdf(
  bytes: Buffer,
  contentType: string,
): Promise<PreparedImage> {
  const original: PreparedImage = { data: bytes, contentType };
  if (!needsPreparation(bytes, contentType)) return original;

  const sharp = await loadSharp();
  if (!sharp) return original;

  try {
    const pipeline = sharp(bytes)
      // Apply EXIF orientation, so the embedded pixels agree with the
      // width/height the browser recorded at upload (which the page geometry
      // positions from). pdfkit ignores EXIF, so this also straightens
      // rotated phone photos that used to export sideways.
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });

    const { data: encoded, contentType: encodedType } = await encode(
      pipeline,
      contentType,
      // Transparency forces PNG — JPEG has no alpha channel. `metadata()`
      // reads the header only; it does not decode the image.
      (await sharp(bytes).metadata()).hasAlpha === true,
    );

    // A re-encode that gained nothing (an already-optimised source) is
    // discarded — except for WebP, which has to change format regardless.
    if (contentType !== "image/webp" && encoded.byteLength >= bytes.byteLength) {
      return original;
    }
    return { data: encoded, contentType: encodedType };
  } catch (err) {
    console.warn("[pdf] image resize failed, embedding original:", err);
    return original;
  }
}
