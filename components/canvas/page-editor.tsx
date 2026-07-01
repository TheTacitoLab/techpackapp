"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";

import { AnnotationListPanel } from "@/components/canvas/annotation-list-panel";
import { TemplatePickerDialog } from "@/components/canvas/canvas-templates";
import { LayerButton } from "@/components/canvas/layer-button";
import {
  ANNOTATION_LAYERS,
  countByLayer,
  layerForType,
  type LayerKey,
} from "@/components/canvas/layers";
import { PageCanvas } from "@/components/canvas/page-canvas";
import { PageThumbnailStrip } from "@/components/canvas/page-thumbnail-strip";
import type {
  CanvasAnnotation,
  ProductAsset,
  ResolvedCanvasPage,
  ResolvedLibraryItem,
} from "@/types";

const STAGE_ZOOM_MIN = 0.5;
const STAGE_ZOOM_MAX = 4;
const STAGE_ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, z));
}

/**
 * The focused editing view for one page. Two perpendicular navigation axes:
 * layer buttons run horizontally across the top, page thumbnails run vertically
 * down the left; the annotation list panel is the third region, to the right.
 * Switching pages never changes the active layer, and vice versa. A `⛶` toggle
 * promotes the editor into a full-viewport Portal (Escape exits).
 *
 * Owns the live annotation data for every page (`localPages`, seeded from the
 * `pages` prop and updated in place by pin create/update/delete) rather than
 * leaving it to each slot — this is what lets the list panel show every page's
 * annotations for the active layer, not just the currently-open page's, and
 * lets clicking a list row jump to a pin on a different page.
 */
