"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Lock, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { AnnotationPin } from "@/components/canvas/annotation-pin";
import { AssetPicker } from "@/components/canvas/asset-picker";
import {
  ActiveLayerSelector,
  LayerToggle,
  type LayerOption,
} from "@/components/canvas/layer-toggle";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAnnotation,
  createCanvasPage,
  deleteCanvasPage,
  fillSlot,
  lockSlot,
  reorderCanvasPages,
  unlockSlot,
  updateSlotFraming,
} from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type {
  CanvasTemplate,
  ProductAsset,
  ResolvedCanvasPage,
  ResolvedSlot,
} from "@/types";

/**
 * Annotation layers offered in Phase 4c. Only one is active for now — Phase 5
 * adds more — but everything downstream (LayerToggle, ActiveLayerSelector) is
 * generic over this array, so growing it is the only change needed.
 */
const AVAILABLE_LAYERS: LayerOption[] = [
  { type: "fabric", label: "Fabric", color: "#c8f000" },
];

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp a pan offset so the (center-scaled, object-cover) image always fills the
 * slot with no blank edges. At zoom z the image overflows the slot by
 * `size*(z-1)/2` on each axis; that's the maximum offset. Below zoom 1 there is
 * no overflow, so pan is pinned to 0.
 */
function clampPan(
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxX = Math.max(0, (width * (zoom - 1)) / 2);
  const maxY = Math.max(0, (height * (zoom - 1)) / 2);
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}

// ---- Template icons ---------------------------------------------------------

