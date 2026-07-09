import { notFound } from "next/navigation";

import { CollectionDetailClient } from "@/components/collection-detail-client";
import {
  buildCollectionCardData,
  type CardLabel,
} from "@/lib/collection-card-data";
import { collectionWithChildIds } from "@/lib/collection-hierarchy";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
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
    { data: assignedRows },
    { data: collectionLabels },
    { data: assets },
    templates,
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
    supabase
      .from("collection_labels")
      .select("label_id")
      .eq("collection_id", collection.id),
    supabase.from("collection_labels").select("collection_id, label_id"),
    // Oldest-first: the sub-collection cover mosaics prefer first uploads.
    supabase
      .from("product_assets")
      .select("id, product_id, file_url")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true }),
    getTemplateSummaries(supabase, wsId),
  ]);

  const allCollections: Collection[] = collections ?? [];
  const parent = collection.parent_id
    ? (allCollections.find((c) => c.id === collection.parent_id) ?? null)
    : null;
  const children = allCollections.filter((c) => c.parent_id === collection.id);

  // Live products of this collection and its subs — the grid's toggle picks
  // between direct-only and the full set client-side.
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

  const [{ data: sections }, { data: productLabels }] =
    productIds.length > 0
      ? await Promise.all([
          supabase
            .from("product_sections")
            .select("product_id, status")
            .in("product_id", productIds)
            .eq("is_enabled", true),
          supabase
            .from("product_labels")
            .select("product_id, label_id")
            .in("product_id", productIds),
        ])
      : [
          { data: [] as { product_id: string; status: SectionStatus }[] },
          { data: [] as { product_id: string; label_id: string }[] },
        ];

  const sectionStatusesByProduct = new Map<string, SectionStatus[]>();
  for (const s of sections ?? []) {
    const arr = sectionStatusesByProduct.get(s.product_id) ?? [];
    arr.push(s.status);
    sectionStatusesByProduct.set(s.product_id, arr);
  }

  const brandNameById = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const labelById = new Map((labels ?? []).map((l) => [l.id, l]));
  const labelsByCollection = new Map<string, CardLabel[]>();
  for (const cl of collectionLabels ?? []) {
    const label = labelById.get(cl.label_id);
    if (!label) continue;
    const arr = labelsByCollection.get(cl.collection_id) ?? [];
    arr.push({ id: label.id, name: label.name, color: label.color });
    labelsByCollection.set(cl.collection_id, arr);
  }

  const subCards = children.map((child) =>
    buildCollectionCardData({
      collection: child,
      collections: allCollections,
      products: familyProducts,
      sectionStatusesByProduct,
      assets: assets ?? [],
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
      assignedLabelIds={(assignedRows ?? []).map((r) => r.label_id)}
      products={familyProducts}
      sections={sections ?? []}
      productLabels={productLabels ?? []}
      templates={templates}
    />
  );
}
