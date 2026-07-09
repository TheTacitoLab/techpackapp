"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, PackagePlus, Plus, Trash2 } from "lucide-react";

import { CollectionCard, type CollectionCardData } from "@/components/collection-card";
import { CollectionLabels } from "@/components/collection-labels";
import { CreateProductDialog } from "@/components/create-product-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  CreateCollectionDialog,
  DeleteCollectionButton,
  EditCollectionDialog,
} from "@/components/hierarchy-dialogs";
import { PinToggle } from "@/components/pin-toggle";
import { ProductCard } from "@/components/product-card";
import { ProgressTracker } from "@/components/progress-tracker";
import { ToggleRow } from "@/components/toggle-row";
import { Button } from "@/components/ui/button";
import { groupSectionStatuses } from "@/lib/collection-card-data";
import type { TemplateSummary } from "@/lib/templates";
import type {
  Brand,
  Collection,
  Label,
  Product,
  Season,
  SectionStatus,
} from "@/types";

type SectionSummary = { product_id: string; status: SectionStatus };
type ProductLabelLink = { product_id: string; label_id: string };
type CardLabel = { id: string; name: string; color: string };

/**
 * A collection's home: header (labels, roll-up progress, pin, edit/delete),
 * a card row of sub-collections, and the grid of products directly in this
 * collection — with an "Include sub-collections" toggle when subs exist.
 */
export function CollectionDetailClient({
  collection,
  parent,
  subCards,
  brandName,
  brands,
  seasons,
  collections,
  labels,
  assignedLabelIds,
  products,
  sections,
  productLabels,
  templates = [],
}: {
  collection: Collection;
  parent: Collection | null;
  subCards: CollectionCardData[];
  brandName: string | null;
  brands: Brand[];
  seasons: Season[];
  /** All workspace collections (edit dialog + child detection). */
  collections: Collection[];
  labels: Label[];
  assignedLabelIds: string[];
  /** Live products of this collection AND its subs. */
  products: Product[];
  sections: SectionSummary[];
  productLabels: ProductLabelLink[];
  templates?: TemplateSummary[];
}) {
  const [includeSubs, setIncludeSubs] = useState(false);
  const hasSubs = subCards.length > 0;

  const sectionStatusMap = useMemo(
    () => groupSectionStatuses(sections),
    [sections],
  );

  const labelById = useMemo(
    () => new Map(labels.map((l) => [l.id, l])),
    [labels],
  );

  const brandById = useMemo(
    () => new Map(brands.map((b) => [b.id, b.name])),
    [brands],
  );

  const labelsByProduct = useMemo(() => {
    const map = new Map<string, CardLabel[]>();
    for (const pl of productLabels) {
      const label = labelById.get(pl.label_id);
      if (!label) continue;
      const arr = map.get(pl.product_id) ?? [];
      arr.push({ id: label.id, name: label.name, color: label.color });
      map.set(pl.product_id, arr);
    }
    return map;
  }, [productLabels, labelById]);

  const directProducts = useMemo(
    () => products.filter((p) => p.collection_id === collection.id),
    [products, collection.id],
  );
  const shownProducts = includeSubs && hasSubs ? products : directProducts;

  // Roll-up progress: sections complete across all products incl. subs.
  const rollupStatuses = useMemo(
    () => products.flatMap((p) => sectionStatusMap.get(p.id) ?? []),
    [products, sectionStatusMap],
  );
  const newProductDialog = (
    <CreateProductDialog
      collections={collections}
      brands={brands}
      templates={templates}
      defaultCollectionId={collection.id}
    />
  );

  return (
    <div className="space-y-8">
      {/* Breadcrumb — sub-collections link back through their parent. */}
      <nav className="text-muted-foreground flex items-center gap-1 text-sm">
        <Link
          href="/collections"
          className="hover:text-foreground transition-colors"
        >
          Collections
        </Link>
        {parent && (
          <>
            <ChevronRight className="size-3.5" />
            <Link
              href={`/collections/${parent.id}`}
              className="hover:text-foreground transition-colors"
            >
              {parent.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{collection.name}</span>
      </nav>

      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {collection.name}
              </h1>
              {brandName && (
                <span className="bg-primary/10 text-primary rounded-sm px-2 py-0.5 text-xs font-medium">
                  {brandName}
                </span>
              )}
            </div>
            <CollectionLabels
              collectionId={collection.id}
              labels={labels}
              assignedIds={assignedLabelIds}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PinToggle type="collection" id={collection.id} />
            <EditCollectionDialog
              collection={collection}
              collections={collections}
              brands={brands}
              trigger={
                <Button variant="outline" size="icon" className="size-8">
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <DeleteCollectionButton
              id={collection.id}
              name={collection.name}
              redirectTo={parent ? `/collections/${parent.id}` : "/collections"}
              trigger={
                <Button variant="outline" size="icon" className="size-8">
                  <Trash2 className="text-destructive size-4" />
                </Button>
              }
            />
            {!collection.parent_id && (
              <CreateCollectionDialog
                brands={brands}
                seasons={seasons}
                collections={collections}
                defaultParentId={collection.id}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="size-3.5" />
                    New Sub-collection
                  </Button>
                }
              />
            )}
            {newProductDialog}
          </div>
        </div>

        {/* Roll-up progress across this collection and its subs. */}
        <ProgressTracker statuses={rollupStatuses} />
      </div>

      {/* Sub-collections */}
      {hasSubs && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Sub-collections
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subCards.map((sub) => (
              <CollectionCard key={sub.id} collection={sub} size="sm" />
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Products</h2>
          {hasSubs && (
            <ToggleRow
              checked={includeSubs}
              label="Include sub-collections"
              onToggle={() => setIncludeSubs((v) => !v)}
              className="w-auto"
            />
          )}
        </div>

        {shownProducts.length === 0 ? (
          <EmptyState
            icon={PackagePlus}
            title="No products here yet"
            description={
              hasSubs && !includeSubs
                ? "Nothing lives directly in this collection. Include sub-collections above, or add a product."
                : "Add the first product to this collection."
            }
            action={newProductDialog}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shownProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                brandName={
                  product.brand_id
                    ? (brandById.get(product.brand_id) ?? null)
                    : null
                }
                sectionStatuses={sectionStatusMap.get(product.id) ?? []}
                labels={labelsByProduct.get(product.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
