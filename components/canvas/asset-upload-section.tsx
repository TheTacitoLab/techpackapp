"use client";

// Asset Upload section body: the product's image library lives here now (it was
// previously rendered inside the canvas). Images uploaded here are the pool that
// Technical Details annotates. This section is not exported to the PDF.

import { useMemo } from "react";

import { AssetLibrary } from "@/components/canvas/asset-library";
import type { ProductAsset, ResolvedCanvasPage } from "@/types";

export function AssetUploadSection({
  productId,
  workspaceId,
  assets,
  pages,
  heroAssetId,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
  /** The product's chosen hero asset (PDF cover image), if any. */
  heroAssetId: string | null;
}) {
  // Which asset ids are placed in at least one slot across all pages — drives
  // the "in use" badge and the delete-confirm warning in the library.
  const usedAssetIds = useMemo(
    () =>
      new Set(
        pages.flatMap((p) =>
          p.slots
            .map((s) => s.asset_id)
            .filter((id): id is string => id !== null),
        ),
      ),
    [pages],
  );

  return (
    <div className="space-y-3">
      <AssetLibrary
        productId={productId}
        workspaceId={workspaceId}
        assets={assets}
        usedAssetIds={usedAssetIds}
        heroAssetId={heroAssetId}
      />
      <p className="text-muted-foreground text-xs">
        Images uploaded here are available for annotation in Technical Details.
        This section is not included in the exported PDF.
      </p>
    </div>
  );
}