export function PageEditor({
  productId,
  workspaceId,
  assets,
  pages,
  pageId,
  activeLayer,
  isFullscreen,
  libraryItems,
  onLayerChange,
  onSelectPage,
  onBackToOverview,
  onToggleFullscreen,
  onExitFullscreen,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
  pageId: string;
  activeLayer: LayerKey;
  isFullscreen: boolean;
  libraryItems: ResolvedLibraryItem[];
  onLayerChange: (layer: LayerKey) => void;
  onSelectPage: (pageId: string) => void;
  onBackToOverview: () => void;
  onToggleFullscreen: () => void;
  onExitFullscreen: () => void;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stageZoom, setStageZoom] = useState(1);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);

  // Live per-page annotation state, seeded from the `pages` prop and mutated
  // directly by pin create/update/delete (no router.refresh() on those, per
  // the established fast pattern). Resynced from the prop when it legitimately
  // changes for another reason (e.g. a lock/unlock refresh), via React's
  // render-time state-adjustment pattern rather than an effect.
  const [localPages, setLocalPages] = useState(pages);
  const [syncedPages, setSyncedPages] = useState(pages);
  if (pages !== syncedPages) {
    setSyncedPages(pages);
    setLocalPages(pages);
  }

  function updateSlotAnnotations(
    slotId: string,
    updater: (prev: CanvasAnnotation[]) => CanvasAnnotation[],
  ) {
    setLocalPages((prev) =>
      prev.map((page) => ({
        ...page,
        slots: page.slots.map((slot) =>
          slot.id === slotId
            ? { ...slot, annotations: updater(slot.annotations) }
            : slot,
        ),
      })),
    );
  }

  function handleAnnotationCreated(slotId: string, annotation: CanvasAnnotation) {
    updateSlotAnnotations(slotId, (prev) => [...prev, annotation]);
  }

  function handleAnnotationUpdated(
    slotId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    updateSlotAnnotations(slotId, (prev) =>
      prev.map((a) => (a.id === id ? { ...a, data: data as CanvasAnnotation["data"] } : a)),
    );
  }

  function handleAnnotationDeleted(slotId: string, id: string) {
    updateSlotAnnotations(slotId, (prev) => prev.filter((a) => a.id !== id));
    setSelectedAnnotationId((current) => (current === id ? null : current));
  }

  // Two-way sync: selecting a row switches to its page (if different) and
  // marks it selected; AnnotationPin picks this up to highlight + scroll into
  // view once it (re)mounts. Clicking a pin on the canvas calls this too
  // (via onSelectAnnotation), so the list panel highlights back.
  function handleSelectAnnotation(id: string) {
    setSelectedAnnotationId(id);
    const owningPage = localPages.find((p) =>
      p.slots.some((s) => s.annotations.some((a) => a.id === id)),
    );
    if (owningPage && owningPage.id !== pageId) onSelectPage(owningPage.id);
  }

  // Escape exits fullscreen; the listener only lives while fullscreen is on and
  // is cleaned up on unmount / when leaving fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onExitFullscreen();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, onExitFullscreen]);

  const activePage = localPages.find((p) => p.id === pageId) ?? localPages[0] ?? null;

  // Layer-button badges show the WHOLE product's totals so the user sees global
  // progress (not just this page).
  const layerCounts = countByLayer(
    localPages.flatMap((p) =>
      p.slots.flatMap((s) => s.annotations.map((a) => a.layer_type)),
    ),
  );

  // The active layer's annotations across EVERY page, reference-code ordered —
  // what the list panel shows.
  const activeLayerAnnotations = localPages
    .flatMap((p) => p.slots.flatMap((s) => s.annotations))
    .filter((a) => layerForType(a.layer_type)?.key === activeLayer)
    .sort((a, b) =>
      a.reference_code.localeCompare(b.reference_code, undefined, {
        numeric: true,
      }),
    );

  function handleCreated(newPageId: string) {
    router.refresh();
    onSelectPage(newPageId);
  }

  const layerButtons = (
    <div className="flex flex-wrap items-center gap-2">
      {ANNOTATION_LAYERS.map((layer) => (
        <LayerButton
          key={layer.key}
          layer={layer}
          active={layer.key === activeLayer}
          count={layerCounts[layer.key]}
          onClick={() => onLayerChange(layer.key)}
        />
      ))}
    </div>
  );

  const zoomControls = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setStageZoom((z) => clampZoom(z - STAGE_ZOOM_STEP))}
        aria-label="Zoom out"
        className="border-border text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md border"
      >
        <Minus className="size-4" />
      </button>
      <span className="text-muted-foreground w-11 text-center text-xs font-medium tabular-nums">
        {Math.round(stageZoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => setStageZoom((z) => clampZoom(z + STAGE_ZOOM_STEP))}
        aria-label="Zoom in"
        className="border-border text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md border"
      >
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setStageZoom(1)}
        aria-label="Reset zoom"
        className="border-border text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md border"
      >
        <RotateCcw className="size-3.5" />
      </button>
    </div>
  );

  const backButton = (
    <button
      type="button"
      onClick={onBackToOverview}
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm font-medium"
    >
      <ArrowLeft className="size-4" />
      All Pages
    </button>
  );

  const canvas = activePage ? (
    <PageCanvas
      page={activePage}
      assets={assets}
      productId={productId}
      workspaceId={workspaceId}
      activeLayerKey={activeLayer}
      stageZoom={stageZoom}
      heightClassName={isFullscreen ? "min-h-[calc(100vh-120px)]" : "h-[500px]"}
      libraryItems={libraryItems}
      selectedAnnotationId={selectedAnnotationId}
      onAnnotationCreated={handleAnnotationCreated}
      onAnnotationUpdated={handleAnnotationUpdated}
      onAnnotationDeleted={handleAnnotationDeleted}
      onSelectAnnotation={handleSelectAnnotation}
    />
  ) : null;

  const listPanel = (
    <AnnotationListPanel
      annotations={activeLayerAnnotations}
      activeLayerKey={activeLayer}
      selectedId={selectedAnnotationId}
      onSelect={handleSelectAnnotation}
      isCollapsed={isPanelCollapsed}
      onToggleCollapse={() => setIsPanelCollapsed((v) => !v)}
    />
  );

  const picker = (
    <TemplatePickerDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      productId={productId}
      onCreated={handleCreated}
    />
  );

  // ---- Fullscreen (Portal to document.body) --------------------------------
  // Fullscreen is only ever enabled by a client-side click, so `document` is
  // guaranteed to exist here — no SSR mount guard needed.
  if (isFullscreen) {
    return createPortal(
      <div className="bg-background fixed inset-0 z-50 flex flex-col">
        <div className="border-border bg-card shadow-card flex shrink-0 items-center gap-3 border-b px-4 py-3">
          {backButton}
          {layerButtons}
          <div className="ml-auto flex items-center gap-3">
            {zoomControls}
            <button
              type="button"
              onClick={onExitFullscreen}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium"
            >
              <Minimize2 className="size-4" />
              Exit
              <kbd className="bg-muted rounded px-1 text-xs">Esc</kbd>
            </button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {activePage && (
            <PageThumbnailStrip
              pages={localPages}
              activePageId={activePage.id}
              productId={productId}
              collapsed
              onSelect={onSelectPage}
              onAddPage={() => setPickerOpen(true)}
            />
          )}
          <div className="flex-1 overflow-auto p-4">{canvas}</div>
          {listPanel}
        </div>
        {picker}
      </div>,
      document.body,
    );
  }

  // ---- Normal (in-page) ----------------------------------------------------
  return (
    <div className="bg-card shadow-card overflow-hidden rounded-xl">
      {/* Top bar — horizontal layer axis */}
      <div className="border-border flex flex-wrap items-center gap-3 border-b p-3">
        {backButton}
        {layerButtons}
        <div className="ml-auto flex items-center gap-3">
          {zoomControls}
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label="Enter fullscreen"
            className="border-border text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md border"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Body — vertical page axis + canvas + annotation list */}
      <div className="flex gap-3 p-3">
        {activePage && (
          <PageThumbnailStrip
            pages={localPages}
            activePageId={activePage.id}
            productId={productId}
            onSelect={onSelectPage}
            onAddPage={() => setPickerOpen(true)}
          />
        )}
        <div className="min-w-0 flex-1 overflow-auto">{canvas}</div>
        {listPanel}
      </div>

      {picker}
    </div>
  );
}
