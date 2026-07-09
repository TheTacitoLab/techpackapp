"use client";

// Technical Details — the annotation workspace. Orchestrates two modes:
//   • overview → the launchpad (orientation: what have I built)
//   • edit     → the fullscreen Page Editor for one page (two perpendicular
//                nav axes: horizontal layer buttons, vertical page
//                thumbnails). Opening a page goes STRAIGHT to fullscreen;
//                leaving fullscreen returns here — there is no intermediate
//                inline editor.
//
// This component owns only the navigation state (mode, active layer); all
// rendering of pages/slots/pins lives in the child components, and the slot
// rendering itself (page-canvas.tsx) stays isolated for the upcoming Konva swap.

import { useState } from "react";

import { PageEditor } from "@/components/canvas/page-editor";
import { PageOverview } from "@/components/canvas/page-overview";
import { SupplierPartnersProvider } from "@/components/canvas/supplier-partners-context";
import type { LayerKey } from "@/components/canvas/layers";
import type {
  CanvasColourway,
  PartnerOption,
  ProductAsset,
  ResolvedCanvasPage,
  ResolvedLibraryItem,
  WorkspaceColour,
} from "@/types";

type Mode = { view: "overview" } | { view: "edit"; pageId: string };

export function TechnicalDetailsSection({
  productId,
  workspaceId,
  assets,
  pages,
  colourways,
  libraryItems,
  workspaceColours,
  supplierPartners,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
  colourways: CanvasColourway[];
  libraryItems: ResolvedLibraryItem[];
  workspaceColours: WorkspaceColour[];
  supplierPartners: PartnerOption[];
}) {
  const [mode, setMode] = useState<Mode>({ view: "overview" });
  // Default to Fabrics & Trim — the most-used layer, and the one that builds the BOM.
  const [activeLayer, setActiveLayer] = useState<LayerKey>("fabric");
  // The read-only All-layers composite preview — mutually exclusive with a
  // single active layer (selecting any real layer exits it).
  const [viewAllLayers, setViewAllLayers] = useState(false);

  // Optimistic colourway list, owned here (above the overview/edit switch) so a
  // colourway created while editing survives a bounce to the overview and back.
  // Resynced from the server prop via the render-time adjustment pattern.
  const [localColourways, setLocalColourways] = useState(colourways);
  const [syncedColourways, setSyncedColourways] = useState(colourways);
  if (colourways !== syncedColourways) {
    setSyncedColourways(colourways);
    setLocalColourways(colourways);
  }
  // Which colourway the next colour pin defaults to (the last one placed into or
  // created). Session-local; falls back to most-recent when unset.
  const [lastUsedColourwayId, setLastUsedColourwayId] = useState<string | null>(
    null,
  );

  // Optimistic workspace colour library, same lifecycle as the colourways
  // above: a colour saved from a pin ("Save to library") merges here so every
  // other pin form sees it immediately; the server prop resyncs on refresh.
  const [localWorkspaceColours, setLocalWorkspaceColours] =
    useState(workspaceColours);
  const [syncedWorkspaceColours, setSyncedWorkspaceColours] =
    useState(workspaceColours);
  if (workspaceColours !== syncedWorkspaceColours) {
    setSyncedWorkspaceColours(workspaceColours);
    setLocalWorkspaceColours(workspaceColours);
  }

  function handleColourwayCreated(colourway: CanvasColourway) {
    setLocalColourways((prev) =>
      prev.some((c) => c.id === colourway.id) ? prev : [...prev, colourway],
    );
    setLastUsedColourwayId(colourway.id);
  }

  function handleWorkspaceColourSaved(colour: WorkspaceColour) {
    setLocalWorkspaceColours((prev) =>
      prev.some((c) => c.id === colour.id) ? prev : [...prev, colour],
    );
  }

  function handleColourwayRenamed(id: string, name: string) {
    setLocalColourways((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
  }

  function openPage(pageId: string) {
    setMode({ view: "edit", pageId });
  }

  function backToOverview() {
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
    <SupplierPartnersProvider partners={supplierPartners}>
      <PageEditor
        productId={productId}
        workspaceId={workspaceId}
        assets={assets}
        pages={pages}
        pageId={mode.pageId}
        activeLayer={activeLayer}
        viewAllLayers={viewAllLayers}
        libraryItems={libraryItems}
        colourLibrary={{
          colours: localWorkspaceColours,
          onSaved: handleWorkspaceColourSaved,
        }}
        colourways={localColourways}
        lastUsedColourwayId={lastUsedColourwayId}
        onColourwayCreated={handleColourwayCreated}
        onColourwayUsed={setLastUsedColourwayId}
        onColourwayRenamed={handleColourwayRenamed}
        onLayerChange={(layer) => {
          // Selecting a real layer exits the All-layers composite.
          setActiveLayer(layer);
          setViewAllLayers(false);
        }}
        onViewAllLayers={() => setViewAllLayers(true)}
        onSelectPage={(pageId) => setMode({ view: "edit", pageId })}
        onBackToOverview={backToOverview}
      />
    </SupplierPartnersProvider>
  );
}
