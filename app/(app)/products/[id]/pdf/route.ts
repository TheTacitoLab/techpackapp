import type { NextRequest } from "next/server";

import { parseLayerColours } from "@/components/canvas/layers";
import { renderTechPackPagePdf } from "@/lib/pdf/render-techpack-page";
import type { PdfPageData, PdfSlotData } from "@/lib/pdf/render-techpack-page";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CanvasAnnotation,
  CanvasPage,
  CanvasSlot,
  ProductAsset,
} from "@/types";

/** Formats @react-pdf 4.5.1 can actually rasterise (Step 0-verified). WebP is
 * uploadable but NOT renderable by the PDF engine — it degrades to the
 * "image unavailable" box rather than crashing the whole export. */
const PDF_RENDERABLE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

/**
 * Fetch a slot image server-side and hand @react-pdf a data URI — Step 0
 * verified both PNG and SVG data URIs render (raw Buffers are only sniffed
 * for raster magic bytes, which would reject SVG uploads), and URL-fetching
 * inside the renderer was deliberately not relied on. A failed fetch, an
 * unsupported format, or an off-origin URL returns null → the slot renders a
 * visible "image unavailable" box, never a crash.
 *
 * Origin pinning: file_url is a workspace-writable DB column, so the server
 * only ever fetches from the configured Supabase host — never an arbitrary
 * URL a tampered row could point at (SSRF guard).
 */
async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const allowedOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    if (new URL(url).origin !== allowedOrigin) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
    if (!PDF_RENDERABLE_TYPES.has(type)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Recover an SVG's intrinsic size from its markup (width/height attributes,
 * else the viewBox) — the upload flow can't always decode SVG dimensions into
 * product_assets.width/height, and the geometry needs SOME natural size to
 * place the image rect. Returns null for non-SVG or unparseable markup.
 */
function svgIntrinsicSize(
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
    const vb = open.match(/viewBox\s*=\s*"\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
    if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /products/{id}/pdf?pageId={uuid}
 *
 * Renders ONE canvas page as a landscape-A4 PDF: a single COMPOSED page with
 * every annotation layer's pins in their own colours and a layer→slot→pin
 * callout column — the export twin of the on-screen "All layers" view. Auth +
 * workspace scoping match every other data path (product row must belong to the
 * caller's workspace; RLS guards the rest). `pageId` defaults to the product's
 * first locked page.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", user.profile.workspace_id)
    .single();
  if (!product) return new Response("Not found", { status: 404 });

  // All the product's pages (for "Page X of Y" + the default-page pick), then
  // the target page with slots → asset + annotations embedded, same shape the
  // canvas itself loads.
  const { data: pages } = await supabase
    .from("canvas_pages")
    .select("*, canvas_slots(*, product_assets(*), canvas_annotations(*))")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  type RawSlot = CanvasSlot & {
    product_assets: ProductAsset | null;
    canvas_annotations: CanvasAnnotation[];
  };
  type RawPage = CanvasPage & { canvas_slots: RawSlot[] };
  const allPages = (pages ?? []) as unknown as RawPage[];

  const requestedPageId = url.searchParams.get("pageId");
  // An explicitly requested page that doesn't exist is a 404, not a silent
  // fallback to some other page's export.
  let page: RawPage | undefined;
  if (requestedPageId) {
    page = allPages.find((p) => p.id === requestedPageId);
    if (!page) return new Response("Page not found", { status: 404 });
  } else {
    page =
      allPages.find((p) => p.canvas_slots.some((s) => s.is_locked)) ??
      allPages[0];
  }
  if (!page) return new Response("No canvas pages", { status: 404 });

  const [{ data: brand }, { data: season }] = await Promise.all([
    product.brand_id
      ? supabase.from("brands").select("name").eq("id", product.brand_id).single()
      : Promise.resolve({ data: null }),
    product.season_id
      ? supabase.from("seasons").select("name").eq("id", product.season_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Every pin (on the imagery) and every callout layer-heading resolves its
  // own colour from these overrides inside the renderer — the SAME resolution
  // the on-screen canvas uses (imported, not reimplemented).
  const overrides = parseLayerColours(user.workspace?.layer_colours);

  const sortedSlots = [...page.canvas_slots].sort(
    (a, b) => a.slot_index - b.slot_index,
  );
  const slots: PdfSlotData[] = await Promise.all(
    sortedSlots.map(async (slot): Promise<PdfSlotData> => {
      const asset = slot.product_assets;
      const image = asset ? await fetchImageDataUri(asset.file_url) : null;
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
        // A page exports COMPOSED — all of the slot's pins, every layer.
        annotations: slot.canvas_annotations,
      };
    }),
  );

  const pageIndex = allPages.findIndex((p) => p.id === page.id);
  const data: PdfPageData = {
    styleName: product.name,
    styleNumber: product.style_number ?? "—",
    seasonName: season?.name ?? "—",
    brandName: brand?.name ?? "Brand",
    designerName: product.designer_name ?? "—",
    // Spike hardcodes: versioning ships with the approval flow.
    versionLabel: "V1 · Draft",
    dateLabel: new Date().toISOString().slice(0, 10),
    pageNumber: pageIndex + 1,
    pageCount: allPages.length,
    pageLabel: page.label ?? `Page ${pageIndex + 1}`,
    template: page.template,
    layerColours: overrides,
    // Typed non-null, but genuinely undefined until migration 0026 runs —
    // fall back to a visible placeholder rather than a "/view/undefined" link.
    shareToken:
      (product.share_token as string | undefined) ?? "preview-no-token",
    // Per-canvas-page notes: the same text renders on every layer-page.
    notes: page.notes,
    slots,
  };

  let pdf: Buffer;
  try {
    pdf = await renderTechPackPagePdf(data);
  } catch (err) {
    console.error("[pdf] renderTechPackPagePdf failed:", err);
    return new Response("PDF generation failed", { status: 500 });
  }
  const filename = `${product.name.replace(/[^\w-]+/g, "_")}_p${pageIndex + 1}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
