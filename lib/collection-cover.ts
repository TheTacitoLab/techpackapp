/**
 * Derived collection-card covers (no uploads in V1): a mosaic of up to 4
 * product images from the collection — hero assets first, then each
 * product's first-uploaded asset, then any remaining assets — including
 * products in sub-collections for a parent's cover. Pure and
 * dependency-free so it runs under Node type-stripping for tests.
 */

export const COVER_IMAGE_COUNT = 4;

export type CoverAsset = {
  id: string;
  product_id: string;
  file_url: string;
};

/**
 * Pick the mosaic image URLs for one collection card.
 *
 * `productIds` are the products in the collection (and its subs) in display
 * order; `assets` must be pre-sorted oldest-first (upload order). Heroes win
 * the first slots, then one first-asset per product (spreading the mosaic
 * across products), then remaining assets fill up to the cap.
 */
export function coverImageUrls(input: {
  productIds: readonly string[];
  heroAssetIdByProduct: ReadonlyMap<string, string | null>;
  assets: readonly CoverAsset[];
}): string[] {
  const { productIds, heroAssetIdByProduct, assets } = input;
  const products = new Set(productIds);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const assetsByProduct = new Map<string, CoverAsset[]>();
  for (const asset of assets) {
    if (!products.has(asset.product_id)) continue;
    const list = assetsByProduct.get(asset.product_id);
    if (list) list.push(asset);
    else assetsByProduct.set(asset.product_id, [asset]);
  }

  const used = new Set<string>();
  const urls: string[] = [];
  const take = (asset: CoverAsset | undefined) => {
    if (!asset || used.has(asset.id) || urls.length >= COVER_IMAGE_COUNT) return;
    used.add(asset.id);
    urls.push(asset.file_url);
  };

  // 1. Hero assets, in product order.
  for (const productId of productIds) {
    const heroId = heroAssetIdByProduct.get(productId);
    if (heroId) take(assetById.get(heroId));
  }
  // 2. One first-uploaded asset per product, spreading across products.
  for (const productId of productIds) {
    take(assetsByProduct.get(productId)?.find((a) => !used.has(a.id)));
  }
  // 3. Remaining assets in product order, oldest first.
  for (const productId of productIds) {
    for (const asset of assetsByProduct.get(productId) ?? []) {
      take(asset);
    }
  }
  return urls;
}
