"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Eye,
  HelpCircle,
  Layers3,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

import { AnnotationListPanel } from "@/components/canvas/annotation-list-panel";
import { CanvasHelpDialog } from "@/components/canvas/canvas-help-dialog";
import { TemplatePickerDialog } from "@/components/canvas/canvas-templates";
import {
  EditorToolbar,
  type EditorToolbarGroup,
} from "@/components/canvas/editor-toolbar";
import { PagePreviewDialog } from "@/components/canvas/page-preview-dialog";
import { LayerButton } from "@/components/canvas/layer-button";
import {
  ANNOTATION_LAYERS,
  countByLayer,
  layerForType,
  type LayerKey,
} from "@/components/canvas/layers";
import type { WorkspaceColourLibrary } from "@/components/canvas/colour-library-picker";
import { PageCanvas } from "@/components/canvas/page-canvas";
import { PageNotesEditor } from "@/components/canvas/page-notes-editor";
import { PageThumbnailStrip } from "@/components/canvas/page-thumbnail-strip";
import { LayerColoursEditor } from "@/components/settings/layer-colours-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { duplicateCanvasPage } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import {
  ANNOTATION_CAP_AMBER_FROM,
  MAX_ANNOTATIONS_PER_PAGE,
  PAGE_ANNOTATION_LIMIT_MESSAGE,
  type CanvasAnnotation,
  type CanvasColourway,
  type ColourwayGroup,
  type ProductAsset,
  type ResolvedCanvasPage,
  type ResolvedLibraryItem,
} from "@/types";

const STAGE_ZOOM_MIN = 0.5;
const STAGE_ZOOM_MAX = 4;
const STAGE_ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, z));
}

