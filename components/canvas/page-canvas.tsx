"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Lock, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { AnnotationPin } from "@/components/canvas/annotation-pin";
import { AssetPicker } from "@/components/canvas/asset-picker";
import { GRID_CLASS } from "@/components/canvas/canvas-templates";
import { FabricTrimPinEditor } from "@/components/canvas/fabric-trim-pin-editor";
import { layerByKey, layerForType, type LayerKey } from "@/components/canvas/layers";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createAnnotation,
  fillSlot,
  lockSlot,
  unlockSlot,
  updateSlotFraming,
} from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";
import type {
  CanvasAnnotation,
  CanvasLayerType,
  ProductAsset,
  ResolvedCanvasPage,
  ResolvedLibraryItem,
  ResolvedSlot,
} from "@/types";

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

type AnnotationMutationHandlers = {
  onAnnotationCreated: (slotId: string, annotation: CanvasAnnotation) => void;
  onAnnotationUpdated: (
    slotId: string,
    id: string,
    data: Record<string, unknown>,
  ) => void;
  onAnnotationDeleted: (slotId: string, id: string) => void;
  onSelectAnnotation: (id: string) => void;
};

/**
 * The active page's template grid and its slots. This is the ONLY part of the
 * editor that renders images and pins — deliberately isolated so a future
 * session can swap the CSS image/HTML-pin internals for Konva without touching
 * navigation, layers, or fullscreen. Every slot is one of three states:
 * empty (asset picker) → framing (CSS pan/zoom + Lock) → annotation (pins).
 *
 * Annotation state itself is owned by `PageEditor` (lifted up so the
 * right-hand list panel can show every page's annotations, not just the
 * active one) — this component and its descendants only read `slot.annotations`
 * and call the mutation callbacks, never keep their own copy.
 *
 * `stageZoom` is the inspect-the-page magnifier applied to the whole grid
 * (0.5–4.0); `activeLayerKey` decides which layer new pins get and which pins
 * are interactive.
 */
export function PageCanvas({
  page,
  assets,
  productId,
  workspaceId,
  activeLayerKey,
  stageZoom,
  heightClassName,
  libraryItems,
  selectedAnnotationId,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationDeleted,
  onSelectAnnotation,
}: {
  page: ResolvedCanvasPage;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
  activeLayerKey: LayerKey;
  stageZoom: number;
  heightClassName: string;
  libraryItems: ResolvedLibraryItem[];
  selectedAnnotationId: string | null;
} & AnnotationMutationHandlers) {
  return (
    <div className="flex justify-center">
      <div
        className={cn("grid w-full gap-3", GRID_CLASS[page.template], heightClassName)}
        style={{ transform: `scale(${stageZoom})`, transformOrigin: "top center" }}
      >
        {[...page.slots]
          .sort((a, b) => a.slot_index - b.slot_index)
          .map((slot) => (
            <SlotView
              key={`${slot.id}-${slot.asset_id ?? "empty"}`}
              slot={slot}
              assets={assets}
              productId={productId}
              workspaceId={workspaceId}
              activeLayerKey={activeLayerKey}
              libraryItems={libraryItems}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationCreated={onAnnotationCreated}
              onAnnotationUpdated={onAnnotationUpdated}
              onAnnotationDeleted={onAnnotationDeleted}
              onSelectAnnotation={onSelectAnnotation}
            />
          ))}
      </div>
    </div>
  );
}

// ---- Slot dispatcher --------------------------------------------------------

