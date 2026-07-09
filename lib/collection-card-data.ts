/**
 * Server-side assembly of everything a collection card shows — roll-up
 * counts, progress and the derived cover mosaic. Shared by the /collections
 * dashboard (top-level cards) and the collection detail page (sub-collection
 * cards) so the two surfaces can never disagree on the numbers.
 */

import { coverImageUrls, type CoverAsset } from "./collection-cover";
import {
  collectionWithChildIds,
  type CollectionRef,
} from "./collection-hierarchy";
import type { SectionStatus } from "@/types";

export type CardLabel = { id: string; name: string; color: string };

/** product_id → its section statuses, the shape every progress bar consumes. */
export function groupSectionStatuses(
  rows: readonly { product_id: string; status: SectionStatus }[],
): Map<string, SectionStatus[]> {
  const map = new Map<string, SectionStatus[]>();
  for (const row of rows) {
    const arr = map.get(row.product_id);
    if (arr) arr.push(row.status);
    else map.set(row.product_id, [row.status]);
  }
  return map;
}

/** collection_id → resolved card labels (unknown label ids are skipped). */
export function groupLabelsByCollection(
  rows: readonly { collection_id: string; label_id: string }[],
  labelById: ReadonlyMap<string, { id: string; name: string; color: string }>,
): Map<string, CardLabel[]> {
  const map = new Map<string, CardLabel[]>();
  for (const row of rows) {
    const label = labelById.get(row.label_id);
    if (!label) continue;
    const entry = { id: label.id, name: label.name, color: label.color };
    const arr = map.get(row.collection_id);
    if (arr) arr.push(entry);
    else map.set(row.collection_id, [entry]);
  }
  return map;
}

export type CollectionForCards = CollectionRef & {
  name: string;
  brand_id: string;
};

export type ProductForCards = {
  id: string;
  collection_id: string | null;
  hero_asset_id: string | null;
};

export type BuiltCollectionCard = {
  id: string;
  name: string;
  brandName: string | null;
  labels: CardLabel[];
  subCount: number;
  productCount: number;
  sectionStatuses: SectionStatus[];
  coverUrls: string[];
};

export function buildCollectionCardData(input: {
  collection: CollectionForCards;
  /** All workspace collections (for child lookup). */
  collections: readonly CollectionForCards[];
  /** Live, non-template products of the workspace. */
  products: readonly ProductForCards[];
  sectionStatusesByProduct: ReadonlyMap<string, SectionStatus[]>;
  /** Workspace product assets, oldest-first. */
  assets: readonly CoverAsset[];
  brandNameById: ReadonlyMap<string, string>;
  labelsByCollection: ReadonlyMap<string, CardLabel[]>;
}): BuiltCollectionCard {
  const {
    collection,
    collections,
    products,
    sectionStatusesByProduct,
    assets,
    brandNameById,
    labelsByCollection,
  } = input;

  // A parent's card covers its own products AND its subs' (decision 5/6);
  // a sub-collection has no children, so this is just itself.
  const ids = new Set(collectionWithChildIds(collections, collection.id));
  const counted = products.filter(
    (p) => p.collection_id !== null && ids.has(p.collection_id),
  );

  return {
    id: collection.id,
    name: collection.name,
    brandName: brandNameById.get(collection.brand_id) ?? null,
    labels: labelsByCollection.get(collection.id) ?? [],
    subCount: ids.size - 1,
    productCount: counted.length,
    sectionStatuses: counted.flatMap(
      (p) => sectionStatusesByProduct.get(p.id) ?? [],
    ),
    coverUrls: coverImageUrls({
      productIds: counted.map((p) => p.id),
      heroAssetIdByProduct: new Map(
        counted.map((p) => [p.id, p.hero_asset_id]),
      ),
      assets,
    }),
  };
}
