import type { NextRequest } from "next/server";

import {
  ANNOTATION_LAYERS,
  parseLayerColours,
  type LayerKey,
} from "@/components/canvas/layers";
import { STATUS_LABELS } from "@/components/status-pill";
import {
  createImageFetcher,
  buildPdfSlots,
  dataUriImageSize,
  type RawPdfPage,
} from "@/lib/pdf/page-data";
import {
  buildBomRows,
  paginateBom,
  visibleBomColumns,
  type PdfBomPageData,
} from "@/lib/pdf/render-bom-page";
import type {
  PdfCoverData,
  PdfCoverImage,
} from "@/lib/pdf/render-cover-page";
import { renderTechPackDocumentPdf } from "@/lib/pdf/render-techpack-document";
import type {
  PdfFooterData,
  PdfHeaderData,
  PdfPageData,
} from "@/lib/pdf/render-techpack-page";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { CanvasLayerType, IdentitySectionData } from "@/types";

const ALL_LAYER_KEYS = ANNOTATION_LAYERS.map((l) => l.key);

/**
 * The Quick Export layer filter: `?layers=fabric,measurement` → the set of
 * selected layer KEYS, defaulting to all five when absent. Unknown keys are
 * ignored; a param that names no valid layer at all is a 400 (the UI disables
 * Export at zero — reaching that state means a hand-built URL).
 */
function parseLayersParam(
  raw: string | null,
): { keys: Set<LayerKey> } | { error: string } {
  if (raw === null || raw.trim() === "") {
    return { keys: new Set<LayerKey>(ALL_LAYER_KEYS) };
  }
  const keys = new Set<LayerKey>();
  for (const part of raw.split(",")) {
    const key = part.trim() as LayerKey;
    if ((ALL_LAYER_KEYS as string[]).includes(key)) keys.add(key);
  }
  if (keys.size === 0) return { error: "At least one layer is required." };
  return { keys };
}

/** The layer_types the selected layer keys cover — the ONE filter the whole
 *  composed pipeline (pins, callout groups, BOM inclusion) derives from. */
function allowedLayerTypes(keys: Set<LayerKey>): Set<CanvasLayerType> {
  const types = new Set<CanvasLayerType>();
  for (const layer of ANNOTATION_LAYERS) {
    if (keys.has(layer.key)) layer.types.forEach((t) => types.add(t));
  }
  return types;
}

/** A fetched data URI as a cover image — natural size from the DB columns
 *  when known, else sniffed from the bytes (SVG markup / PNG / JPEG). Null
 *  (unmeasurable) means the cover skips the image rather than mis-sizing it. */
function toCoverImage(
  src: string | null,
  knownWidth?: number | null,
  knownHeight?: number | null,
): PdfCoverImage | null {
  if (!src) return null;
  if (knownWidth && knownHeight) {
    return { src, width: knownWidth, height: knownHeight };
  }
  const size = dataUriImageSize(src);
  return size ? { src, ...size } : null;
}

