/**
 * Shared server-side data assembly for the PDF routes: the raw
 * canvas_pages/canvas_slots embed shape, the image fetcher (data URIs, origin-
 * pinned, MEMOISED per URL so an asset reused across slots/pages — or the hero
 * doubling as a slot image — is fetched exactly once per request, downscaled
 * through `lib/pdf/image-source.ts`, and rate-limited so peak memory does not
 * scale with the size of the product), and the
 * slot-row → PdfSlotData mapping. Both the single-page route
 * (`/products/[id]/pdf`) and the full-document route
 * (`/products/[id]/techpack.pdf`) build their data through here, so the two
 * can never drift.
 */

import type { PdfImage } from "@/lib/pdf/image-fit";
import {
  MAX_SOURCE_BYTES,
  PDF_EMBEDDABLE_TYPES,
  imageEdgeFor,
  prepareImageForPdf,
} from "@/lib/pdf/image-source";
import type { PdfSlotData } from "@/lib/pdf/render-techpack-page";
import type {
  CanvasAnnotation,
  CanvasLayerType,
  CanvasPage,
  CanvasSlot,
  ProductAsset,
} from "@/types";

/** The PostgREST embed shape both PDF routes select. */
export type RawPdfSlot = CanvasSlot & {
  product_assets: ProductAsset | null;
  canvas_annotations: CanvasAnnotation[];
};
export type RawPdfPage = CanvasPage & { canvas_slots: RawPdfSlot[] };

/** Formats worth downloading at all: what @react-pdf can embed, plus WebP,
 * which the upload flow accepts and `prepareImageForPdf` transcodes on the way
 * in (the PDF engine cannot rasterise WebP itself). Anything else degrades to
 * the "image unavailable" box rather than crashing the export. */
const PDF_FETCHABLE_TYPES = new Set([...PDF_EMBEDDABLE_TYPES, "image/webp"]);

/**
 * How many images are fetched-and-prepared at once. The export used to pull
 * every asset on every page concurrently, so peak memory scaled with the
 * PRODUCT — one big tech pack could hold a hundred full-resolution buffers at
 * the same moment and take the serverless function down with it. A small
 * window keeps peak memory flat regardless of page count, and the work is
 * network- and CPU-bound rather than latency-bound, so it costs little.
 */
const FETCH_CONCURRENCY = 4;

/** What one request's images cost — logged by the export routes on the way
 *  out, so a slow or failing export can be read straight off the function log
 *  instead of guessed at. */
export type ImageStats = {
  /** Images successfully prepared and embedded. */
  embedded: number;
  /** Assets that could not be embedded (fetch failure, unsupported format,
   *  over the size cap) and render as a fallback box. */
  skipped: number;
  /** Total bytes handed to the renderer, after downscaling. */
  bytes: number;
};

export type ImageFetcher = ((url: string) => Promise<string | null>) & {
  stats: () => ImageStats;
};

/** A minimal counting semaphore — enough to bound the fetch/resize window
 *  without pulling in a dependency. A finishing task hands its slot straight
 *  to the next waiter rather than releasing it, so the limit holds even while
 *  the waiter is still queued as a microtask. */
export function createGate(
  limit: number,
): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/**
 * Fetch an image server-side and hand @react-pdf a data URI — Step 0 verified
 * both PNG and SVG data URIs render (raw Buffers are only sniffed for raster
 * magic bytes, which would reject SVG uploads), and URL-fetching inside the
 * renderer was deliberately not relied on. A failed fetch, an unsupported
 * format, an oversized file, or an off-origin URL returns null → the consumer
 * renders a visible fallback, never a crash.
 *
 * Origin pinning: image URLs come from workspace-writable DB columns
 * (product_assets.file_url, brands.logo_url), so the server only ever fetches
 * from the configured Supabase host — never an arbitrary URL a tampered row
 * could point at (SSRF guard).
 *
 * Rasters are downscaled to the resolution the page can actually show before
 * they become data URIs (`lib/pdf/image-source.ts`) — uploads keep their
 * original resolution, and embedding 4000–8000 px sources verbatim is what
 * exhausted the export function's memory.
 *
 * The returned fetcher memoises by URL — including in-flight promises and
 * failures — so each unique asset is fetched, resized and encoded exactly once
 * per request no matter how many slots/pages reference it.
 *
 * `imageCount` is how many DISTINCT assets the caller is about to ask for. It
 * only sets the shared pixel budget (`imageEdgeFor`); over-estimating costs
 * some resolution, under-estimating costs nothing but size. A rough count is
 * fine — a caller with a handful of images can leave it at the default.
 */
