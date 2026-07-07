import type { NextRequest } from "next/server";

import {
  isValidHex,
  readColourwayData,
} from "@/components/canvas/colourway-data";
import { readFabricTrimData } from "@/components/canvas/fabric-trim-data";
import {
  ANNOTATION_LAYERS,
  parseLayerColours,
  type LayerKey,
} from "@/components/canvas/layers";
import { STATUS_LABELS } from "@/components/status-pill";
import {
  createImageFetcher,
  buildPdfSlots,
  resolvePdfImage,
  type RawPdfPage,
} from "@/lib/pdf/page-data";
import type {
  PdfCoverColourway,
  PdfCoverSwatch,
} from "@/lib/pdf/palette-blocks";
import {
  buildBomRows,
  paginateBom,
  visibleBomColumns,
  type PdfBomPageData,
} from "@/lib/pdf/render-bom-page";
import {
  coverPaletteFits,
  type PdfCoverData,
  type PdfCoverFabric,
} from "@/lib/pdf/render-cover-page";
import type { PdfPalettePageData } from "@/lib/pdf/render-palette-page";
import {
  buildSpecSheetPages,
  type PdfSpecSheetPageData,
} from "@/lib/pdf/render-spec-sheet-page";
import { renderTechPackDocumentPdf } from "@/lib/pdf/render-techpack-document";
import type {
  PdfFooterData,
  PdfHeaderData,
  PdfPageData,
} from "@/lib/pdf/render-techpack-page";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CanvasAnnotation,
  CanvasColourway,
  CanvasLayerType,
  GradingProfile,
  IdentitySectionData,
  ProductSpecRow,
  ProductSpecSheet,
  ProductSpecValue,
  ResolvedSpecSheet,
} from "@/types";

const ALL_LAYER_KEYS = ANNOTATION_LAYERS.map((l) => l.key);

/** The cover's key-fabrics strip caps at this many rows — the primary
 *  materials, never an overflowing list. */
const COVER_FABRICS_MAX = 5;

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
 *  composed pipeline (pins, callout groups, BOM/cover-block inclusion)
 *  derives from. */
function allowedLayerTypes(keys: Set<LayerKey>): Set<CanvasLayerType> {
  const types = new Set<CanvasLayerType>();
  for (const layer of ANNOTATION_LAYERS) {
    if (keys.has(layer.key)) layer.types.forEach((t) => types.add(t));
  }
  return types;
}

/** Numeric-aware reference-code order (F2 before F10). */
function byReferenceCode(a: CanvasAnnotation, b: CanvasAnnotation): number {
  return a.reference_code.localeCompare(b.reference_code, undefined, {
    numeric: true,
  });
}

/**
 * The cover's key fabrics: fabric-family pins (the fabric type specifically
 * — trims are hardware, not materials), reference-code order, deduped by
 * item identity, capped. Sourced from the already-FILTERED annotations, so a
 * fabrics-deselected export carries no fabric data anywhere.
 */