/**
 * The focused editing view for one page — always fullscreen (a full-viewport
 * Portal). The launchpad opens straight into it; leaving it (back button,
 * exit action, or an unclaimed Escape) returns to the launchpad. There is no
 * intermediate inline editor any more.
 *
 * Two perpendicular navigation axes: compact layer buttons run horizontally
 * across the top, page thumbnails run vertically down the left; the
 * annotation list panel is the third region, to the right. Switching pages
 * never changes the active layer, and vice versa. The header's right side is
 * the config-driven `EditorToolbar` (grouped icon buttons + ⋯ overflow).
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
  viewAllLayers,
  libraryItems,
  colourLibrary,
  colourways,
  lastUsedColourwayId,
  onColourwayCreated,
  onColourwayUsed,
  onColourwayRenamed,
  onLayerChange,
  onViewAllLayers,
  onSelectPage,
  onBackToOverview,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
  pageId: string;
  activeLayer: LayerKey;
  /** The read-only All-layers composite is active (no single layer selected). */
  viewAllLayers: boolean;
  libraryItems: ResolvedLibraryItem[];
  colourLibrary: WorkspaceColourLibrary;
  colourways: CanvasColourway[];
  lastUsedColourwayId: string | null;
  onColourwayCreated: (colourway: CanvasColourway) => void;
  onColourwayUsed: (colourwayId: string) => void;
  onColourwayRenamed: (id: string, name: string) => void;
  onLayerChange: (layer: LayerKey) => void;
  onViewAllLayers: () => void;
  onSelectPage: (pageId: string) => void;
  onBackToOverview: () => void;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stageZoom, setStageZoom] = useState(1);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [markerColoursOpen, setMarkerColoursOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  // Tip drag → new anchor; badge drag → new label offset. Both patch the live
  // annotation in place (same optimistic, no-refresh path as create/update).
  // Measurement lines pass their end coordinates too; point pins never do, so
  // `end_x`/`end_y` stay untouched for them.
  function handleAnnotationMoved(
    slotId: string,
    id: string,
    x: number,
    y: number,
    endX?: number | null,
    endY?: number | null,
  ) {
    updateSlotAnnotations(slotId, (prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              x,
              y,
              ...(endX !== undefined && endY !== undefined
                ? { end_x: endX, end_y: endY }
                : {}),
            }
          : a,
      ),
    );
  }

  function handleAnnotationLabelOffset(
    slotId: string,
    id: string,
    offsetX: number | null,
    offsetY: number | null,
  ) {
    updateSlotAnnotations(slotId, (prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, label_offset_x: offsetX, label_offset_y: offsetY }
          : a,
      ),
    );
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

  // An UNCLAIMED Escape leaves the editor for the launchpad. Radix layers
  // (dialogs, popovers, dropdowns — and open tooltips) call preventDefault on
  // the Escape they consume — as do the page-name editor's cancel, the notes
  // field, and the canvas's pick-mode/measure-draft cancels — so closing one
  // never also exits the editor. Known quirk, accepted as standard layering:
  // an OPEN tooltip is itself a layer, so Escape while hovering a toolbar
  // icon closes the tooltip first and a second press exits.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onBackToOverview();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackToOverview]);

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

  // Colourways render grouped: build one section per colourway (sequence order),
  // each holding its own pins (reference-code order). Built here — where the
  // annotations already live — never inside the panel, keeping the grouping
  // specific to this layer rather than a generic system.
  const colourwayGroups: ColourwayGroup[] | undefined =
    activeLayer === "colourway"
      ? [...colourways]
          .sort((a, b) => a.sequence_number - b.sequence_number)
          .map((colourway) => ({
            colourway,
            annotations: activeLayerAnnotations.filter(
              (a) => a.colourway_id === colourway.id,
            ),
          }))
      : undefined;

  // Total annotations on the ACTIVE page (all layers, all pin types) — drives
  // the per-page cap counter and gates placement client-side.
  const pageAnnotationCount = activePage
    ? activePage.slots.reduce((n, s) => n + s.annotations.length, 0)
    : 0;
  const atAnnotationCap = pageAnnotationCount >= MAX_ANNOTATIONS_PER_PAGE;

  function handleCreated(newPageId: string) {
    router.refresh();
    onSelectPage(newPageId);
  }

  function handleDuplicatePage(sourcePageId: string) {
    void duplicateCanvasPage(sourcePageId)
      .then(({ id }) => {
        router.refresh();
        onSelectPage(id);
      })
      .catch(() => toast.error("Could not duplicate the page."));
  }

  // Placement blocked by the cap: a friendly toast that offers Duplicate right
  // there (the recommended next step), plus the shared authoritative message.
  function handleCapBlocked() {
    if (!activePage) return;
    toast.error(PAGE_ANNOTATION_LIMIT_MESSAGE, {
      action: {
        label: "Duplicate page",
        onClick: () => handleDuplicatePage(activePage.id),
      },
    });
  }

  // Layer selector — compact enough for one line at typical fullscreen
  // widths. The wrapper is a @container: below 54rem of layer-bar width the
  // labels condense away (icon + count remain, `title` carries the name).
  // The 54rem reveal threshold deliberately clears the labelled row's real
  // width (~50rem, growing with multi-digit badges) so there is no band
  // where labels render but overflow into a header scrollbar. flex-[7] vs
  // the toolbar's flex-[3]: the two flexible regions split free space 70/30,
  // which keeps labels visible from ~1440px up while the toolbar holds every
  // action inline down to ~1280px.
  const layerButtons = (
    <div className="@container min-w-0 flex-[7]">
      <div className="flex items-center gap-1 overflow-x-auto">
        {/* All-layers composite — read-only preview of the whole PDF page.
            Visually distinct from the five real layers (outline, stacked icon). */}
        <button
          type="button"
          onClick={onViewAllLayers}
          aria-pressed={viewAllLayers}
          title="Preview every layer at once, exactly what the PDF page will show"
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-dashed px-2 text-xs transition-colors",
            viewAllLayers
              ? "border-foreground/40 text-foreground bg-muted font-semibold"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Layers3 className="size-3.5 shrink-0" />
          <span className="hidden whitespace-nowrap @[54rem]:inline">
            All layers
          </span>
        </button>
        {ANNOTATION_LAYERS.map((layer) => (
          <LayerButton
            key={layer.key}
            layer={layer}
            active={!viewAllLayers && layer.key === activeLayer}
            count={layerCounts[layer.key]}
            onClick={() => onLayerChange(layer.key)}
          />
        ))}
      </div>
    </div>
  );

  // Per-page annotation counter — neutral up to 9, amber 10–11, red at 12.
  const annotationCounter = (
    <span
      title={`Annotations on this page (max ${MAX_ANNOTATIONS_PER_PAGE})`}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
        atAnnotationCap
          ? "bg-destructive/10 text-destructive"
          : pageAnnotationCount >= ANNOTATION_CAP_AMBER_FROM
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      {pageAnnotationCount}/{MAX_ANNOTATIONS_PER_PAGE}
    </span>
  );

  // The right-side actions, config-driven: adding a button later is a new
  // entry here; whatever stops fitting moves into the toolbar's ⋯ menu.
  const toolbarGroups: EditorToolbarGroup[] = [
    {
      key: "view",
      items: [
        {
          kind: "action",
          key: "zoom-out",
          icon: Minus,
          label: "Zoom out",
          onSelect: () => setStageZoom((z) => clampZoom(z - STAGE_ZOOM_STEP)),
        },
        {
          kind: "readout",
          key: "zoom-level",
          label: "Zoom level",
          text: `${Math.round(stageZoom * 100)}%`,
        },
        {
          kind: "action",
          key: "zoom-in",
          icon: Plus,
          label: "Zoom in",
          onSelect: () => setStageZoom((z) => clampZoom(z + STAGE_ZOOM_STEP)),
        },
        {
          kind: "action",
          key: "zoom-reset",
          icon: RotateCcw,
          label: "Reset zoom",
          onSelect: () => setStageZoom(1),
        },
      ],
    },
    {
      key: "output",
      items: [
        {
          kind: "action",
          key: "preview",
          icon: Eye,
          label: "Preview the exact PDF page",
          onSelect: () => setPreviewOpen(true),
          disabled: !activePage,
        },
        // The spike per-page "Export page PDF" button is retired — the
        // product header's Quick Export builds the full document now; this
        // preview stays as the per-page WYSIWYG check.
        {
          kind: "action",
          key: "marker-colours",
          icon: Settings,
          label: "Marker colours",
          onSelect: () => setMarkerColoursOpen(true),
        },
        {
          kind: "action",
          key: "help",
          icon: HelpCircle,
          label: "How pages work",
          onSelect: () => setHelpOpen(true),
        },
      ],
    },
    {
      key: "session",
      pinned: true,
      items: [
        {
          kind: "action",
          key: "exit-fullscreen",
          icon: Minimize2,
          label: "Exit fullscreen",
          shortcut: "Esc",
          onSelect: onBackToOverview,
        },
      ],
    },
  ];

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

  const markerColoursDialog = (
    <Dialog open={markerColoursOpen} onOpenChange={setMarkerColoursOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marker Colours</DialogTitle>
        </DialogHeader>
        <LayerColoursEditor />
      </DialogContent>
    </Dialog>
  );

  const previewDialog = activePage ? (
    <PagePreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      productId={productId}
      pageId={activePage.id}
    />
  ) : null;

  const canvas = activePage ? (
    <PageCanvas
      page={activePage}
      assets={assets}
      productId={productId}
      workspaceId={workspaceId}
      activeLayerKey={activeLayer}
      allLayers={viewAllLayers}
      atAnnotationCap={atAnnotationCap}
      onAnnotationCapBlocked={handleCapBlocked}
      stageZoom={stageZoom}
      heightClassName="min-h-[calc(100vh-120px)]"
      libraryItems={libraryItems}
      colourLibrary={colourLibrary}
      colourwayContext={{
        colourways,
        lastUsedColourwayId,
        onColourwayCreated,
        onColourwayUsed,
      }}
      selectedAnnotationId={selectedAnnotationId}
      onAnnotationCreated={handleAnnotationCreated}
      onAnnotationUpdated={handleAnnotationUpdated}
      onAnnotationMoved={handleAnnotationMoved}
      onAnnotationLabelOffset={handleAnnotationLabelOffset}
      onAnnotationDeleted={handleAnnotationDeleted}
      onSelectAnnotation={handleSelectAnnotation}
    />
  ) : null;

  // Saved notes patch localPages directly (the annotations' optimistic
  // pattern) so a page switch sees current text instead of the last server
  // round-trip's.
  function handleNotesSaved(notesPageId: string, value: string) {
    const trimmed = value.trim();
    setLocalPages((prev) =>
      prev.map((page) =>
        page.id === notesPageId
          ? { ...page, notes: trimmed.length > 0 ? trimmed : null }
          : page,
      ),
    );
  }

  // Below the canvas — mirroring the PDF, where the PAGE NOTES box sits
  // beneath the slots. Keyed by page id so switching pages resets the draft
  // to that page's saved notes.
  const pageNotes = activePage ? (
    <PageNotesEditor
      key={activePage.id}
      pageId={activePage.id}
      notes={activePage.notes}
      onSaved={(value) => handleNotesSaved(activePage.id, value)}
    />
  ) : null;

  const listPanel = (
    <AnnotationListPanel
      annotations={activeLayerAnnotations}
      colourwayGroups={colourwayGroups}
      onRenameColourway={onColourwayRenamed}
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

  // Fullscreen Portal to document.body — the editor's only form. Mounting is
  // always the result of a client-side click, so `document` exists.
  return createPortal(
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="border-border bg-card shadow-card flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        {backButton}
        {layerButtons}
        {annotationCounter}
        <EditorToolbar groups={toolbarGroups} className="flex-[3]" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {activePage && (
          <PageThumbnailStrip
            pages={localPages}
            activePageId={activePage.id}
            productId={productId}
            onSelect={onSelectPage}
            onAddPage={() => setPickerOpen(true)}
          />
        )}
        <div className="flex-1 overflow-auto p-4">
          {canvas}
          <div className="mt-3">{pageNotes}</div>
        </div>
        {listPanel}
      </div>
      {picker}
      {markerColoursDialog}
      {previewDialog}
      <CanvasHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>,
    document.body,
  );
}