/** Inline 20×16 layout glyph used on page tabs and the picker cards. */
function TemplateIcon({
  template,
  className,
}: {
  template: CanvasTemplate;
  className?: string;
}) {
  const common = { width: 20, height: 16, className, "aria-hidden": true };
  const rect = "currentColor";
  if (template === "single") {
    return (
      <svg {...common} viewBox="0 0 20 16">
        <rect x="1" y="1" width="18" height="14" rx="2" fill={rect} />
      </svg>
    );
  }
  if (template === "split") {
    return (
      <svg {...common} viewBox="0 0 20 16">
        <rect x="1" y="1" width="8" height="14" rx="2" fill={rect} />
        <rect x="11" y="1" width="8" height="14" rx="2" fill={rect} />
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 20 16">
      <rect x="1" y="1" width="8" height="6.5" rx="1.5" fill={rect} />
      <rect x="11" y="1" width="8" height="6.5" rx="1.5" fill={rect} />
      <rect x="1" y="8.5" width="8" height="6.5" rx="1.5" fill={rect} />
      <rect x="11" y="8.5" width="8" height="6.5" rx="1.5" fill={rect} />
    </svg>
  );
}

const GRID_CLASS: Record<CanvasTemplate, string> = {
  single: "grid-cols-1",
  split: "grid-cols-2",
  quad: "grid-cols-2 grid-rows-2",
};

// ---- Main component ---------------------------------------------------------

export function CanvasPages({
  productId,
  workspaceId,
  pages,
  assets,
}: {
  productId: string;
  workspaceId: string;
  pages: ResolvedCanvasPage[];
  assets: ProductAsset[];
}) {
  const router = useRouter();

  const [activePageId, setActivePageId] = useState<string | null>(
    pages[0]?.id ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResolvedCanvasPage | null>(
    null,
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startReorder] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  // Annotation state (shared across the page's locked slots).
  const [activeLayer, setActiveLayer] = useState<string>(
    AVAILABLE_LAYERS[0].type,
  );
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    () => new Set(AVAILABLE_LAYERS.map((l) => l.type)),
  );

  // The stored id may point at a just-deleted page (or be null before the first
  // selection); the fallback keeps a valid tab active across add/delete/refresh
  // without a syncing effect.
  const activePage =
    pages.find((p) => p.id === activePageId) ?? pages[0] ?? null;

  function toggleLayer(type: string) {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleCreated(pageId: string) {
    setActivePageId(pageId);
    router.refresh();
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

  function handleDropOnTab(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ids = pages.map((p) => p.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDraggingId(null);
      return;
    }
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setDraggingId(null);
    startReorder(async () => {
      try {
        await reorderCanvasPages(productId, ids);
        router.refresh();
      } catch {
        toast.error("Could not reorder pages.");
      }
    });
  }

  return (
    <div className="bg-card shadow-card space-y-4 rounded-xl p-4">
      {/* Layer controls — above the page strip, right-aligned */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <LayerToggle
          availableLayers={AVAILABLE_LAYERS}
          visibleLayers={visibleLayers}
          onToggle={toggleLayer}
        />
        <ActiveLayerSelector
          availableLayers={AVAILABLE_LAYERS}
          activeLayer={activeLayer}
          onChange={setActiveLayer}
        />
      </div>

      {/* Page strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {pages.map((page, index) => (
          <PageTab
            key={page.id}
            page={page}
            index={index}
            active={page.id === activePage?.id}
            dragging={draggingId === page.id}
            onSelect={() => setActivePageId(page.id)}
            onDelete={() => setDeleteTarget(page)}
            onDragStart={() => setDraggingId(page.id)}
            onDragEnd={() => setDraggingId(null)}
            onDrop={() => handleDropOnTab(page.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Add canvas page"
          className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Active page grid */}
      {activePage ? (
        <div className={cn("grid h-[500px] gap-3", GRID_CLASS[activePage.template])}>
          {[...activePage.slots]
            .sort((a, b) => a.slot_index - b.slot_index)
            .map((slot) => (
              <SlotView
                key={`${slot.id}-${slot.asset_id ?? "empty"}`}
                slot={slot}
                assets={assets}
                productId={productId}
                workspaceId={workspaceId}
                activeLayer={activeLayer}
                visibleLayers={visibleLayers}
              />
            ))}
        </div>
      ) : (
        <div className="bg-muted text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 rounded-xl text-sm">
          <p>No canvas pages yet.</p>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" />
            Add a page
          </Button>
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
              This removes the page and every image slot and annotation on it.
              This cannot be undone.
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

// ---- Page tab ---------------------------------------------------------------

function PageTab({
  page,
  index,
  active,
  dragging,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  page: ResolvedCanvasPage;
  index: number;
  active: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
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
      className={cn(
        "group relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-card text-foreground shadow-card"
          : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        dragging && "opacity-50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2 outline-none"
      >
        <TemplateIcon
          template={page.template}
          className={active ? "text-foreground" : "text-muted-foreground"}
        />
        <span className="max-w-32 truncate font-medium">
          {page.label ?? `Page ${index + 1}`}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete page"
        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ---- Template picker --------------------------------------------------------

const TEMPLATE_OPTIONS: {
  template: CanvasTemplate;
  label: string;
  description: string;
}[] = [
  {
    template: "single",
    label: "Single View",
    description: "One full-width image. Best for front/back views.",
  },
  {
    template: "split",
    label: "Split View",
    description: "Two images side by side. Good for front + back together.",
  },
  {
    template: "quad",
    label: "Quad View",
    description: "Four images. Perfect for close-up details.",
  },
];

function TemplatePickerDialog({
  open,
  onOpenChange,
  productId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onCreated: (pageId: string) => void;
}) {
  const [selected, setSelected] = useState<CanvasTemplate>("single");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      try {
        const { id } = await createCanvasPage(productId, selected);
        onOpenChange(false);
        onCreated(id);
      } catch {
        toast.error("Could not create the page.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isPending) {
            e.preventDefault();
            handleCreate();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Canvas Page</DialogTitle>
          <DialogDescription>Choose a layout for this page</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TEMPLATE_OPTIONS.map((option) => {
            const isSelected = selected === option.template;
            return (
              <button
                key={option.template}
                type="button"
                onClick={() => setSelected(option.template)}
                aria-pressed={isSelected}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4 text-left transition-all outline-none",
                  isSelected
                    ? "border-brand ring-brand/40 bg-brand-muted/40 ring-2"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50",
                )}
              >
                <div className="bg-muted text-muted-foreground flex h-20 items-center justify-center rounded-lg">
                  <TemplateIcon
                    template={option.template}
                    className="h-10 w-12"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={handleCreate}>
            {isPending ? "Creating…" : "Create Page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Slot dispatcher --------------------------------------------------------

function SlotView({
  slot,
  assets,
  productId,
  workspaceId,
  activeLayer,
  visibleLayers,
}: {
  slot: ResolvedSlot;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
  activeLayer: string;
  visibleLayers: Set<string>;
}) {
  if (!slot.asset) {
    return (
      <EmptySlot
        slot={slot}
        assets={assets}
        productId={productId}
        workspaceId={workspaceId}
      />
    );
  }
  if (slot.is_locked) {
    return (
      <AnnotationSlot
        slot={slot}
        activeLayer={activeLayer}
        visibleLayers={visibleLayers}
      />
    );
  }
  return (
    <FramingSlot
      slot={slot}
      assets={assets}
      productId={productId}
      workspaceId={workspaceId}
    />
  );
}

// ---- Empty slot -------------------------------------------------------------

function EmptySlot({
  slot,
  assets,
  productId,
  workspaceId,
}: {
  slot: ResolvedSlot;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
}) {
  const router = useRouter();

  function handleSelect(asset: ProductAsset) {
    void fillSlot(slot.id, asset.id)
      .then(() => router.refresh())
      .catch(() => toast.error("Could not add the image."));
  }

  return (
    <AssetPicker
      assets={assets}
      productId={productId}
      workspaceId={workspaceId}
      onSelect={handleSelect}
      trigger={
        <button
          type="button"
          className="bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl transition-colors"
        >
          <ImagePlus className="size-8" />
          <span className="text-sm">Add image</span>
        </button>
      }
    />
  );
}

// ---- Framing slot (filled, unlocked) ----------------------------------------

type Framing = { x: number; y: number; zoom: number };

function FramingSlot({
  slot,
  assets,
  productId,
  workspaceId,
}: {
  slot: ResolvedSlot;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [framing, setFraming] = useState<Framing>({
    x: slot.crop_x,
    y: slot.crop_y,
    zoom: slot.zoom,
  });
  // Mirror for event handlers that close over stale state (drag/wheel/lock).
  const framingRef = useRef(framing);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [isLocking, startLock] = useTransition();

  const apply = useCallback((next: Framing) => {
    framingRef.current = next;
    setFraming(next);
  }, []);

  const persist = useCallback(
    (next: Framing) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        void updateSlotFraming(slot.id, next.x, next.y, next.zoom).catch(() =>
          toast.error("Could not save framing."),
        );
      }, 400);
    },
    [slot.id],
  );

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const w = rect?.width ?? 0;
      const h = rect?.height ?? 0;
      const zoom = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
      const { x, y } = clampPan(
        framingRef.current.x,
        framingRef.current.y,
        zoom,
        w,
        h,
      );
      const next = { x, y, zoom };
      apply(next);
      persist(next);
    },
    [apply, persist],
  );

  // Native, non-passive wheel listener so we can preventDefault on scroll-zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      applyZoom(framingRef.current.zoom - e.deltaY * 0.0015);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = {
      px: e.clientX,
      py: e.clientY,
      baseX: framingRef.current.x,
      baseY: framingRef.current.y,
    };
    function move(ev: PointerEvent) {
      const { x, y } = clampPan(
        start.baseX + (ev.clientX - start.px),
        start.baseY + (ev.clientY - start.py),
        framingRef.current.zoom,
        rect!.width,
        rect!.height,
      );
      apply({ x, y, zoom: framingRef.current.zoom });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      persist(framingRef.current);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function doLock() {
    startLock(async () => {
      try {
        if (writeTimer.current) clearTimeout(writeTimer.current);
        const f = framingRef.current;
        await updateSlotFraming(slot.id, f.x, f.y, f.zoom);
        await lockSlot(slot.id);
        setLockConfirm(false);
        router.refresh();
      } catch {
        toast.error("Could not lock the slot.");
      }
    });
  }

  function handleLock() {
    const f = framingRef.current;
    if (f.x === 0 && f.y === 0 && f.zoom === 1) setLockConfirm(true);
    else doLock();
  }

  function handleChangeImage(asset: ProductAsset) {
    void fillSlot(slot.id, asset.id)
      .then(() => router.refresh())
      .catch(() => toast.error("Could not change the image."));
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl"
      style={{ height: "100%" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slot.asset!.file_url}
        alt={slot.asset!.name}
        onPointerDown={handlePointerDown}
        draggable={false}
        style={{
          position: "absolute",
          transform: `translate(${framing.x}px, ${framing.y}px) scale(${framing.zoom})`,
          transformOrigin: "center",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          cursor: "grab",
          userSelect: "none",
          touchAction: "none",
        }}
      />

      {/* Framing mode indicator */}
      <div className="absolute top-2 left-2">
        <span className="rounded-md bg-black/50 px-2 py-1 text-xs text-white">
          Framing
        </span>
      </div>

      {/* Framing toolbar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/40 to-transparent p-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyZoom(framing.zoom - ZOOM_STEP)}
            aria-label="Zoom out"
            className="flex size-7 items-center justify-center rounded-md bg-white/90 text-foreground transition-colors hover:bg-white"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center text-xs font-medium text-white">
            {Math.round(framing.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoom(framing.zoom + ZOOM_STEP)}
            aria-label="Zoom in"
            className="flex size-7 items-center justify-center rounded-md bg-white/90 text-foreground transition-colors hover:bg-white"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <AssetPicker
            assets={assets}
            productId={productId}
            workspaceId={workspaceId}
            onSelect={handleChangeImage}
            trigger={
              <button
                type="button"
                className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-white"
              >
                Change image
              </button>
            }
          />
          <button
            type="button"
            onClick={handleLock}
            disabled={isLocking}
            className="bg-brand text-brand-foreground flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            <Lock className="size-3.5" />
            {isLocking ? "Locking…" : "Lock & Annotate"}
          </button>
        </div>
      </div>

      <AlertDialog open={lockConfirm} onOpenChange={setLockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock without framing?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven&apos;t adjusted the framing. Lock anyway? You can unlock
              later to re-frame.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isLocking}
              onClick={(e) => {
                e.preventDefault();
                doLock();
              }}
            >
              Lock anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Annotation slot (filled, locked) ---------------------------------------

function AnnotationSlot({
  slot,
  activeLayer,
  visibleLayers,
}: {
  slot: ResolvedSlot;
  activeLayer: string;
  visibleLayers: Set<string>;
}) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [, startCreate] = useTransition();
  const [isUnlocking, startUnlock] = useTransition();

  // Track the slot's rendered size so pins position from live fractions.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // 0–1 fractions of the slot — identical math to Konva's click in Phase 4d.
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    startCreate(async () => {
      try {
        await createAnnotation(slot.id, activeLayer, x, y, "point");
        router.refresh();
      } catch {
        toast.error("Could not place the pin.");
      }
    });
  }

  function doUnlock() {
    startUnlock(async () => {
      try {
        await unlockSlot(slot.id);
        setUnlockConfirm(false);
        router.refresh();
      } catch {
        toast.error("Could not unlock the slot.");
      }
    });
  }

  function handleUnlock() {
    if (slot.annotations.length > 0) setUnlockConfirm(true);
    else doUnlock();
  }

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height: "100%" }}>
      {/* Frozen image at the locked framing */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slot.asset!.file_url}
        alt={slot.asset!.name}
        style={{
          position: "absolute",
          transform: `translate(${slot.crop_x}px, ${slot.crop_y}px) scale(${slot.zoom})`,
          transformOrigin: "center",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />

      {/* Click overlay for placing pins — Phase 4d replaces with Konva. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleCanvasClick}
        data-slot-id={slot.id}
      />

      {/* Existing pins */}
      {slot.annotations
        .filter((a) => visibleLayers.has(a.layer_type))
        .map((annotation) => (
          <AnnotationPin
            key={annotation.id}
            annotation={annotation}
            slotWidth={size.width}
            slotHeight={size.height}
          />
        ))}

      {/* Toolbar */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <span className="rounded-md bg-black/50 px-2 py-1 text-xs text-white">
          Annotation mode
        </span>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={isUnlocking}
          title="Unlock to re-frame"
          className="rounded-md bg-white/90 px-2 py-1 text-xs text-foreground transition-colors hover:bg-white disabled:opacity-60"
        >
          {isUnlocking ? "Unlocking…" : "Unlock"}
        </button>
      </div>

      <AlertDialog open={unlockConfirm} onOpenChange={setUnlockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this image?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-framing this image may misalign existing annotation pins. Unlock
              anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUnlocking}
              onClick={(e) => {
                e.preventDefault();
                doUnlock();
              }}
            >
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
