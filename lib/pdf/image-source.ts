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
export const MAX_EDGE = readEnvInt("PDF_IMAGE_MAX_EDGE", 2000, 256, 8000);

/** The floor `imageEdgeFor` will not go below, however many images a document
 *  carries — quality has to stop falling somewhere. 700 px is ~90 DPI across a
 *  full-bleed slot: soft, but legible, and only a ~100-image pack reaches it.
 *  It is the floor, not the budget, that binds past that point, so a pack that
 *  large does start growing again — the export log makes that visible. */
const MIN_EDGE = 700;

/**
 * ONE pixel budget for the whole document, shared equally between its images.
 * Per-image caps alone do not bound a tech pack: 60 slots at 2000 px is a
 * 30 MB download whatever each individual image costs, and the host drops any
 * response past 20 MB. Sharing a fixed budget keeps the total roughly constant
 * as a product grows, so a big pack degrades in resolution instead of failing
 * to arrive. Sized as "12 images may each have the full 2000 px" — beyond
 * that, everything shrinks together.
 */
const TOTAL_PIXEL_BUDGET = 12 * MAX_EDGE * MAX_EDGE;

/**
 * The longest edge each image may keep in a document carrying `imageCount` of
 * them. Bytes scale with area, so an equal share of the pixel budget means an
 * edge of √(budget / count), clamped to the per-image ceiling and floor.
 */
export function imageEdgeFor(imageCount: number): number {
  if (imageCount <= 1) return MAX_EDGE;
  const share = Math.sqrt(TOTAL_PIXEL_BUDGET / imageCount);
  return Math.round(Math.min(MAX_EDGE, Math.max(MIN_EDGE, share)));
}

/** JPEG quality for re-encoded photographic sources. */
const JPEG_QUALITY = readEnvInt("PDF_IMAGE_JPEG_QUALITY", 80, 40, 100);

/** An image within MAX_EDGE and under this size is already cheap enough to
 *  embed as-is — re-encoding it would only risk generational quality loss. */
const PASSTHROUGH_MAX_BYTES = 600 * 1024;

/**
 * How expensive a lossless encode may be, PER PIXEL, before JPEG is used
 * instead. This is a content test: PNG compresses line art perhaps 15:1
 * against raw RGB and a photograph barely 1.5:1, so cost-per-pixel separates
 * the two no matter what size the image ends up. Measured: a technical flat
 * lands near 0.26 B/px, photographic content near 1.5–2.3 B/px. 0.6 B/px —
 * a 5:1 ratio — sits in the wide gap between them.
 *
 * It has to be a RATE and not a byte count. An absolute threshold moves with
 * the image: shrink a photograph enough and its PNG slips under the limit, so
 * the document would flip back to lossless exactly when it was trying to get
 * smaller. That cost 34 MB on a 60-image pack in testing.
 */
const LOSSLESS_MAX_BYTES_PER_PIXEL = 0.6;

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

/**
 * Whether an image can be embedded exactly as fetched. Both tests matter and
 * for different reasons: BYTES decide what the download weighs, PIXELS decide
 * what the render costs, since pdfkit decodes every PNG to a raw bitmap
 * (width × height × 4). A well-compressed 4000 px flat can be under 600 KB on
 * disk and still 64 MB decoded, so a size test alone would wave it through.
 */
function canEmbedAsIs(
  bytes: Buffer,
  contentType: string,
  meta: { width?: number; height?: number },
  maxEdge: number,
): boolean {
  // WebP always needs transcoding — @react-pdf cannot embed it.
  if (contentType === "image/webp") return false;
  if (bytes.byteLength > PASSTHROUGH_MAX_BYTES) return false;
  const edge = Math.max(meta.width ?? Infinity, meta.height ?? Infinity);
  return edge <= maxEdge;
}

/**
 * Encode a resized pipeline, choosing the format by what the image IS rather
 * than by a blanket rule — a tech pack's line work must not pick up JPEG
 * ringing just because a photograph elsewhere in the document needed it.
 *
 *  · already-lossy source (JPEG) → JPEG, since a lossless re-encode would only
 *    inflate it without recovering anything;
 *  · transparent source → PNG, the only one of the two with an alpha channel;
 *  · otherwise → PNG, unless it costs more than LOSSLESS_MAX_BYTES_PER_PIXEL,
 *    which is the signature of photographic content.
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

  // `resolveWithObject` gives the ENCODED dimensions, so the rate is measured
  // against the pixels actually embedded rather than the source's.
  const { data, info } = await pipeline
    .clone()
    .png()
    .toBuffer({ resolveWithObject: true });
  const perPixel = data.byteLength / Math.max(1, info.width * info.height);
  if (!hasAlpha && perPixel > LOSSLESS_MAX_BYTES_PER_PIXEL) return jpeg();
  return { data, contentType: "image/png" };
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
  maxEdge: number = MAX_EDGE,
): Promise<PreparedImage> {
  const original: PreparedImage = { data: bytes, contentType };
  if (!RESIZABLE_TYPES.has(contentType)) return original;

  const sharp = await loadSharp();
  if (!sharp) return original;

  try {
    // A header read, not a decode — cheap enough to do for every image.
    const meta = await sharp(bytes).metadata();
    if (canEmbedAsIs(bytes, contentType, meta, maxEdge)) return original;

    const pipeline = sharp(bytes)
      // Apply EXIF orientation, so the embedded pixels agree with the
      // width/height the browser recorded at upload (which the page geometry
      // positions from). pdfkit ignores EXIF, so this also straightens
      // rotated phone photos that used to export sideways.
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });

    // Transparency forces PNG — JPEG has no alpha channel.
    const { data: encoded, contentType: encodedType } = await encode(
      pipeline,
      contentType,
      meta.hasAlpha === true,
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