function buildCoverFabrics(annotations: CanvasAnnotation[]): PdfCoverFabric[] {
  const fabrics: PdfCoverFabric[] = [];
  const seen = new Set<string>();
  for (const a of [...annotations]
    .filter((x) => x.layer_type === "fabric")
    .sort(byReferenceCode)) {
    const d = readFabricTrimData(a.data);
    const name = d.library_item_name ?? `Fabric ${a.reference_code}`;
    const detail =
      [d.composition, d.gsm !== null ? `${d.gsm} GSM` : null]
        .filter((v): v is string => !!v)
        .join(" · ") || null;
    // Item identity when the pin is library-linked (two suppliers' fabrics
    // can share a display name); display fields as the fallback key.
    const key = d.library_item_id ?? `${name}|${detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fabrics.push({ label: d.placement, name, detail });
    if (fabrics.length >= COVER_FABRICS_MAX) break;
  }
  return fabrics;
}

/**
 * The palette variants: each colourway (sequence order) with its pins'
 * swatches (reference-code order) — hex is the SAMPLED colour (validated),
 * Pantone/name are the user's entries verbatim. Pins with no colour data at
 * all are dropped (never an empty card); duplicate swatches within a variant
 * collapse; variants left with no swatches are omitted (never an empty
 * heading).
 */
function buildCoverColourways(
  colourways: CanvasColourway[],
  annotations: CanvasAnnotation[],
): PdfCoverColourway[] {
  const pins = annotations
    .filter((a) => a.layer_type === "colourway")
    .sort(byReferenceCode);
  return [...colourways]
    .sort((a, b) => a.sequence_number - b.sequence_number)
    .map((colourway): PdfCoverColourway => {
      const swatches: PdfCoverSwatch[] = [];
      const seen = new Set<string>();
      for (const pin of pins) {
        if (pin.colourway_id !== colourway.id) continue;
        const d = readColourwayData(pin.data);
        const hex = d.hex && isValidHex(d.hex) ? d.hex.toUpperCase() : null;
        if (!hex && !d.colour_name && !d.pantone) continue;
        const key = `${hex ?? ""}|${d.colour_name ?? ""}|${d.pantone ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        swatches.push({ hex, name: d.colour_name, pantone: d.pantone });
      }
      return { name: colourway.name, swatches };
    })
    .filter((c) => c.swatches.length > 0);
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
 * GET /products/{id}/techpack.pdf?layers=fabric,colourway,…&specs=0
 *
 * The FULL tech pack as one PDF document: cover page (logo, identity,
 * description/end-use, hero image, key fabrics, colour palette) → a
 * dedicated Colour Palette page when the palette outgrows the cover → every
 * canvas page in order (the proven composed renderer, filtered to the
 * selected layers) → Bill of Materials page(s) (only when the Fabrics & Trim
 * layer is selected and rows exist) → Size Specification page(s) (one titled
 * table per Spec Sheet, omitted via `?specs=0` or when there are no sheets).
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

  const url = new URL(req.url);
  const layersParam = parseLayersParam(url.searchParams.get("layers"));
  if ("error" in layersParam) {
    return new Response(layersParam.error, { status: 400 });
  }
  const selectedKeys = layersParam.keys;
  const allowedTypes = allowedLayerTypes(selectedKeys);
  // The Quick Export "Size Specifications" toggle — ticked by default, so
  // only an explicit `specs=0` omits the spec pages.
  const includeSpecs = url.searchParams.get("specs") !== "0";

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
    colourwaysResult,
    specSheetsResult,
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
    supabase
      .from("canvas_colourways")
      .select("*")
      .eq("product_id", product.id)
      .order("sequence_number", { ascending: true }),
    includeSpecs
      ? supabase
          .from("product_spec_sheets")
          .select("*, product_spec_rows(*), product_spec_values(*)")
          .eq("product_id", product.id)
          .order("created_at", { ascending: true })
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
  const filteredAnnotations = pageSlots.flatMap((slots) =>
    slots.flatMap((s) => s.annotations),
  );

  // Hero image: the chosen hero asset, else the first filled slot's image
  // (first page onward), else none (clean text-only cover).
  let heroImage = heroResult.data
    ? resolvePdfImage(
        await fetchImage(heroResult.data.file_url),
        heroResult.data.width,
        heroResult.data.height,
      )
    : null;
  if (!heroImage) {
    for (const slots of pageSlots) {
      const withImage = slots.find((s) => s.image !== null);
      if (withImage?.image) {
        heroImage = resolvePdfImage(
          withImage.image,
          withImage.naturalWidth,
          withImage.naturalHeight,
        );
        if (heroImage) break;
      }
    }
  }

  const logo = resolvePdfImage(
    brand?.logo_url ? await fetchImage(brand.logo_url) : null,
  );

  // Cover blocks — all from the FILTERED annotations, so deselected layers
  // leak nothing onto the cover either.
  const coverFabrics = selectedKeys.has("fabric")
    ? buildCoverFabrics(filteredAnnotations)
    : [];
  const coverColourways = selectedKeys.has("colourway")
    ? buildCoverColourways(colourwaysResult.data ?? [], filteredAnnotations)
    : [];
  // The palette lives on the cover while it PROVABLY fits alongside the
  // identity column's other blocks (global budget, no cram/clip); otherwise
  // it becomes the dedicated Colour Palette page straight after the cover.
  const coverContent = {
    collectionName: collectionResult.data?.name ?? null,
    seasonName: seasonResult.data?.name ?? null,
    description: identity?.product_description ?? null,
    endUse: identity?.end_use ?? null,
    fabrics: coverFabrics,
  };
  const paletteOnCover =
    coverColourways.length > 0 &&
    coverPaletteFits(coverColourways, coverContent);
  const hasPalettePage = coverColourways.length > 0 && !paletteOnCover;

  // BOM: derived from the SAME filtered annotations the pages render — the
  // fabric layer deselected means no fabric/trim pins anywhere, so no BOM.
  const bomRows = buildBomRows(
    selectedKeys.has("fabric") ? filteredAnnotations : [],
  );
  const bomRowPages = paginateBom(bomRows);
  const bomColumns = visibleBomColumns(bomRows);

  // Spec Sheets → dedicated table page(s) after the BOM. Same embed shape as
  // the product page; auto-mode columns are re-graded live inside the builder
  // through the same engine the UI uses (computed values are never persisted).
  type RawSpecSheet = ProductSpecSheet & {
    product_spec_rows: ProductSpecRow[];
    product_spec_values: ProductSpecValue[];
  };
  const specSheets: ResolvedSpecSheet[] = (
    (specSheetsResult.data ?? []) as unknown as RawSpecSheet[]
  ).map(({ product_spec_rows, product_spec_values, ...sheetRest }) => ({
    ...sheetRest,
    rows: product_spec_rows ?? [],
    values: product_spec_values ?? [],
  }));
  const profileIds = [
    ...new Set(
      specSheets
        .map((s) => s.grading_profile_id)
        .filter((pid): pid is string => pid !== null),
    ),
  ];
  const profilesById = new Map<string, GradingProfile>();
  if (profileIds.length > 0) {
    // RLS scopes this to seeded globals + the workspace's own profiles.
    const { data: profiles } = await supabase
      .from("grading_profiles")
      .select("*")
      .in("id", profileIds);
    for (const profile of (profiles ?? []) as GradingProfile[]) {
      profilesById.set(profile.id, profile);
    }
  }
  const specPageContents = buildSpecSheetPages(specSheets, profilesById);

  // Document-wide numbering: cover is page 1, the overflow palette page (if
  // any) follows it, canvas pages next, BOM, then Size Specifications last.
  const paletteOffset = hasPalettePage ? 1 : 0;
  const pageCount =
    1 +
    paletteOffset +
    allPages.length +
    bomRowPages.length +
    specPageContents.length;

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
  const headerAt = (pageNumber: number, pageLabel: string): PdfHeaderData => ({
    brandName,
    logo,
    styleName: product.name,
    styleNumber,
    seasonName,
    versionLabel,
    dateLabel,
    pageNumber,
    pageCount,
    pageLabel,
    designerName,
  });

  const cover: PdfCoverData = {
    brandName,
    logo,
    productName: product.name,
    styleNumber: product.style_number,
    ...coverContent,
    statusLabel: STATUS_LABELS[product.status],
    designerName: product.designer_name,
    versionLabel,
    dateLabel,
    heroImage,
    colourways: paletteOnCover ? coverColourways : [],
    footer: footerAt(1),
  };

  const palettePage: PdfPalettePageData | null = hasPalettePage
    ? {
        header: headerAt(2, "Colour Palette"),
        footer: footerAt(2),
        colourways: coverColourways,
      }
    : null;

  const pageData: PdfPageData[] = allPages.map((page, i) => ({
    styleName: product.name,
    styleNumber,
    seasonName,
    brandName,
    logo,
    designerName,
    versionLabel,
    dateLabel,
    pageNumber: 1 + paletteOffset + i + 1,
    pageCount,
    pageLabel: page.label ?? `Page ${i + 1}`,
    template: page.template,
    layerColours: overrides,
    shareToken,
    notes: page.notes,
    slots: pageSlots[i],
  }));

  const bomPages: PdfBomPageData[] = bomRowPages.map((rows, i) => {
    const pageNumber = 1 + paletteOffset + allPages.length + i + 1;
    return {
      header: headerAt(pageNumber, "Bill of Materials"),
      footer: footerAt(pageNumber),
      rows,
      columns: bomColumns,
    };
  });

  const specPages: PdfSpecSheetPageData[] = specPageContents.map(
    (content, i) => {
      const pageNumber =
        1 + paletteOffset + allPages.length + bomRowPages.length + i + 1;
      return {
        header: headerAt(pageNumber, "Size Specifications"),
        footer: footerAt(pageNumber),
        content,
      };
    },
  );

  let pdf: Buffer;
  try {
    pdf = await renderTechPackDocumentPdf({
      cover,
      palettePage,
      pages: pageData,
      bomPages,
      specPages,
    });
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
