"use client";

// Phase 4b: renders the Asset Library panel.
// Phase 4c (next session) adds the page strip and slot grids below it.

import { useMemo } from "react";

import { AssetLibrary } from "@/components/canvas/asset-library";
import type { ProductAsset, ResolvedCanvasPage } from "@/types";

export function CanvasSection({
  productId,
  workspaceId,
  assets,
  pages,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
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
    <div className="space-y-4">
      <AssetLibrary
        productId={productId}
        workspaceId={workspaceId}
        assets={assets}
        usedAssetIds={usedAssetIds}
      />
      {/* Canvas pages go here in Phase 4c */}
      <div className="text-muted-foreground p-4 text-center text-sm">
        Canvas pages coming in next session.
      </div>
    </div>
  );
}