function SlotView({
  slot,
  assets,
  productId,
  workspaceId,
  activeLayerKey,
  libraryItems,
  selectedAnnotationId,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationDeleted,
  onSelectAnnotation,
}: {
  slot: ResolvedSlot;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
  activeLayerKey: LayerKey;
  libraryItems: ResolvedLibraryItem[];
  selectedAnnotationId: string | null;
} & AnnotationMutationHandlers) {
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
        activeLayerKey={activeLayerKey}
        workspaceId={workspaceId}
        libraryItems={libraryItems}
        selectedAnnotationId={selectedAnnotationId}
        onAnnotationCreated={onAnnotationCreated}
        onAnnotationUpdated={onAnnotationUpdated}
        onAnnotationDeleted={onAnnotationDeleted}
        onSelectAnnotation={onSelectAnnotation}
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
      .catch((err) => {
        // TEMP diagnostic: surface the real error, not just the generic toast.
        console.error("[DIAG] fillSlot (add image) failed:", err);
        toast.error("Could not add the image.");
      });
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
        void updateSlotFraming(slot.id, next.x, next.y, next.zoom).catch(
          (err) => {
            // TEMP diagnostic: surface the real error, not just the toast.
            console.error("[DIAG] updateSlotFraming failed:", err);
            toast.error("Could not save framing.");
          },
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
      } catch (err) {
        // TEMP diagnostic: surface the real error, not just the toast.
        console.error("[DIAG] lock (updateSlotFraming/lockSlot) failed:", err);
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
      .catch((err) => {
        // TEMP diagnostic: surface the real error, not just the generic toast.
        console.error("[DIAG] fillSlot (change image) failed:", err);
        toast.error("Could not change the image.");
      });
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
            className="text-foreground flex size-7 items-center justify-center rounded-md bg-white/90 transition-colors hover:bg-white"
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
            className="text-foreground flex size-7 items-center justify-center rounded-md bg-white/90 transition-colors hover:bg-white"
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
                className="text-foreground rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white"
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

// ---- Draft pin (Fabrics & Trim: pick sub-type + item BEFORE creating) -------

/**
 * A new Fabrics & Trim pin defers `createAnnotation` until the editor is
 * saved — unlike other layers, which create immediately on click — because
 * the sub-type chosen in the editor (Fabric/Trim/Fastener/Elastic) determines
 * the annotation's actual `layer_type`, and that can't be changed after
 * creation (it would invalidate the assigned reference code). This renders a
 * small pulsing marker at the click point with the editor already open;
 * dismissing without saving never calls the server, so no orphan row exists.
 */
function DraftFabricPin({
  x,
  y,
  slotWidth,
  slotHeight,
  slotId,
  libraryItems,
  onCreated,
  onCancel,
}: {
  x: number;
  y: number;
  slotWidth: number;
  slotHeight: number;
  slotId: string;
  libraryItems: ResolvedLibraryItem[];
  onCreated: (result: {
    id: string;
    referenceCode: string;
    layerType: CanvasLayerType;
    data: Record<string, unknown>;
  }) => void;
  onCancel: () => void;
}) {
  const color = layerByKey("fabric").color;
  return (
    <Popover open onOpenChange={(next) => !next && onCancel()}>
      <PopoverTrigger asChild>
        <span
          aria-hidden
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-pulse"
          style={{ left: x * slotWidth, top: y * slotHeight }}
        >
          <span
            className="block size-1.5 rounded-full ring-2 ring-white"
            style={{ backgroundColor: color }}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80 space-y-3">
        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          New Fabrics &amp; Trim pin
        </div>
        <FabricTrimPinEditor
          mode="create"
          slotId={slotId}
          x={x}
          y={y}
          libraryItems={libraryItems}
          onCreated={onCreated}
          onCancel={onCancel}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---- Annotation slot (filled, locked) ---------------------------------------

function AnnotationSlot({
  slot,
  activeLayerKey,
  workspaceId,
  libraryItems,
  selectedAnnotationId,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationDeleted,
  onSelectAnnotation,
}: {
  slot: ResolvedSlot;
  activeLayerKey: LayerKey;
  workspaceId: string;
  libraryItems: ResolvedLibraryItem[];
  selectedAnnotationId: string | null;
} & AnnotationMutationHandlers) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [, startCreate] = useTransition();
  const [isUnlocking, startUnlock] = useTransition();
  const [draftPoint, setDraftPoint] = useState<{ x: number; y: number } | null>(
    null,
  );

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
    // 0–1 fractions of the slot — identical math to Konva's click next session.
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);

    // Fabrics & Trim: open the editor at this point BEFORE creating anything —
    // the chosen sub-type decides the real layer_type (see DraftFabricPin).
    if (activeLayerKey === "fabric") {
      setDraftPoint({ x, y });
      return;
    }

    // TEMPORARY client-side timing instrumentation (browser console) — splits
    // click-to-visible into three honest phases: T0→T2 pure client work before
    // any network call, T2→T3 the real network+server round-trip, T3→T5 React
    // re-render/paint. Logic is unchanged. Only applies to this immediate-create
    // path (other layers); the deferred Fabrics & Trim flow above isn't timed.
    const t0 = performance.now();
    console.log("%c[TIMING] T0 - click registered", "color: #C8F000", t0);
    const t1 = performance.now();
    console.log(
      `%c[TIMING] T1 - coords computed (+${(t1 - t0).toFixed(1)}ms)`,
      "color: #C8F000",
      t1,
    );
    // New pins get the active layer's primary type (measurement/construction/…).
    const layerType = layerByKey(activeLayerKey).primaryType;

    startCreate(async () => {
      const t2 = performance.now();
      console.log(
        `%c[TIMING] T2 - transition started, calling server (+${(t2 - t1).toFixed(1)}ms since T1)`,
        "color: #C8F000",
        t2,
      );
      try {
        const result = await createAnnotation(slot.id, layerType, x, y, "point");
        const t3 = performance.now();
        console.log(
          `%c[TIMING] T3 - server responded (+${(t3 - t2).toFixed(1)}ms)`,
          "color: #FF6B6B",
          t3,
        );

        // Add directly to shared state (owned by PageEditor) — no
        // router.refresh(), no full page re-fetch.
        onAnnotationCreated(slot.id, {
          id: result.id,
          slot_id: slot.id,
          workspace_id: workspaceId,
          layer_type: layerType,
          reference_code: result.referenceCode,
          x,
          y,
          pin_type: "point",
          end_x: null,
          end_y: null,
          data: {},
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const t4 = performance.now();
        console.log(
          `%c[TIMING] T4 - local state updated (+${(t4 - t3).toFixed(1)}ms)`,
          "color: #C8F000",
          t4,
        );
        requestAnimationFrame(() => {
          const t5 = performance.now();
          console.log(
            `%c[TIMING] T5 - next paint after state update (+${(t5 - t4).toFixed(1)}ms)`,
            "color: #60B4FF",
            t5,
          );
          console.log(
            `%c[TIMING] TOTAL click-to-visible: ${(t5 - t0).toFixed(1)}ms`,
            "color: #FFB347; font-weight: bold",
            "",
          );
        });
      } catch (err) {
        console.error("[TIMING] Error:", err);
        toast.error("Could not place the pin.");
      }
    });
  }

  function handleDraftCreated(result: {
    id: string;
    referenceCode: string;
    layerType: CanvasLayerType;
    data: Record<string, unknown>;
  }) {
    if (!draftPoint) return;
    onAnnotationCreated(slot.id, {
      id: result.id,
      slot_id: slot.id,
      workspace_id: workspaceId,
      layer_type: result.layerType,
      reference_code: result.referenceCode,
      x: draftPoint.x,
      y: draftPoint.y,
      pin_type: "point",
      end_x: null,
      end_y: null,
      data: result.data as unknown as Json,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setDraftPoint(null);
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

      {/* Click overlay for placing pins — the Konva stage replaces this next session. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleCanvasClick}
        data-slot-id={slot.id}
      />

      {/* Existing pins — active layer interactive, others dimmed for context */}
      {slot.annotations.map((annotation) => (
        <AnnotationPin
          key={annotation.id}
          annotation={annotation}
          slotWidth={size.width}
          slotHeight={size.height}
          interactive={
            layerForType(annotation.layer_type)?.key === activeLayerKey
          }
          isSelected={annotation.id === selectedAnnotationId}
          libraryItems={libraryItems}
          onUpdated={(id, data) => onAnnotationUpdated(slot.id, id, data)}
          onDeleted={(id) => onAnnotationDeleted(slot.id, id)}
          onSelected={onSelectAnnotation}
        />
      ))}

      {draftPoint && (
        <DraftFabricPin
          x={draftPoint.x}
          y={draftPoint.y}
          slotWidth={size.width}
          slotHeight={size.height}
          slotId={slot.id}
          libraryItems={libraryItems}
          onCreated={handleDraftCreated}
          onCancel={() => setDraftPoint(null)}
        />
      )}

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
          className="text-foreground rounded-md bg-white/90 px-2 py-1 text-xs transition-colors hover:bg-white disabled:opacity-60"
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
