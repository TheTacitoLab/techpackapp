"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, LayoutGrid, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { TemplatePickerDialog } from "@/components/canvas/canvas-templates";
import { useLayerColours } from "@/components/canvas/layer-colours-context";
import {
  ANNOTATION_LAYERS,
  countByLayer,
  type LayerKey,
} from "@/components/canvas/layers";
import { MiniTemplate } from "@/components/canvas/mini-template";
import { PageNameEditor } from "@/components/canvas/page-name-editor";
import { PdfExportSpike } from "@/components/canvas/pdf-export-spike";
import { EmptyState } from "@/components/empty-state";
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
import type { ProductAsset, ResolvedCanvasPage } from "@/types";

/**
 * Page Overview — the orientation view for Technical Details. A grid of page
 * cards (mini template render + editable name + per-layer annotation dots),
 * plus an Add-Page card. Empty state when there are no pages, with an extra
 * nudge to upload assets first when the product has none.
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
  const [deleteTarget, setDeleteTarget] = useState<ResolvedCanvasPage | null>(
    null,
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startReorder] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function handleCreated(pageId: string) {
    // Straight into Edit mode for the new page (the refresh brings its data).
    router.refresh();
    onOpenPage(pageId);
  }

  function handleDuplicate(pageId: string) {
    void duplicateCanvasPage(pageId)
      .then(({ id }) => {
        router.refresh();
        onOpenPage(id);
      })
      .catch(() => toast.error("Could not duplicate the page."));
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteCanvasPage(deleteTarget.id);
        setDeleteTarget(null);
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

  const deleteCount = deleteTarget
    ? deleteTarget.slots.reduce((n, s) => n + s.annotations.length, 0)
    : 0;

  return (
    <div className="bg-card shadow-card rounded-xl p-4">
      {pages.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={LayoutGrid}
            title="No pages yet"
            description="Create your first page to start annotating your garment drawings."
            action={
              <Button onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" />
                Add Page
              </Button>
            }
          />
          {assets.length === 0 && (
            <p className="text-muted-foreground text-center text-xs">
              Tip: upload your garment images in the Asset Upload section first —
              you&apos;ll place them onto pages here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Spike-quality PDF export trigger — real export UI comes later. */}
          <div className="flex justify-end">
            <PdfExportSpike productId={productId} pages={pages} />
          </div>
          <div className="grid grid-cols-3 gap-4">
          {pages.map((page, index) => (
            <PageCard
              key={page.id}
              page={page}
              index={index}
              dragging={draggingId === page.id}
              onOpen={() => onOpenPage(page.id)}
              onDelete={() => setDeleteTarget(page)}
              onDuplicate={() => handleDuplicate(page.id)}
              onDragStart={() => setDraggingId(page.id)}
              onDragEnd={() => setDraggingId(null)}
              onDrop={() => handleDrop(page.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl transition-colors"
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
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

// ---- Page card --------------------------------------------------------------

function PageCard({
  page,
  index,
  dragging,
  onOpen,
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

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={onOpen}
      className={cn(
        "group bg-card shadow-card hover:ring-brand/40 relative cursor-pointer rounded-xl p-3 transition-shadow hover:ring-2",
        dragging && "opacity-50",
      )}
    >
      {/* Mini template render */}
      <MiniTemplate page={page} className="h-[140px] rounded-lg" />

      {/* Name */}
      <div className="mt-2">
        <PageNameEditor
          pageId={page.id}
          name={page.label}
          fallback={`Page ${index + 1}`}
          className="w-full text-sm font-medium"
        />
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
              {counts[layer.key as LayerKey]}
            </span>
          </span>
        ))}
      </div>

      {/* Duplicate + delete (hover) — duplicate carries images, framing, lock
          state and notes onto a fresh annotation surface. */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