/** `{style-number-or-name}-techpack.pdf`, sanitised for a filename. */
function exportFilename(styleNumber: string | null, name: string): string {
  const base = (styleNumber?.trim() || name)
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "product"}-techpack.pdf`;
}

/**
 * GET /products/{id}/techpack.pdf?layers=fabric,colourway,…
 *
 * The FULL tech pack as one PDF document: cover page (logo, identity,
 * description/end-use, hero image) → every canvas page in order (the proven
 * composed renderer, filtered to the selected layers) → Bill of Materials
 * page(s) (only when the Fabrics & Trim layer is selected and rows exist).
 * Page numbering runs across the whole document; the cover is page 1. Auth +
 * workspace scoping match every other data path. A product with no canvas
 * pages exports as a cover-only document.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const layersParam = parseLayersParam(
    new URL(req.url).searchParams.get("layers"),
  );
  if ("error" in layersParam) {
    return new Response(layersParam.error, { status: 400 });
  }
  const selectedKeys = layersParam.keys;
  const allowedTypes = allowedLayerTypes(selectedKeys);

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", user.profile.workspace_id)
    .single();
  if (!product) return new Response("Not found", { status: 404 });

  const [
    { data: pages },
    brandResult,
    seasonResult,
    collectionResult,
    identityResult,
    heroResult,
  ] = await Promise.all([
    supabase
      .from("canvas_pages")
      .select("*, canvas_slots(*, product_assets(*), canvas_annotations(*))")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true }),
    product.brand_id
      ? supabase
          .from("brands")
          .select("name, logo_url")
          .eq("id", product.brand_id)
          .single()
      : Promise.resolve({ data: null }),
    product.season_id
      ? supabase
          .from("seasons")
          .select("name")
          .eq("id", product.season_id)
          .single()
      : Promise.resolve({ data: null }),
    product.collection_id
      ? supabase
          .from("collections")
          .select("name")
          .eq("id", product.collection_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("product_sections")
      .select("data")
      .eq("product_id", product.id)
      .eq("section_key", "identity")
      .maybeSingle(),
    product.hero_asset_id
      ? supabase
          .from("product_assets")
          .select("file_url, width, height")
          .eq("id", product.hero_asset_id)
          .eq("product_id", product.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const allPages = (pages ?? []) as unknown as RawPdfPage[];
  const brand = brandResult.data;
  const identity =
    (identityResult.data?.data as IdentitySectionData | null) ?? null;

  // One memoised fetcher for the whole document: each unique asset URL (slot
  // images, the hero — often also a slot image — and the brand logo) is
  // fetched exactly once per request.
  const fetchImage = createImageFetcher();

  // Canvas pages, layer-filtered through the ONE shared assembly path.
  const pageSlots = await Promise.all(
    allPages.map((page) =>
      buildPdfSlots(page.canvas_slots, fetchImage, allowedTypes),
    ),
  );

  // Hero image: the chosen hero asset, else the first filled slot's image
  // (first page onward), else none (clean text-only cover).
  let heroImage: PdfCoverImage | null = heroResult.data
    ? toCoverImage(
        await fetchImage(heroResult.data.file_url),
        heroResult.data.width,
        heroResult.data.height,
      )
    : null;
  if (!heroImage) {
    for (const slots of pageSlots) {
      const withImage = slots.find((s) => s.image !== null);
      if (withImage?.image) {
        heroImage = toCoverImage(
          withImage.image,
          withImage.naturalWidth,
          withImage.naturalHeight,
        );
        if (heroImage) break;
      }
    }
  }

  const logo = toCoverImage(
    brand?.logo_url ? await fetchImage(brand.logo_url) : null,
  );

  // BOM: derived from the SAME filtered annotations the pages render — the
  // fabric layer deselected means no fabric/trim pins anywhere, so no BOM.
  const bomAnnotations = selectedKeys.has("fabric")
    ? pageSlots.flatMap((slots) => slots.flatMap((s) => s.annotations))
    : [];
  const bomRows = buildBomRows(bomAnnotations);
  const bomRowPages = paginateBom(bomRows);
  const bomColumns = visibleBomColumns(bomRows);

  // Document-wide numbering: cover is page 1, canvas pages follow, BOM last.
  const pageCount = 1 + allPages.length + bomRowPages.length;

  const styleNumber = product.style_number ?? "—";
  const brandName = brand?.name ?? "Brand";
  const seasonName = seasonResult.data?.name ?? "—";
  const designerName = product.designer_name ?? "—";
  // Versioning ships with the approval flow — same fixed label as the
  // single-page route until then.
  const versionLabel = "V1 · Draft";
  const dateLabel = new Date().toISOString().slice(0, 10);
  const shareToken =
    (product.share_token as string | undefined) ?? "preview-no-token";
  const overrides = parseLayerColours(user.workspace?.layer_colours);

  const footerAt = (pageNumber: number): PdfFooterData => ({
    brandName,
    styleNumber,
    shareToken,
    pageNumber,
    pageCount,
  });

  const cover: PdfCoverData = {
    brandName,
    logo,
    productName: product.name,
    styleNumber: product.style_number,
    collectionName: collectionResult.data?.name ?? null,
    seasonName: seasonResult.data?.name ?? null,
    statusLabel: STATUS_LABELS[product.status],
    designerName: product.designer_name,
    versionLabel,
    dateLabel,
    description: identity?.product_description ?? null,
    endUse: identity?.end_use ?? null,
    heroImage,
    footer: footerAt(1),
  };

  const pageData: PdfPageData[] = allPages.map((page, i) => ({
    styleName: product.name,
    styleNumber,
    seasonName,
    brandName,
    designerName,
    versionLabel,
    dateLabel,
    pageNumber: i + 2,
    pageCount,
    pageLabel: page.label ?? `Page ${i + 1}`,
    template: page.template,
    layerColours: overrides,
    shareToken,
    notes: page.notes,
    slots: pageSlots[i],
  }));

  const bomHeaderBase: Omit<PdfHeaderData, "pageNumber"> = {
    brandName,
    styleName: product.name,
    styleNumber,
    seasonName,
    versionLabel,
    dateLabel,
    pageCount,
    pageLabel: "Bill of Materials",
    designerName,
  };
  const bomPages: PdfBomPageData[] = bomRowPages.map((rows, i) => {
    const pageNumber = 1 + allPages.length + i + 1;
    return {
      header: { ...bomHeaderBase, pageNumber },
      footer: footerAt(pageNumber),
      rows,
      columns: bomColumns,
    };
  });

  let pdf: Buffer;
  try {
    pdf = await renderTechPackDocumentPdf({ cover, pages: pageData, bomPages });
  } catch (err) {
    console.error("[pdf] renderTechPackDocumentPdf failed:", err);
    return new Response("PDF generation failed", { status: 500 });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFilename(product.style_number, product.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
