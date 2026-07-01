"use client";

// Technical Details section body.
//
// Stage 1 (this file): a thin wrapper that renders the EXISTING canvas UI
// (`CanvasPages`) unchanged under the new `technical_details` section key. The
// Asset Library no longer lives here — it moved to the Asset Upload section.
//
// Stage 2 rebuilds this into the full Overview/Edit navigation + layer buttons
// + fullscreen. Do not build that here.

import { CanvasPages } from "@/components/canvas/canvas-pages";
import type { ProductAsset, ResolvedCanvasPage } from "@/types";

export function TechnicalDetailsSection({
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
  return (
    <CanvasPages
      productId={productId}
      workspaceId={workspaceId}
      assets={assets}
      pages={pages}
    />
  );
}