export function createImageFetcher(imageCount = 1): ImageFetcher {
  const cache = new Map<string, Promise<string | null>>();
  const gate = createGate(FETCH_CONCURRENCY);
  const stats: ImageStats = { embedded: 0, skipped: 0, bytes: 0 };
  // The document's images share one pixel budget, so a 60-image pack shrinks
  // its images rather than producing a download the host will refuse to send.
  const maxEdge = imageEdgeFor(imageCount);

  async function fetchOnce(url: string): Promise<string | null> {
    try {
      const allowedOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
        .origin;
      if (new URL(url).origin !== allowedOrigin) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
      if (!PDF_FETCHABLE_TYPES.has(type)) return null;
      // Refuse a pathological upload before it is buffered, so one bad asset
      // cannot take the whole export down with it.
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
        console.warn(`[pdf] image skipped, ${declared} bytes exceeds the cap`);
        return null;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > MAX_SOURCE_BYTES) {
        console.warn(
          `[pdf] image skipped, ${buffer.byteLength} bytes exceeds the cap`,
        );
        return null;
      }
      const prepared = await prepareImageForPdf(buffer, type, maxEdge);
      // A source the resizer could not convert (an unavailable `sharp`, a
      // decode failure) may still be a format the engine cannot embed.
      if (!PDF_EMBEDDABLE_TYPES.has(prepared.contentType)) return null;
      return `data:${prepared.contentType};base64,${prepared.data.toString("base64")}`;
    } catch {
      return null;
    }
  }

  const fetcher = (url: string) => {
    let hit = cache.get(url);
    if (!hit) {
      hit = gate(() => fetchOnce(url)).then((src) => {
        if (src === null) {
          stats.skipped += 1;
        } else {
          stats.embedded += 1;
          // `data:<type>;base64,<payload>` — the payload decodes to ¾ of its
          // own length, near enough for a log line.
          stats.bytes += Math.floor((src.length - src.indexOf(",") - 1) * 0.75);
        }
        return src;
      });
      cache.set(url, hit);
    }
    return hit;
  };

  return Object.assign(fetcher, { stats: (): ImageStats => ({ ...stats }) });
}

/**
 * Recover an SVG's intrinsic size from its markup (width/height attributes,
 * else the viewBox) — the upload flow can't always decode SVG dimensions into
 * product_assets.width/height, and the geometry needs SOME natural size to
 * place the image rect. Returns null for non-SVG or unparseable markup.
 */
export function svgIntrinsicSize(
  dataUri: string,
): { width: number; height: number } | null {
  if (!dataUri.startsWith("data:image/svg+xml;base64,")) return null;
  try {
    const svg = Buffer.from(dataUri.split(",")[1], "base64").toString("utf8");
    const open = svg.match(/<svg[^>]*>/i)?.[0];
    if (!open) return null;
    const attr = (name: string): number | null => {
      const m = open.match(new RegExp(`${name}\\s*=\\s*"([\\d.]+)`, "i"));
      return m ? Number(m[1]) : null;
    };
    const w = attr("width");
    const h = attr("height");
    if (w && h) return { width: w, height: h };
    const vb = open.match(
      /viewBox\s*=\s*"\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i,
    );
    if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
    return null;
  } catch {
    return null;
  }
}

