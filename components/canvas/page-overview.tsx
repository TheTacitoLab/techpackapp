"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crop, Eye, LayoutGrid, Lock, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { TemplatePickerDialog } from "@/components/canvas/canvas-templates";
import { useLayerColours } from "@/components/canvas/layer-colours-context";
import { ANNOTATION_LAYERS, countByLayer } from "@/components/canvas/layers";
import { PageCompositeThumbnail } from "@/components/canvas/page-composite-thumbnail";
import { PageNameEditor } from "@/components/canvas/page-name-editor";
import { PagePreviewDialog } from "@/components/canvas/page-preview-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteCanvasPage,
  duplicateCanvasPage,
  reorderCanvasPages,
} from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import {
  ANNOTATION_CAP_AMBER_FROM,
  MAX_ANNOTATIONS_PER_PAGE,
  type ProductAsset,
  type ResolvedCanvasPage,
} from "@/types";

/**
 * A page the PDF preview is worth opening for: at least one slot that is both
 * locked AND still holds its asset. `is_locked` alone is not enough — deleting
 * an asset nulls `asset_id` but leaves the lock flag, and previewing such a
 * page would export an empty frame.
 */
function pageHasExportableSlot(page: ResolvedCanvasPage): boolean {
  return page.slots.some((s) => s.is_locked && s.asset !== null);
}

/**
 * The Technical Details launchpad — the section's at-rest view. See-and-enter
 * only: a summary strip (totals, layer coverage, Preview PDF), a grid of page
 * cards (static composite preview with pins, editable name, per-layer count
 * dots, fill indicator, lock badge, hover actions), and Add Page. All editing
 * lives in the focused editor a card click opens; no editing surface renders
 * here.
 */
