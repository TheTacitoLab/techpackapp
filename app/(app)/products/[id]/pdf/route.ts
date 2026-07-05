import type { NextRequest } from "next/server";

import {
  ANNOTATION_LAYERS,
  layerByKey,
  parseLayerColours,
  resolveLayerColour,
  type LayerKey,
} from "@/components/canvas/layers";
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

function isLayerKey(value: string): value is LayerKey {
  return ANNOTATION_LAYERS.some((l) => l.key === value);
}

/**
 * Fetch a slot image server-side and hand @react-pdf a data URI — Step 0
 * verified both PNG and SVG data URIs render (raw Buffers are only sniffed
 * for raster magic bytes, which would reject SVG uploads), and URL-fetching
 * inside the renderer was deliberately not relied on. A failed fetch returns
 * null → the slot renders a visible "image unavailable" box, never a crash.
 */
async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * GET /products/{id}/pdf?pageId={uuid}&layer={colourway|fabric|measurement|construction}
 *
 * Canvas-to-PDF spike: renders ONE canvas page for ONE layer as a landscape A4
 * PDF. Auth + workspace scoping match every other data path (product row must
 * belong to the caller's workspace; RLS guards the rest). `pageId` defaults to
 * the product's first locked page, `layer` to Fabrics & Trim.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const layerParam = url.searchParams.get("layer") ?? "fabric";
  if (!isLayerKey(layerParam)) {
    return new Response("Unknown layer", { status: 400 });
  }
  const layer = layerByKey(layerParam);

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
  const page =
    (requestedPageId
      ? allPages.find((p) => p.id === requestedPageId)
      : allPages.find((p) => p.canvas_slots.some((s) => s.is_locked))) ??
    allPages[0];
  if (!page) return new Response("No canvas pages", { status: 404 });

  const [{ data: brand }, { data: season }] = await Promise.all([
    product.brand_id
      ? supabase.from("brands").select("name").eq("id", product.brand_id).single()
      : Promise.resolve({ data: null }),
    product.season_id
      ? supabase.from("seasons").select("name").eq("id", product.season_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // The layer's marker colour: workspace override else built-in — the SAME
  // resolution the canvas uses (imported, not reimplemented).
  const overrides = parseLayerColours(user.workspace?.layer_colours);
  const layerColour = resolveLayerColour(layer.key, overrides);

  const sortedSlots = [...page.canvas_slots].sort(
    (a, b) => a.slot_index - b.slot_index,
  );
  const slots: PdfSlotData[] = await Promise.all(
    sortedSlots.map(async (slot): Promise<PdfSlotData> => {
      const asset = slot.product_assets;
      return {
        framing: {
          crop_x: slot.crop_x,
          crop_y: slot.crop_y,
          zoom: slot.zoom,
          fit_mode: slot.fit_mode,
          lock_width: slot.lock_width,
          lock_height: slot.lock_height,
        },
        isLocked: slot.is_locked,
        naturalWidth: asset?.width ?? null,
        naturalHeight: asset?.height ?? null,
        assetName: asset?.name ?? null,
        image: asset ? await fetchImageDataUri(asset.file_url) : null,
        // Only the chosen layer's pins reach the PDF at all.
        annotations: slot.canvas_annotations.filter((a) =>
          layer.types.includes(a.layer_type),
        ),
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
    layerKey: layer.key,
    layerLabel: layer.label,
    layerColour,
    shareToken: product.share_token,
    slots,
  };

  const pdf = await renderTechPackPagePdf(data);
  const filename = `${product.name.replace(/[^\w-]+/g, "_")}_${layer.key}_p${pageIndex + 1}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