/**
 * Natural pixel size of a fetched data-URI image (SVG via markup, PNG via
 * IHDR, JPEG via its SOF frame). The cover renderer needs real dimensions to
 * contain-fit the hero/logo itself — react-pdf's `objectFit` cannot be relied
 * on for SVG sources (verified: an SVG data URI renders at natural size,
 * ignoring the style box), so sizing is always computed in our own geometry,
 * exactly like the slot renderer does. Null means "don't render this image".
 */
export function dataUriImageSize(
  dataUri: string,
): { width: number; height: number } | null {
  const svg = svgIntrinsicSize(dataUri);
  if (svg) return svg;
  try {
    const comma = dataUri.indexOf(",");
    if (comma === -1) return null;
    const bytes = Buffer.from(dataUri.slice(comma + 1), "base64");
    // PNG: 8-byte signature, then the IHDR chunk carries width/height.
    if (
      bytes.length > 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    // JPEG: walk the marker segments to the first SOFn frame header.
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let pos = 2;
      while (pos + 9 < bytes.length) {
        if (bytes[pos] !== 0xff) return null;
        const marker = bytes[pos + 1];
        // SOF0–SOF15 minus the non-frame DHT/JPG/DAC markers (C4/C8/CC).
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return {
            height: bytes.readUInt16BE(pos + 5),
            width: bytes.readUInt16BE(pos + 7),
          };
        }
        pos += 2 + bytes.readUInt16BE(pos + 2);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A fetched data URI as a sized PdfImage — natural size from the DB columns
 * when known, else sniffed from the bytes. Null (no source / unmeasurable)
 * means the consumer skips the image rather than mis-sizing it.
 */
export function resolvePdfImage(
  src: string | null,
  knownWidth?: number | null,
  knownHeight?: number | null,
): PdfImage | null {
  if (!src) return null;
  if (knownWidth && knownHeight) {
    return { src, width: knownWidth, height: knownHeight };
  }
  const size = dataUriImageSize(src);
  return size ? { src, ...size } : null;
}

/**
 * Map one page's raw slot rows to the renderer's PdfSlotData, fetching images
 * through the (memoised) fetcher. `allowedTypes` is the Quick Export layer
 * filter: when present, only annotations of those layer_types are kept — the
 * SAME composed renderer then draws fewer pins and callout groups; there is no
 * second per-layer rendering model. Undefined means no filter (full composed
 * page, the single-page route's behaviour).
 */
export async function buildPdfSlots(
  rawSlots: RawPdfSlot[],
  fetchImage: ImageFetcher,
  allowedTypes?: ReadonlySet<CanvasLayerType>,
): Promise<PdfSlotData[]> {
  const sorted = [...rawSlots].sort((a, b) => a.slot_index - b.slot_index);
  return Promise.all(
    sorted.map(async (slot): Promise<PdfSlotData> => {
      const asset = slot.product_assets;
      const image = asset ? await fetchImage(asset.file_url) : null;
      // The upload flow can't always decode SVG dimensions into the asset
      // row; recover them from the SVG markup so the geometry can place the
      // image instead of showing the dimensions-unavailable box.
      const svgSize =
        image && (!asset?.width || !asset?.height)
          ? svgIntrinsicSize(image)
          : null;
      return {
        framing: {
          crop_x: slot.crop_x,
          crop_y: slot.crop_y,
          zoom: slot.zoom,
          fit_mode: slot.fit_mode,
          lock_width: slot.lock_width,
          lock_height: slot.lock_height,
        },
        naturalWidth: asset?.width ?? svgSize?.width ?? null,
        naturalHeight: asset?.height ?? svgSize?.height ?? null,
        assetName: asset?.name ?? null,
        name: slot.name,
        // Distinguishes a never-filled slot (clean empty box) from an asset
        // whose image fetch failed ("Image unavailable").
        hasAsset: asset !== null,
        image,
        annotations: allowedTypes
          ? slot.canvas_annotations.filter((a) => allowedTypes.has(a.layer_type))
          : slot.canvas_annotations,
      };
    }),
  );
}
