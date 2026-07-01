"use client";

// Technical Details — the annotation workspace. Orchestrates two modes:
//   • overview → the Page Overview grid (orientation: what have I built)
//   • edit     → the Page Editor for one page (two perpendicular nav axes:
//                horizontal layer buttons, vertical page thumbnails), with an
//                optional fullscreen Portal.
//
// This component owns only the navigation state (mode, active layer, fullscreen);
// all rendering of pages/slots/pins lives in the child components, and the slot
// rendering itself (page-canvas.tsx) stays isolated for the upcoming Konva swap.

import { useState } from "react";

import { PageEditor } from "@/components/canvas/page-editor";
import { PageOverview } from "@/components/canvas/page-overview";
import type { LayerKey } from "@/components/canvas/layers";
import type {
  ProductAsset,
  ResolvedCanvasPage,
  ResolvedLibraryItem,
} from "@/types";

type Mode = { view: "overview" } | { view: "edit"; pageId: string };

export function TechnicalDetailsSection({
  productId,
  workspaceId,
  assets,
  pages,
  libraryItems,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
  libraryItems: ResolvedLibraryItem[];
}) {
  const [mode, setMode] = useState<Mode>({ view: "overview" });
  // Default to Fabrics & Trim — the most-used layer, and the one that builds the BOM.
  const [activeLayer, setActiveLayer] = useState<LayerKey>("fabric");
  const [isFullscreen, setIsFullscreen] = useState(false);

  function openPage(pageId: string) {
    setMode({ view: "edit", pageId });
  }

  function backToOverview() {
    setIsFullscreen(false);
    setMode({ view: "overview" });
  }

  if (mode.view === "overview") {
    return (
      <PageOverview
        productId={productId}
        workspaceId={workspaceId}
        assets={assets}
        pages={pages}
        onOpenPage={openPage}
      />
    );
  }

  return (
    <PageEditor
      productId={productId}
      workspaceId={workspaceId}
      assets={assets}
      pages={pages}
      pageId={mode.pageId}
      activeLayer={activeLayer}
      isFullscreen={isFullscreen}
      libraryItems={libraryItems}
      onLayerChange={setActiveLayer}
      onSelectPage={(pageId) => setMode({ view: "edit", pageId })}
      onBackToOverview={backToOverview}
      onToggleFullscreen={() => setIsFullscreen((v) => !v)}
      onExitFullscreen={() => setIsFullscreen(false)}
    />
  );
}
