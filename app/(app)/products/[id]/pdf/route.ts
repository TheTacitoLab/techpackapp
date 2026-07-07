import type { NextRequest } from "next/server";

import { parseLayerColours } from "@/components/canvas/layers";
import {
  createImageFetcher,
  buildPdfSlots,
  resolvePdfImage,
  type RawPdfPage,
} from "@/lib/pdf/page-data";
import { renderTechPackPagePdf } from "@/lib/pdf/render-techpack-page";
import type { PdfPageData } from "@/lib/pdf/render-techpack-page";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

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

  const allPages = (pages ?? []) as unknown as RawPdfPage[];

  const requestedPageId = url.searchParams.get("pageId");
  // An explicitly requested page that doesn't exist is a 404, not a silent
  // fallback to some other page's export.
  let page: RawPdfPage | undefined;
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
      ? supabase
          .from("brands")
          .select("name, logo_url")
          .eq("id", product.brand_id)
          .single()
      : Promise.resolve({ data: null }),
    product.season_id
      ? supabase.from("seasons").select("name").eq("id", product.season_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Every pin (on the imagery) and every callout layer-heading resolves its
  // own colour from these overrides inside the renderer — the SAME resolution
  // the on-screen canvas uses (imported, not reimplemented).
  const overrides = parseLayerColours(user.workspace?.layer_colours);

  // Shared assembly (lib/pdf/page-data.ts): memoised image fetch + slot
  // mapping — a page exports COMPOSED (no layer filter on this route).
  const fetchImage = createImageFetcher();
  const slots = await buildPdfSlots(page.canvas_slots, fetchImage);

  // Header logo — same fetch/fallback as the full-document export.
  const logo = resolvePdfImage(
    brand?.logo_url ? await fetchImage(brand.logo_url) : null,
  );

  const pageIndex = allPages.findIndex((p) => p.id === page.id);
  const data: PdfPageData = {
    styleName: product.name,
    styleNumber: product.style_number ?? "—",
    seasonName: season?.name ?? "—",
    brandName: brand?.name ?? "Brand",
    logo,
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
