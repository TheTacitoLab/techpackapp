import { notFound } from "next/navigation";
import Link from "next/link";
import { History } from "lucide-react";

import { BomTable } from "@/components/bom/bom-table";
import { AssetUploadSection } from "@/components/canvas/asset-upload-section";
import { isFabricFamilyType } from "@/components/canvas/fabric-trim-data";
import { TechnicalDetailsSection } from "@/components/canvas/technical-details-section";
import { ChangeLogSection } from "@/components/change-log-section";
import { CollapsibleSection } from "@/components/collapsible-section";
import { IdentitySection } from "@/components/identity-section";
import { PinToggle } from "@/components/pin-toggle";
import { ProductHeaderMenu } from "@/components/product-header-menu";
import { ProductLabels } from "@/components/product-labels";
import { ProductStatusControl } from "@/components/product-status-control";
import { ProductVersionControl } from "@/components/product-version-control";
import { QuickExportDialog } from "@/components/quick-export-dialog";
import { SectionCompleteToggle } from "@/components/section-complete-toggle";
import { SectionIcon } from "@/components/section-icon";
import { SizeSpecificationsSection } from "@/components/spec/size-specifications-section";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CHANGE_LOG_FETCH_LIMIT } from "@/lib/change-log";
import { getWorkspaceLibrary } from "@/lib/library";
import { productVersionLabel } from "@/lib/product-version";
import {
  COMPLETABLE_SECTION_KEYS,
  type CompletableSectionKey,
} from "@/lib/section-status";
import { getGradingProfiles, getSpecTemplates } from "@/lib/spec-library";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CanvasAnnotation,
  CanvasColourway,
  CanvasPage,
  CanvasSlot,
  Collection,
  IdentitySectionData,
  Label,
  PartnerOption,
  ProductAsset,
  ProductChangeLogEntry,
  ProductSpecRow,
  ProductSpecSheet,
  ProductSpecValue,
  ResolvedCanvasPage,
  ResolvedSection,
  ResolvedSlot,
  ResolvedSpecSheet,
  Season,
  SectionStatus,
  WorkspaceColour,
} from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id)
    .single();

  if (!product) notFound();

  const [
    { data: sections },
    { data: templates },
    brandResult,
    collectionResult,
    { data: workspaceLabels },
    { data: assignedRows },
    { data: workspaceSeasons },
    { data: workspaceCollections },
    libraryItems,
    specSheetResult,
    specTemplates,
    gradingProfiles,
    { data: changeLogRows },
  ] = await Promise.all([
    supabase
      .from("product_sections")
      .select("*")
      .eq("product_id", product.id)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
    supabase.from("section_templates").select("*"),
    product.brand_id
      ? supabase
          .from("brands")
          .select("id, name")
          .eq("id", product.brand_id)
          .single()
      : Promise.resolve({ data: null }),
    product.collection_id
      ? supabase
          .from("collections")
          .select("id, name")
          .eq("id", product.collection_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("labels")
      .select("*")
      .eq("workspace_id", ctx.profile.workspace_id)
      .order("name"),
    supabase
      .from("product_labels")
      .select("label_id")
      .eq("product_id", product.id),
    supabase
      .from("seasons")
      .select("*")
      .eq("workspace_id", ctx.profile.workspace_id)
      .order("year", { ascending: false })
      .order("name"),
    supabase
      .from("collections")
      .select("*")
      .eq("workspace_id", ctx.profile.workspace_id)
      .order("name"),
    // Fabrics & Trim pin editor's library picker — fetched here (not per
    // category) so the picker can filter Fabric/Trim/Fastener/Elastic
    // client-side without four separate round-trips.
    getWorkspaceLibrary(),
    // Size Specifications: the product's LIST of Spec Sheets (0037 — Youth,
    // Men's and Women's can coexist), each with rows + stored values embedded
    // (in auto mode that's just the sample column(s)), plus the two spec
    // libraries for the template picker and profile picker.
    supabase
      .from("product_spec_sheets")
      .select("*, product_spec_rows(*), product_spec_values(*)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true }),
    getSpecTemplates(),
    getGradingProfiles(),
    // Change Log: the newest entries, grouped by version in the section
    // body. Capped — the section notes when the cap is hit.
    supabase
      .from("product_change_log")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(CHANGE_LOG_FETCH_LIMIT),
  ]);

  // Canvas data (Phase 4b): the product's image assets and its pages with slots
  // (each slot's chosen asset + annotation pins nested) resolved for the UI,
  // plus its named colourways (the Colourways layer groups pins by these).
  const [
    assetsResult,
    pagesResult,
    colourwaysResult,
    workspaceColoursResult,
    supplierPartnersResult,
  ] = await Promise.all([
    supabase
      .from("product_assets")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("canvas_pages")
      .select(
        `
        *,
        canvas_slots (
          *,
          product_assets (*),
          canvas_annotations (*)
        )
      `,
      )
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("canvas_colourways")
      .select("*")
      .eq("product_id", product.id)
      .order("sequence_number", { ascending: true }),
    // The workspace colour library — the pin editors' "From library" picker,
    // threaded down the same chain as libraryItems.
    supabase
      .from("workspace_colours")
      .select("*")
      .eq("workspace_id", ctx.profile.workspace_id)
      .order("sort_order")
      .order("created_at"),
    // Partner directory (suppliers + factories only) for the Fabrics & Trim
    // pin editor's supplier picker — provided to the editor via context.
    supabase
      .from("partners")
      .select("id, name, type")
      .eq("workspace_id", ctx.profile.workspace_id)
      .in("type", ["supplier", "factory"])
      .order("name"),
  ]);

  const assets: ProductAsset[] = assetsResult.data ?? [];
  const colourways: CanvasColourway[] = colourwaysResult.data ?? [];
  const workspaceColours: WorkspaceColour[] = workspaceColoursResult.data ?? [];
  const supplierPartners: PartnerOption[] = supplierPartnersResult.data ?? [];

  // The nested embed shape (slots carry their asset + annotations); mapped into
  // the flat ResolvedCanvasPage the canvas UI expects. The generated types don't
  // model these embeds, so we describe the raw rows explicitly here.
  type RawSlot = CanvasSlot & {
    product_assets: ProductAsset | null;
    canvas_annotations: CanvasAnnotation[];
  };
  type RawPage = CanvasPage & { canvas_slots: RawSlot[] };

  const resolvedPages: ResolvedCanvasPage[] = (
    (pagesResult.data ?? []) as unknown as RawPage[]
  ).map((page) => {
    const { canvas_slots, ...pageRest } = page;
    const slots: ResolvedSlot[] = (canvas_slots ?? []).map((slot) => {
      const { product_assets, canvas_annotations, ...slotRest } = slot;
      return {
        ...slotRest,
        asset: product_assets ?? null,
        annotations: canvas_annotations ?? [],
      };
    });
    return { ...pageRest, slots };
  });

  // Bill of Materials: every Fabrics & Trim annotation across the whole
  // product, derived from `resolvedPages` — already fetched scoped to
  // `product.id` (itself already confirmed in-workspace above) and further
  // guarded by RLS on canvas_pages/canvas_slots/canvas_annotations, so this
  // reuses an already-verified-safe data source rather than a new query.
  const bomAnnotations: CanvasAnnotation[] = resolvedPages
    .flatMap((p) => p.slots.flatMap((s) => s.annotations))
    .filter((a) => isFabricFamilyType(a.layer_type));

  // The Spec Sheet embeds (rows + values) — like the canvas embeds above, the
  // generated types don't model them, so the raw rows are described explicitly.
  type RawSpecSheet = ProductSpecSheet & {
    product_spec_rows: ProductSpecRow[];
    product_spec_values: ProductSpecValue[];
  };
  const specSheets: ResolvedSpecSheet[] = (
    (specSheetResult.data ?? []) as unknown as RawSpecSheet[]
  ).map(({ product_spec_rows, product_spec_values, ...sheetRest }) => ({
    ...sheetRest,
    rows: [...(product_spec_rows ?? [])].sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    ),
    values: product_spec_values ?? [],
  }));

  const brand = brandResult.data;
  const collection = collectionResult.data;
  const changeLogEntries: ProductChangeLogEntry[] = changeLogRows ?? [];
  const labels: Label[] = workspaceLabels ?? [];
  const assignedIds = (assignedRows ?? []).map((r) => r.label_id);
  const seasons: Season[] = workspaceSeasons ?? [];
  const collections: Collection[] = workspaceCollections ?? [];

  // The identity section's saved JSON, pulled from the sections already loaded.
  const identitySectionData =
    ((sections ?? []).find((s) => s.section_key === "identity")
      ?.data as IdentitySectionData | null) ?? null;

  const templateByKey = new Map((templates ?? []).map((t) => [t.key, t]));
  const resolved: ResolvedSection[] = (sections ?? [])
    .map((section) => {
      const tmpl = templateByKey.get(section.section_key);
      return {
        ...section,
        label: tmpl?.label ?? section.section_key,
        icon: tmpl?.icon ?? "Component",
      };
    })
    // Deterministic order. Some products (created before migration 0016 renamed
    // `canvas`→`technical_details`) carry a stale sort_order tie between
    // `assets` and `technical_details` (both 20), which left the section order
    // non-deterministic when ordering by sort_order alone. Break ties by the
    // template's default_sort_order (the intended order: assets 20 before
    // technical_details 30), then by key — so the sections never swap. Migration
    // 0030 also realigns the stored sort_order at the data source.
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      const ad = templateByKey.get(a.section_key)?.default_sort_order ?? 0;
      const bd = templateByKey.get(b.section_key)?.default_sort_order ?? 0;
      if (ad !== bd) return ad - bd;
      return a.section_key.localeCompare(b.section_key);
    });
  const statuses: SectionStatus[] = resolved.map((s) => s.status);

  // Per-section body renderer. Identity, Asset Upload and Technical Details are
  // live; the remaining sections render a placeholder until their own phase.
  // `product` is captured as a const alias so its non-null narrowing (from the
  // notFound guard above) survives inside this nested function's closure.
  const activeProduct = product;
  function renderSectionBody(sectionKey: string) {
    switch (sectionKey) {
      case "identity":
        return (
          <IdentitySection
            product={activeProduct}
            sectionData={identitySectionData}
            seasons={seasons}
            collections={collections}
            brandName={brand?.name ?? null}
          />
        );
      case "assets":
        return (
          <AssetUploadSection
            productId={activeProduct.id}
            workspaceId={activeProduct.workspace_id}
            assets={assets}
            pages={resolvedPages}
            heroAssetId={activeProduct.hero_asset_id}
          />
        );
      case "technical_details":
        return (
          <TechnicalDetailsSection
            productId={activeProduct.id}
            workspaceId={activeProduct.workspace_id}
            assets={assets}
            pages={resolvedPages}
            colourways={colourways}
            libraryItems={libraryItems}
            workspaceColours={workspaceColours}
            supplierPartners={supplierPartners}
          />
        );
      case "bom":
        return <BomTable annotations={bomAnnotations} />;
      case "grading":
        return (
          <SizeSpecificationsSection
            productId={activeProduct.id}
            sheets={specSheets}
            templates={specTemplates}
            profiles={gradingProfiles}
          />
        );
      case "documents":
      default:
        return (
          <p className="text-muted-foreground py-2 text-sm">
            This section is coming in a later phase.
          </p>
        );
    }
  }

  // Header progress readout — same numbers ProgressTracker derives, but the
  // compact one-row header needs its own presentation (short fixed bar +
  // a label that condenses to "1/6" if the row ever gets tight).
  const completedCount = statuses.filter((s) => s === "complete").length;
  const progressPercentage =
    statuses.length === 0
      ? 0
      : Math.round((completedCount / statuses.length) * 100);

  return (
    <div className="flex flex-col">
      {/* Sticky workspace header — ONE compact row in three zones divided by
          hairlines: breadcrumb (left) · progress (centre) · labels + status
          (right). Stays pinned (z-20) while the sections scroll under it; the
          Technical Details summary strip sticks directly below at top-12
          (= this header's h-12), so the two stack instead of colliding. */}
      <div className="bg-background border-border sticky top-0 z-20 -mx-6 -mt-6 border-b">
        <div className="@container flex h-12 items-center gap-4 px-6">
          {/* Left zone: breadcrumb */}
          <nav className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[13px] whitespace-nowrap">
            {product.is_template ? (
              <Link
                href="/settings?tab=templates"
                className="hover:text-foreground shrink-0 transition-colors"
              >
                Templates
              </Link>
            ) : (
              <Link
                href="/products"
                className="hover:text-foreground shrink-0 transition-colors"
              >
                Products
              </Link>
            )}
            {brand && (
              <>
                <span className="shrink-0">/</span>
                <span className="shrink-0">{brand.name}</span>
              </>
            )}
            {collection && (
              <>
                <span className="shrink-0">/</span>
                <Link
                  href="/products"
                  className="hover:text-foreground shrink-0 transition-colors"
                >
                  {collection.name}
                </Link>
              </>
            )}
            <span className="shrink-0">/</span>
            <span className="text-foreground truncate font-medium">
              {product.name}
            </span>
            <span className="text-muted-foreground shrink-0">
              {product.style_number
                ? `· ${product.style_number}`
                : "· No style #"}
            </span>
            {/* Template-ness must be unmissable while editing — a template
                opens in this same editor and must never be mistaken for a
                live product. */}
            {product.is_template && (
              <Badge className="bg-primary text-primary-foreground ml-1 shrink-0 text-[10px] tracking-wide">
                TEMPLATE
              </Badge>
            )}
          </nav>

          <span aria-hidden className="bg-border h-5 w-px shrink-0" />

          {/* Centre zone: progress. The bar condenses below @3xl (48rem of
              header width) so the row degrades gracefully instead of
              overflowing. */}
          <div className="flex shrink-0 items-center gap-3">
            <Progress value={progressPercentage} className="w-24 @3xl:w-40" />
            <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
              <span className="hidden @3xl:inline">
                {completedCount} of {statuses.length} sections complete
              </span>
              <span className="@3xl:hidden">
                {completedCount}/{statuses.length}
              </span>
            </span>
          </div>

          <span aria-hidden className="bg-border h-5 w-px shrink-0" />

          {/* Right zone: pin + version + export + labels + status */}
          <div className="flex shrink-0 items-center gap-3">
            <PinToggle type="product" id={product.id} />
            <ProductVersionControl
              productId={product.id}
              versionMajor={product.version_major}
              versionMinor={product.version_minor}
            />
            <QuickExportDialog productId={product.id} />
            <ProductLabels
              productId={product.id}
              labels={labels}
              assignedIds={assignedIds}
            />
            <ProductStatusControl
              productId={product.id}
              currentStatus={product.status}
            />
            {!product.is_template && (
              <ProductHeaderMenu
                productId={product.id}
                productName={product.name}
              />
            )}
          </div>
        </div>
      </div>

      {/* Tech-pack sections — given the maximum remaining vertical space */}
      <div className="-mx-6 space-y-3 px-6 py-4">
        {resolved.map((section, index) => (
          <CollapsibleSection
            key={section.id}
            sectionKey={section.section_key}
            title={section.label}
            icon={<SectionIcon name={section.icon} />}
            status={section.status}
            action={
              (COMPLETABLE_SECTION_KEYS as readonly string[]).includes(
                section.section_key,
              ) ? (
                <SectionCompleteToggle
                  productId={activeProduct.id}
                  sectionKey={section.section_key as CompletableSectionKey}
                  status={section.status}
                  completedManually={section.completed_manually}
                />
              ) : undefined
            }
            defaultOpen={index === 0}
          >
            {renderSectionBody(section.section_key)}
          </CollapsibleSection>
        ))}

        {/* Change Log — a record, not a task: always present, deliberately
            NOT a product_sections row so it never counts in any "X of N
            sections complete" denominator (header, product cards, launchpad),
            and never offers a completion toggle. */}
        <CollapsibleSection
          sectionKey="change_log"
          title="Change Log"
          icon={<History />}
          status={null}
        >
          <ChangeLogSection
            entries={changeLogEntries}
            currentVersion={productVersionLabel(
              product.version_major,
              product.version_minor,
            )}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}
