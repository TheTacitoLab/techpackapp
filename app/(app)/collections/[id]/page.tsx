import { notFound } from "next/navigation";

import { CollectionDetailClient } from "@/components/collection-detail-client";
import {
  buildCollectionCardData,
  groupLabelsByCollection,
  groupSectionStatuses,
} from "@/lib/collection-card-data";
import { collectionWithChildIds } from "@/lib/collection-hierarchy";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getGarspecTemplateSummaries } from "@/lib/spec-library";
import { getTemplateSummaries } from "@/lib/templates";
import type { Collection, Product, SectionStatus } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CollectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const { data: collection } = await supabase
    .from("collections")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", wsId)
    .maybeSingle();
  if (!collection) notFound();

  const [
    { data: brands },
    { data: seasons },
    { data: collections },
    { data: labels },
    templates,
    specTemplates,
  ] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase
      .from("seasons")
      .select("*")
      .eq("workspace_id", wsId)
      .order("year", { ascending: false }),
    supabase
      .from("collections")
      .select("*")
      .eq("workspace_id", wsId)
      .order("name"),
    supabase.from("labels").select("*").eq("workspace_id", wsId).order("name"),
    getTemplateSummaries(supabase, wsId),
    getGarspecTemplateSummaries(),
  ]);

  const allCollections: Collection[] = collections ?? [];
  const parent = collection.parent_id
    ? (allCollections.find((c) => c.id === collection.parent_id) ?? null)
    : null;
  const children = allCollections.filter((c) => c.parent_id === collection.id);

  // Live products of this collection and its subs — the grid's toggle picks
  // between direct-only and the full set client-side. Everything after this
  // (labels, sections, cover assets) is scoped to this family, not the
  // whole workspace.
  const familyIds = collectionWithChildIds(allCollections, collection.id);
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", wsId)
    .eq("is_template", false)
    .is("archived_at", null)
    .in("collection_id", familyIds)
    .order("created_at", { ascending: false });

  const familyProducts: Product[] = products ?? [];
  const productIds = familyProducts.map((p) => p.id);

  const [
    sectionsResult,
    productLabelsResult,
    assetsResult,
    { data: collectionLabels },
  ] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("product_sections")
          .select("product_id, status")
          .in("product_id", productIds)
          .eq("is_enabled", true)
      : Promise.resolve({
          data: [] as { product_id: string; status: SectionStatus }[],
        }),
    productIds.length > 0
      ? supabase
          .from("product_labels")
          .select("product_id, label_id")
          .in("product_id", productIds)
      : Promise.resolve({
          data: [] as { product_id: string; label_id: string }[],
        }),
    // Oldest-first: the sub-collection cover mosaics prefer first uploads.
    productIds.length > 0
      ? supabase
          .from("product_assets")
          .select("id, product_id, file_url")
          .in("product_id", productIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as { id: string; product_id: string; file_url: string }[],
        }),
    supabase
      .from("collection_labels")
      .select("collection_id, label_id")
      .in("collection_id", familyIds),
  ]);

  const sections = sectionsResult.data ?? [];
  const productLabels = productLabelsResult.data ?? [];
  const assets = assetsResult.data ?? [];

  const sectionStatusesByProduct = groupSectionStatuses(sections);
  const brandNameById = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const labelById = new Map((labels ?? []).map((l) => [l.id, l]));
  const labelsByCollection = groupLabelsByCollection(
    collectionLabels ?? [],
    labelById,
  );

  const subCards = children.map((child) =>
    buildCollectionCardData({
      collection: child,
      collections: allCollections,
      products: familyProducts,
      sectionStatusesByProduct,
      assets,
      brandNameById,
      labelsByCollection,
    }),
  );

  return (
    <CollectionDetailClient
      collection={collection}
      parent={parent}
      subCards={subCards}
      brandName={brandNameById.get(collection.brand_id) ?? null}
      brands={brands ?? []}
      seasons={seasons ?? []}
      collections={allCollections}
      labels={labels ?? []}
      assignedLabelIds={(labelsByCollection.get(collection.id) ?? []).map(
        (l) => l.id,
      )}
      products={familyProducts}
      sections={sections}
      productLabels={productLabels}
      templates={templates}
      specTemplates={specTemplates}
    />
  );
}