export function PageOverview({
  productId,
  assets,
  pages,
  onOpenPage,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  pages: ResolvedCanvasPage[];
  onOpenPage: (pageId: string) => void;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Like `preview` below: `page` sticks through close so the confirm copy
  // (annotation count) stays stable during the dialog's exit animation.
  const [deleteState, setDeleteState] = useState<{
    open: boolean;
    page: ResolvedCanvasPage | null;
  }>({ open: false, page: null });
  // The PDF preview dialog target. `pageId` sticks through close so the
  // dialog can play its exit animation instead of unmounting mid-close.
  const [preview, setPreview] = useState<{ open: boolean; pageId: string | null }>(
    { open: false, pageId: null },
  );
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startReorder] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function handleCreated(pageId: string) {
    // Straight into Edit mode for the new page (the refresh brings its data).
    router.refresh();
    onOpenPage(pageId);
  }

  function handleDuplicate(pageId: string) {
    // One duplicate at a time — a double-click must not create two copies.
    if (duplicatingId) return;
    setDuplicatingId(pageId);
    void duplicateCanvasPage(pageId)
      .then(({ id }) => {
        router.refresh();
        onOpenPage(id);
      })
      .catch(() => toast.error("Could not duplicate the page."))
      .finally(() => setDuplicatingId(null));
  }

  function confirmDelete() {
    const target = deleteState.page;
    if (!target || !deleteState.open) return;
    startDelete(async () => {
      try {
        await deleteCanvasPage(target.id);
        // Close only if the dialog still shows THIS page — Escape during the
        // in-flight delete followed by opening the confirm for another page
        // must not be dismissed by this completion.
        setDeleteState((current) =>
          current.page?.id === target.id
            ? { ...current, open: false }
            : current,
        );
        router.refresh();
      } catch {
        toast.error("Could not delete the page.");
      }
    });
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ids = pages.map((p) => p.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    setDraggingId(null);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    startReorder(async () => {
      try {
        await reorderCanvasPages(productId, ids);
        router.refresh();
      } catch {
        toast.error("Could not reorder pages.");
      }
    });
  }

  function openPreview(pageId: string) {
    setPreview({ open: true, pageId });
  }

  // The first page genuinely worth exporting — preview defaults to it, the
  // same way the PDF route defaults to the first locked page.
  const firstExportablePageId =
    pages.find(pageHasExportableSlot)?.id ?? null;

  const deleteCount = deleteState.page
    ? deleteState.page.slots.reduce((n, s) => n + s.annotations.length, 0)
    : 0;

  return (
    <div className="bg-card shadow-card rounded-xl p-4">
      {pages.length === 0 ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="border-border hover:border-brand hover:bg-brand-muted/20 flex w-full flex-col items-center gap-4 rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors"
          >
            <span className="bg-brand-muted text-foreground flex size-14 items-center justify-center rounded-full">
              <LayoutGrid className="size-7" />
            </span>
            <span className="space-y-1">
              <span className="block text-lg font-semibold">
                Add your first page
              </span>
              <span className="text-muted-foreground block max-w-md text-sm">
                Upload your design and start pinning, colours, fabrics,
                measurements, construction and branding, right on the garment.
              </span>
            </span>
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium">
              <Plus className="size-4" />
              Add page
            </span>
          </button>
          {assets.length === 0 && (
            <p className="text-muted-foreground text-center text-xs">
              Tip: upload your garment images in the Asset Upload section first,
              you&apos;ll place them onto pages here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* The canvas toolbar sticks DIRECTLY BELOW the product header while
              the page grid scrolls: top-12 = the header's h-12, z-10 < the
              header's z-20, so the two stack — never overlap. Negative
              margins stretch it over the card's p-4 so cards sliding
              underneath are fully covered by its opaque card background; it
              stays inside this card's box, so it scrolls away with the
              section once the section's bottom passes it. */}
          <div className="bg-card border-border/70 sticky top-12 z-10 -mx-4 -mt-4 rounded-t-xl border-b px-4 pt-4 pb-3">
            <SummaryStrip
              pages={pages}
              canPreview={firstExportablePageId !== null}
              onPreviewPdf={() =>
                firstExportablePageId && openPreview(firstExportablePageId)
              }
            />
          </div>
          {/* Fixed 3 columns: the app shell floors the layout at 1280px, so a
              responsive breakpoint below that can never genuinely fire. */}
          <div className="grid grid-cols-3 gap-4">
            {pages.map((page, index) => (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                dragging={draggingId === page.id}
                onOpen={() => onOpenPage(page.id)}
                onPreview={
                  pageHasExportableSlot(page)
                    ? () => openPreview(page.id)
                    : undefined
                }
                onDelete={() => setDeleteState({ open: true, page })}
                onDuplicate={() => handleDuplicate(page.id)}
                onDragStart={() => setDraggingId(page.id)}
                onDragEnd={() => setDraggingId(null)}
                onDrop={() => handleDrop(page.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
            >
              <Plus className="size-8" />
              <span className="text-sm font-medium">Add Page</span>
            </button>
          </div>
        </div>
      )}

      <TemplatePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        productId={productId}
        onCreated={handleCreated}
      />

      {preview.pageId && (
        <PagePreviewDialog
          open={preview.open}
          onOpenChange={(open) => setPreview((p) => ({ ...p, open }))}
          productId={productId}
          pageId={preview.pageId}
        />
      )}

      <AlertDialog
        open={deleteState.open}
        onOpenChange={(open) =>
          !open && setDeleteState((p) => ({ ...p, open: false }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCount > 0
                ? `Any annotations on it will be removed (${deleteCount} on this page). This cannot be undone.`
                : "Any annotations on it will be removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete page"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Summary strip ------------------------------------------------------------

/**
 * Totals, layer coverage and the Preview PDF entry. Coverage is informational
 * only — which layers have pins anywhere on the product vs none — NOT the
 * formal section-completion status (a separate, future feature).
 */
function SummaryStrip({
  pages,
  canPreview,
  onPreviewPdf,
}: {
  pages: ResolvedCanvasPage[];
  canPreview: boolean;
  onPreviewPdf: () => void;
}) {
  const { colourFor } = useLayerColours();
  const layerTypes = pages.flatMap((p) =>
    p.slots.flatMap((s) => s.annotations.map((a) => a.layer_type)),
  );
  const counts = countByLayer(layerTypes);
  const total = layerTypes.length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="text-muted-foreground text-sm whitespace-nowrap">
        <span className="text-foreground font-semibold tabular-nums">
          {total}
        </span>{" "}
        annotation{total === 1 ? "" : "s"}
        <span className="mx-1.5">·</span>
        <span className="text-foreground font-semibold tabular-nums">
          {pages.length}
        </span>{" "}
        page{pages.length === 1 ? "" : "s"}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {ANNOTATION_LAYERS.map((layer) => {
          const count = counts[layer.key];
          const covered = count > 0;
          const colour = colourFor(layer.key);
          return (
            <span
              key={layer.key}
              title={
                covered
                  ? `${layer.label}: ${count} pin${count === 1 ? "" : "s"}`
                  : `${layer.label}: no pins yet`
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                covered
                  ? "text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
              style={
                covered
                  ? {
                      // The layer's marker colour at low alpha — lit vs greyed.
                      borderColor: `${colour}66`,
                      backgroundColor: `${colour}14`,
                    }
                  : undefined
              }
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  !covered && "bg-muted-foreground/40",
                )}
                style={covered ? { backgroundColor: colour } : undefined}
              />
              {layer.label}
            </span>
          );
        })}
      </div>

      {/* Title lives on the wrapper: the Button's disabled:pointer-events-none
          would otherwise kill the tooltip in exactly the state it explains. */}
      <span
        className="ml-auto"
        title={
          canPreview
            ? "Preview the exact PDF export of the first annotation-ready page"
            : "Lock a page's framing to preview its PDF"
        }
      >
        <Button size="sm" disabled={!canPreview} onClick={onPreviewPdf}>
          <Eye className="size-4" />
          Preview PDF
        </Button>
      </span>
    </div>
  );
}

// ---- Page card ------------------------------------------------------------------

function PageCard({
  page,
  index,
  dragging,
  onOpen,
  onPreview,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  page: ResolvedCanvasPage;
  index: number;
  dragging: boolean;
  onOpen: () => void;
  /** Absent when the page has no locked slot (nothing to export yet). */
  onPreview?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const counts = countByLayer(
    page.slots.flatMap((s) => s.annotations.map((a) => a.layer_type)),
  );
  const activeLayers = ANNOTATION_LAYERS.filter((l) => counts[l.key] > 0);
  // Live workspace colours so the overview dots match the pins they count.
  const { colourFor } = useLayerColours();

  const annotationCount = page.slots.reduce(
    (n, s) => n + s.annotations.length,
    0,
  );
  // Existing slot lock state, summarised per page: any filled-but-unlocked
  // slot means the page is still being framed; all filled slots locked means
  // it's annotation-ready.
  const filledSlots = page.slots.filter((s) => s.asset !== null);
  const isFraming = filledSlots.some((s) => !s.is_locked);
  const isLocked = filledSlots.length > 0 && !isFraming;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${page.label ?? `Page ${index + 1}`}`}
      draggable
      onDragStart={(e) => {
        // Firefox refuses to begin an HTML5 drag unless dragstart sets data.
        e.dataTransfer.setData("text/plain", page.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only when the CARD itself is focused — Enter inside the rename
        // input (which bubbles) must not open the page.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group bg-card shadow-card hover:ring-brand/40 focus-visible:ring-brand/40 relative cursor-pointer rounded-xl p-3 transition-shadow outline-none hover:ring-2 focus-visible:ring-2",
        dragging && "opacity-50",
      )}
    >
      {/* Static composite preview — real imagery, real pins, shared geometry */}
      <div className="relative">
        <PageCompositeThumbnail page={page} className="h-[150px] rounded-lg" />
        {(isFraming || isLocked) && (
          <span
            className={cn(
              "bg-background/85 absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm",
              isFraming
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {isFraming ? (
              <Crop className="size-3" />
            ) : (
              <Lock className="size-3" />
            )}
            {isFraming ? "Framing" : "Locked"}
          </span>
        )}
      </div>

      {/* Name + fill indicator (same thresholds as the in-editor counter) */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <PageNameEditor
          pageId={page.id}
          name={page.label}
          fallback={`Page ${index + 1}`}
          className="min-w-0 flex-1 text-sm font-medium"
        />
        <span
          title={`Annotations on this page (max ${MAX_ANNOTATIONS_PER_PAGE})`}
          className={cn(
            "shrink-0 text-[11px] font-semibold tabular-nums",
            annotationCount >= MAX_ANNOTATIONS_PER_PAGE
              ? "text-destructive"
              : annotationCount >= ANNOTATION_CAP_AMBER_FROM
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {annotationCount}/{MAX_ANNOTATIONS_PER_PAGE}
        </span>
      </div>

      {/* Per-layer annotation count dots */}
      <div className="mt-1.5 flex h-4 items-center gap-2">
        {activeLayers.map((layer) => (
          <span key={layer.key} className="flex items-center gap-1">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: colourFor(layer.key) }}
            />
            <span className="text-muted-foreground text-xs font-medium">
              {counts[layer.key]}
            </span>
          </span>
        ))}
      </div>

      {/* Hover actions — preview (locked pages), duplicate, delete. Duplicate
          carries images, framing, lock state and notes onto a fresh
          annotation surface. pointer-events gating matches the opacity: while
          invisible the buttons must not swallow taps meant for the card
          (touch input never hovers first). */}
      <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        {onPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            aria-label="Preview PDF page"
            title="Preview PDF page"
            className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-6 items-center justify-center rounded-md bg-white/80 focus-visible:opacity-100"
          >
            <Eye className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          aria-label="Duplicate page"
          title="Duplicate page"
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-6 items-center justify-center rounded-md bg-white/80 focus-visible:opacity-100"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete page"
          title="Delete page"
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-6 items-center justify-center rounded-md bg-white/80 focus-visible:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
