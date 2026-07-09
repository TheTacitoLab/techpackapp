"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Lock, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { AnnotationPin } from "@/components/canvas/annotation-pin";
import { AssetPicker } from "@/components/canvas/asset-picker";
import {
  fitImageArea,
  templateCellLayout,
} from "@/lib/canvas-layout";
import {
  ColourwayPinEditor,
  useColourwayDraftFields,
  useColourwaySelectionDraft,
} from "@/components/canvas/colourway-pin-editor";
import { ConstructionPinEditor } from "@/components/canvas/construction-pin-editor";
import { clientToFraction } from "@/components/canvas/coords";
import {
  displayedImageRect,
  normaliseFitMode,
  slotImageBaseScale,
  slotImageCssTransform,
  slotImageObjectFit,
  type SlotFitMode,
} from "@/lib/cover-geometry";
import { sampleColourAtPoint } from "@/lib/colour-sample";
import { BrandingLabelPinEditor } from "@/components/canvas/branding-label-pin-editor";
import { FabricTrimPinEditor } from "@/components/canvas/fabric-trim-pin-editor";
import { MeasurementLinePin } from "@/components/canvas/measurement-line-pin";
import { MeasurementPinEditor } from "@/components/canvas/measurement-pin-editor";
import { SlotNameEditor } from "@/components/canvas/slot-name-editor";
import { useUserPreferences } from "@/components/user-preferences-context";
import { useLayerColours } from "@/components/canvas/layer-colours-context";
import {
  layerForType,
  readableTextOn,
  type LayerKey,
} from "@/components/canvas/layers";
import { PinEditorDialog } from "@/components/canvas/pin-editor-dialog";
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
  CanvasColourway,
  CanvasLayerType,
  ColourwayAnnotationData,
  ProductAsset,
  ResolvedCanvasPage,
  ResolvedLibraryItem,
  ResolvedSlot,
} from "@/types";

/**
 * Colourway layer state + callbacks threaded from `TechnicalDetailsSection`
 * (which owns the optimistic colourway list and the last-used selection) down
 * to the pin editors. Grouped separately from the annotation mutation handlers
 * because colourways are product-level, not per-annotation.
 */
type ColourwayContext = {
  colourways: CanvasColourway[];
  lastUsedColourwayId: string | null;
  onColourwayCreated: (colourway: CanvasColourway) => void;
  onColourwayUsed: (colourwayId: string) => void;
};

// Zoom 1 is each mode's own baseline (cover fills, contain shows everything).
// The floor drops to 0.25 so a garment can be deliberately shrunk within its
// box, with clean padding around it — chosen over pinning fill mode at
// full-coverage (option a): below 1, both modes simply centre the smaller
// image and the surrounding space reads as intentional padding (clampPan
// already centres any axis where the scaled image is smaller than the slot, so
// no blank-edge artefacts and nothing can be dragged off-centre). Pin
// coordinates are fractions of the slot box and are unaffected by image zoom.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp a pan offset per axis from the image's ACTUAL displayed rectangle
 * (shared geometry — `displayedImageRect`), one rule for both modes: an axis
 * where the scaled image is larger than the slot pans freely within the no-gap
 * range `±(displayed − slot)/2`; an axis where it is smaller stays centred (0),
 * so 'fill' never shows blank edges and 'fit' never loses its letterbox
 * symmetry. (Exact — replaces the old square-ish approximation, which
 * under-allowed panning along a cover image's long axis.) Falls back to that
 * approximation only if the asset's natural dimensions are unknown.
 */
function clampPan(
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
  fitMode: SlotFitMode,
  naturalWidth: number | null,
  naturalHeight: number | null,
): { x: number; y: number } {
  if (!naturalWidth || !naturalHeight || width <= 0 || height <= 0) {
    const maxX = Math.max(0, (width * (zoom - 1)) / 2);
    const maxY = Math.max(0, (height * (zoom - 1)) / 2);
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }
  const rect = displayedImageRect(
    naturalWidth,
    naturalHeight,
    width,
    height,
    0,
    0,
    zoom,
    fitMode,
  );
  const maxX = Math.max(0, (rect.width - width) / 2);
  const maxY = Math.max(0, (rect.height - height) / 2);
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}

type AnnotationMutationHandlers = {
  onAnnotationCreated: (slotId: string, annotation: CanvasAnnotation) => void;
  onAnnotationUpdated: (
    slotId: string,
    id: string,
    data: Record<string, unknown>,
  ) => void;
  /** Point pins pass x/y only; measurement lines also pass their endpoint. */
  onAnnotationMoved: (
    slotId: string,
    id: string,
    x: number,
    y: number,
    endX?: number | null,
    endY?: number | null,
  ) => void;
  onAnnotationLabelOffset: (
    slotId: string,
    id: string,
    offsetX: number | null,
    offsetY: number | null,
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
  allLayers,
  atAnnotationCap,
  onAnnotationCapBlocked,
  stageZoom,
  heightClassName,
  libraryItems,
  colourwayContext,
  selectedAnnotationId,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationMoved,
  onAnnotationLabelOffset,
  onAnnotationDeleted,
  onSelectAnnotation,
}: {
  page: ResolvedCanvasPage;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
  activeLayerKey: LayerKey;
  /** Read-only composite: every layer's pins at full opacity, no placement. */
  allLayers: boolean;
  /** The page is at the annotation cap — placement is blocked. */
  atAnnotationCap: boolean;
  /** Invoked when a placement click is blocked by the cap. */
  onAnnotationCapBlocked: () => void;
  stageZoom: number;
  heightClassName: string;
  libraryItems: ResolvedLibraryItem[];
  colourwayContext: ColourwayContext;
  selectedAnnotationId: string | null;
} & AnnotationMutationHandlers) {
  // Measure the available drawing area so the page replica can be fit to it at
  // the fixed landscape-A4 image-area aspect (letterboxed on a screen of a
  // different shape — the "print preview" look). clientWidth/Height ignore the
  // stageZoom transform (applied to the replica itself), so this stays stable.
  const availRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = availRef.current;
    if (!el) return;
    const update = () =>
      setAvail({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const replica = fitImageArea(avail.width, avail.height);
  // The SHARED layout module subdivides the image area into cells + inset image
  // boxes — the very same function the PDF renderer uses, so these on-screen
  // cells are exact proportional replicas of the PDF's slot boxes.
  const cells = templateCellLayout(page.template, {
    left: 0,
    top: 0,
    width: replica.width,
    height: replica.height,
  });
  const sortedSlots = [...page.slots].sort((a, b) => a.slot_index - b.slot_index);

  return (
    // The available area — neutral canvas background. Any letterbox space (screen
    // isn't A4-shaped) sits cleanly here, OUTSIDE the page replica.
    <div
      ref={availRef}
      className={cn("flex w-full items-center justify-center", heightClassName)}
    >
      {/* The page replica: the fixed image-area rectangle, centred (letterboxed)
          and scaled by stageZoom. Its cells match the PDF boxes in proportion,
          arrangement and gutters — a true scaled replica. */}
      <div
        className="relative shrink-0"
        style={{
          width: replica.width,
          height: replica.height,
          transform: `scale(${stageZoom})`,
          transformOrigin: "center",
        }}
      >
        {sortedSlots.map((slot, i) => {
          const layout = cells[i];
          if (!layout) return null;
          return (
            <div
              key={`${slot.id}-${slot.asset_id ?? "empty"}`}
              className="border-border/60 bg-muted/20 absolute rounded-lg border"
              style={{
                left: layout.cell.left,
                top: layout.cell.top,
                width: layout.cell.width,
                height: layout.cell.height,
              }}
            >
              {/* The inset image box — the frozen lock box maps onto exactly
                  this region, so what fills it on screen fills the PDF box the
                  same way. */}
              <div
                className="absolute"
                style={{
                  left: layout.inner.left - layout.cell.left,
                  top: layout.inner.top - layout.cell.top,
                  width: layout.inner.width,
                  height: layout.inner.height,
                }}
              >
                <SlotView
                  slot={slot}
                  assets={assets}
                  productId={productId}
                  workspaceId={workspaceId}
                  activeLayerKey={activeLayerKey}
                  allLayers={allLayers}
                  atAnnotationCap={atAnnotationCap}
                  onAnnotationCapBlocked={onAnnotationCapBlocked}
                  libraryItems={libraryItems}
                  colourwayContext={colourwayContext}
                  selectedAnnotationId={selectedAnnotationId}
                  onAnnotationCreated={onAnnotationCreated}
                  onAnnotationUpdated={onAnnotationUpdated}
                  onAnnotationMoved={onAnnotationMoved}
                  onAnnotationLabelOffset={onAnnotationLabelOffset}
                  onAnnotationDeleted={onAnnotationDeleted}
                  onSelectAnnotation={onSelectAnnotation}
                />
              </div>
            </div>
          );
        })}
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
  allLayers,
  atAnnotationCap,
  onAnnotationCapBlocked,
  libraryItems,
  colourwayContext,
  selectedAnnotationId,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationMoved,
  onAnnotationLabelOffset,
  onAnnotationDeleted,
  onSelectAnnotation,
}: {
  slot: ResolvedSlot;
  assets: ProductAsset[];
  productId: string;
  workspaceId: string;
  activeLayerKey: LayerKey;
  allLayers: boolean;
  atAnnotationCap: boolean;
  onAnnotationCapBlocked: () => void;
  libraryItems: ResolvedLibraryItem[];
  colourwayContext: ColourwayContext;
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
        productId={productId}
        activeLayerKey={activeLayerKey}
        allLayers={allLayers}
        atAnnotationCap={atAnnotationCap}
        onAnnotationCapBlocked={onAnnotationCapBlocked}
        workspaceId={workspaceId}
        libraryItems={libraryItems}
        colourwayContext={colourwayContext}
        selectedAnnotationId={selectedAnnotationId}
        onAnnotationCreated={onAnnotationCreated}
        onAnnotationUpdated={onAnnotationUpdated}
        onAnnotationMoved={onAnnotationMoved}
        onAnnotationLabelOffset={onAnnotationLabelOffset}
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
      .catch(() => {
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

/**
 * Style for a slot image painted UNCLIPPED at its base-fit size: an explicit
 * `natural × baseScale` box centred in the slot, then the framing transform.
 *
 * Why not `object-fit` + `width/height: 100%`: object-fit CLIPS the painted
 * image to the element's box BEFORE the CSS transform applies, so a pan larger
 * than `box×(zoom−1)/2` drags the clipped box (blank space behind it) out of
 * the slot — which is exactly what made far image regions impossible to reach
 * in Fill mode. With an explicit painted-size box there is nothing to clip:
 * the on-screen paint equals the shared affine model (`slotSampleTransform`)
 * at EVERY crop/zoom, the slot's own `overflow-hidden` does the only cropping,
 * and the full extent of the image is genuinely renddered when panned to.
 *
 * The element's centre (pre-transform) coincides with the slot centre, so the
 * `scale(zoom)` about the element centre is the same "about the box centre"
 * the sampler's derivation assumes — the affine is unchanged, only clipping
 * semantics differ. Returns null when the box or natural size isn't known yet
 * (first paint); callers fall back to the object-fit rendering, which is
 * visually identical within small crops.
 */
function paintedImageStyle(
  naturalWidth: number | null,
  naturalHeight: number | null,
  boxWidth: number,
  boxHeight: number,
  cropX: number,
  cropY: number,
  zoom: number,
  fitMode: SlotFitMode,
): React.CSSProperties | null {
  if (!naturalWidth || !naturalHeight || boxWidth <= 0 || boxHeight <= 0) {
    return null;
  }
  const base = slotImageBaseScale(
    naturalWidth,
    naturalHeight,
    boxWidth,
    boxHeight,
    fitMode,
  );
  const paintedW = naturalWidth * base;
  const paintedH = naturalHeight * base;
  return {
    position: "absolute",
    left: (boxWidth - paintedW) / 2,
    top: (boxHeight - paintedH) / 2,
    width: paintedW,
    height: paintedH,
    // Tailwind preflight sets img { max-width: 100% } — must not rescale the
    // explicit painted box.
    maxWidth: "none",
    transform: slotImageCssTransform(cropX, cropY, zoom),
    transformOrigin: "center",
  };
}

// ---- Framing slot (filled, unlocked) ----------------------------------------

type Framing = { x: number; y: number; zoom: number; fitMode: SlotFitMode };

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

  // Natural image dimensions for the exact pan clamp. Prefer the DECODED
  // <img>'s intrinsic size (set onLoad) — the browser's ground truth, and the
  // same source the colour sampler prefers — because the stored asset
  // dimensions are legitimately null for files the upload flow couldn't
  // decode (SVGs, legacy rows). Relying on the DB columns alone silently
  // dropped those slots to the crude fallback clamp, which is what made
  // cropped-off areas (a tall jersey's collar) unreachable in Fill mode.
  const [decodedDims, setDecodedDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const naturalWidth = decodedDims?.w ?? slot.asset?.width ?? null;
  const naturalHeight = decodedDims?.h ?? slot.asset?.height ?? null;
  const initialFitMode = normaliseFitMode(slot.fit_mode);

  // Local (untransformed) slot size for the explicit painted-size rendering —
  // offsetWidth/offsetHeight and ResizeObserver both report pre-transform px.
  const [localSize, setLocalSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setLocalSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * The slot's box in LOCAL layout px plus the live on-screen scale factor.
   * The whole page grid is scaled by `stageZoom` (a CSS transform), so
   * `getBoundingClientRect()` returns SCREEN px while `crop_x/crop_y` apply
   * INSIDE the scaled subtree in local px. Clamping must therefore use local
   * px (offsetWidth/offsetHeight, which ignore transforms) and pointer deltas
   * (screen px) must be divided by the scale — mixing the two shrank the
   * reachable pan range at stage zoom < 1 (unreachable edges) and inflated it
   * at > 1 (blank gaps in Fill), and made the image outrun the cursor.
   */
  const getLocalBox = useCallback((): {
    w: number;
    h: number;
    scale: number;
  } | null => {
    const el = containerRef.current;
    if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return null;
    const rect = el.getBoundingClientRect();
    return {
      w: el.offsetWidth,
      h: el.offsetHeight,
      scale: rect.width / el.offsetWidth,
    };
  }, []);

  const [framing, setFraming] = useState<Framing>({
    x: slot.crop_x,
    y: slot.crop_y,
    zoom: slot.zoom,
    fitMode: initialFitMode,
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
        void updateSlotFraming(
          slot.id,
          next.x,
          next.y,
          next.zoom,
          next.fitMode,
        ).catch(() => {
          toast.error("Could not save framing.");
        });
      }, 400);
    },
    [slot.id],
  );

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const box = getLocalBox();
      const zoom = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
      const { fitMode } = framingRef.current;
      const { x, y } = clampPan(
        framingRef.current.x,
        framingRef.current.y,
        zoom,
        box?.w ?? 0,
        box?.h ?? 0,
        fitMode,
        naturalWidth,
        naturalHeight,
      );
      const next = { x, y, zoom, fitMode };
      apply(next);
      persist(next);
    },
    [apply, persist, getLocalBox, naturalWidth, naturalHeight],
  );

  // Switching the base fit changes what the current pan/zoom mean, so the
  // toggle resets to the new mode's centred baseline — the user always knows
  // exactly what they're getting ('Fit' = whole image, 'Fill' = cover).
  const applyFitMode = useCallback(
    (fitMode: SlotFitMode) => {
      if (fitMode === framingRef.current.fitMode) return;
      const next = { x: 0, y: 0, zoom: 1, fitMode };
      apply(next);
      persist(next);
    },
    [apply, persist],
  );

  const resetFraming = useCallback(() => {
    const next = { x: 0, y: 0, zoom: 1, fitMode: framingRef.current.fitMode };
    apply(next);
    persist(next);
  }, [apply, persist]);

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
    // Captured once per drag: stage zoom can't change mid-drag (its controls
    // are outside the pointer capture), so box + scale stay valid throughout.
    const box = getLocalBox();
    if (!box) return;
    const start = {
      px: e.clientX,
      py: e.clientY,
      baseX: framingRef.current.x,
      baseY: framingRef.current.y,
    };
    function move(ev: PointerEvent) {
      const { zoom, fitMode } = framingRef.current;
      const { x, y } = clampPan(
        start.baseX + (ev.clientX - start.px) / box!.scale,
        start.baseY + (ev.clientY - start.py) / box!.scale,
        zoom,
        box!.w,
        box!.h,
        fitMode,
        naturalWidth,
        naturalHeight,
      );
      apply({ x, y, zoom, fitMode });
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
    // The frozen design-space box: this slot's LOCAL rendered size right now
    // (offsetWidth/offsetHeight — pre-transform px, via getLocalBox). This is
    // the exact coordinate space the pan clamp and drag math authored
    // crop_x/crop_y in (see getLocalBox's doc above), so freezing it makes
    // the framing numbers meaningful at every future container size.
    const box = getLocalBox();
    if (!box) {
      toast.error("Could not lock the slot.");
      return;
    }
    startLock(async () => {
      try {
        if (writeTimer.current) clearTimeout(writeTimer.current);
        const f = framingRef.current;
        await updateSlotFraming(slot.id, f.x, f.y, f.zoom, f.fitMode);
        await lockSlot(slot.id, box.w, box.h);
        setLockConfirm(false);
        router.refresh();
      } catch {
        toast.error("Could not lock the slot.");
      }
    });
  }

  function handleLock() {
    const f = framingRef.current;
    // "Untouched" = default pan/zoom AND the mode the slot arrived with —
    // choosing Fit/Fill is itself a deliberate framing decision.
    const untouched =
      f.x === 0 && f.y === 0 && f.zoom === 1 && f.fitMode === initialFitMode;
    if (untouched) setLockConfirm(true);
    else doLock();
  }

  function handleChangeImage(asset: ProductAsset) {
    void fillSlot(slot.id, asset.id)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not change the image.");
      });
  }

  return (
    <div
      ref={containerRef}
      className="@container relative overflow-hidden rounded-xl"
      style={{ height: "100%" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slot.asset!.file_url}
        alt={slot.asset!.name}
        onPointerDown={handlePointerDown}
        onLoad={(e) => {
          // Ground-truth intrinsic size for the pan clamp (see decodedDims).
          const el = e.currentTarget;
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            setDecodedDims({ w: el.naturalWidth, h: el.naturalHeight });
          }
        }}
        draggable={false}
        style={{
          ...(paintedImageStyle(
            naturalWidth,
            naturalHeight,
            localSize.width,
            localSize.height,
            framing.x,
            framing.y,
            framing.zoom,
            framing.fitMode,
          ) ?? {
            // Pre-measure / unknown-dims fallback: identical within small crops.
            position: "absolute",
            transform: slotImageCssTransform(framing.x, framing.y, framing.zoom),
            transformOrigin: "center",
            width: "100%",
            height: "100%",
            objectFit: slotImageObjectFit(framing.fitMode),
          }),
          cursor: "grab",
          userSelect: "none",
          touchAction: "none",
        }}
      />

      {/* Slot name + framing mode indicator */}
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <SlotNameEditor slotId={slot.id} name={slot.name} />
        <span className="rounded-md bg-black/50 px-2 py-1 text-xs text-white">
          Framing
        </span>
      </div>

      {/* Framing toolbar. Wraps and condenses inside its @container so ALL
          controls stay fully visible at every box size — a small Quad box in
          the standard editor gets a compact, wrapped bar (icon-only actions);
          a large box (Single, or any layout in fullscreen) gets the full bar
          with labels. Nothing is ever clipped. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-1.5 bg-gradient-to-t from-black/40 to-transparent p-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => applyZoom(framing.zoom - ZOOM_STEP)}
            aria-label="Zoom out"
            className="text-foreground flex size-7 items-center justify-center rounded-md bg-white/90 transition-colors hover:bg-white"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-9 text-center text-xs font-medium text-white">
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
          <button
            type="button"
            onClick={resetFraming}
            aria-label="Reset framing"
            title="Reset framing"
            className="text-foreground flex size-7 items-center justify-center rounded-md bg-white/90 transition-colors hover:bg-white"
          >
            <RotateCcw className="size-3.5" />
          </button>

          {/* Fit / Fill — per-slot base fit. Fit shows the WHOLE image
              (letterboxed); Fill covers the slot, cropping overflow. */}
          <div className="flex overflow-hidden rounded-md bg-white/90">
            {(["fit", "fill"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => applyFitMode(mode)}
                aria-pressed={framing.fitMode === mode}
                title={
                  mode === "fit"
                    ? "Fit: show the whole image, letterboxed"
                    : "Fill: cover the slot, cropping overflow"
                }
                className={cn(
                  "px-2 py-1.5 text-xs font-medium transition-colors",
                  framing.fitMode === mode
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-white",
                )}
              >
                {mode === "fit" ? "Fit" : "Fill"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <AssetPicker
            assets={assets}
            productId={productId}
            workspaceId={workspaceId}
            onSelect={handleChangeImage}
            trigger={
              <button
                type="button"
                title="Change image"
                className="text-foreground flex items-center gap-1.5 rounded-lg bg-white/90 px-2 py-1.5 text-sm font-medium transition-colors hover:bg-white"
              >
                <ImagePlus className="size-4 shrink-0" />
                <span className="hidden @[22rem]:inline">Change image</span>
              </button>
            }
          />
          <button
            type="button"
            onClick={handleLock}
            disabled={isLocking}
            title="Lock & Annotate"
            className="bg-brand text-brand-foreground flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            <Lock className="size-3.5 shrink-0" />
            <span className="hidden @[22rem]:inline">
              {isLocking ? "Locking…" : "Lock & Annotate"}
            </span>
            <span className="@[22rem]:hidden">{isLocking ? "…" : "Lock"}</span>
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
 * the material family chosen in the editor (Fabric/Trim) determines the
 * annotation's actual `layer_type`, and that can't be changed after creation
 * (it would invalidate the assigned reference code). A Trim pin's kind
 * (`data.trim_kind`) is just a data field, no such constraint. This renders a
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
  const color = useLayerColours().colourFor("fabric");
  return (
    <>
      {/* Pending-placement marker at the click point. The editor opens centered
          (PinEditorDialog), decoupled from this point so it never clips near an
          edge; the marker still shows where the pin will land on save. */}
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
      <PinEditorDialog
        open
        onOpenChange={(next) => !next && onCancel()}
        title="New Fabrics & Trim pin"
        header={
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            New Fabrics &amp; Trim pin
          </div>
        }
      >
        <FabricTrimPinEditor
          mode="create"
          slotId={slotId}
          x={x}
          y={y}
          libraryItems={libraryItems}
          onCreated={onCreated}
          onCancel={onCancel}
        />
      </PinEditorDialog>
    </>
  );
}

// ---- Draft pin (Colourways: choose/create colourway BEFORE creating) --------

/**
 * A new Colourway pin also defers creation to its editor (like Fabrics & Trim),
 * because the chosen colourway determines the pin's two-level reference code
 * (C1.2) and is immutable afterward. Same pulsing-marker pattern; dismissing
 * without saving never touches the server.
 */
function DraftColourwayPin({
  x,
  y,
  slotWidth,
  slotHeight,
  slotId,
  productId,
  initialHex,
  colourwayContext,
  requestResample,
  onCreated,
  onCancel,
}: {
  x: number;
  y: number;
  slotWidth: number;
  slotHeight: number;
  slotId: string;
  productId: string;
  /** Colour auto-sampled at the click point before the editor opened, or null. */
  initialHex: string | null;
  colourwayContext: ColourwayContext;
  /**
   * Enter image pick-mode to re-sample this draft pin's hex. `resolve` is
   * called exactly once when pick-mode ends: a hex string on a successful
   * sample, `null` on a failed sample, or `undefined` if cancelled.
   */
  requestResample?: (
    resolve: (hex: string | null | undefined) => void,
  ) => void;
  onCreated: (result: {
    id: string;
    referenceCode: string;
    colourway: CanvasColourway;
    data: ColourwayAnnotationData;
  }) => void;
  onCancel: () => void;
}) {
  const color = useLayerColours().colourFor("colourway");

  // Draft state lives here — one level above the editor Dialog — so it survives
  // the Dialog fully closing during "Re-sample" (see useColourwayDraftFields).
  const [open, setOpen] = useState(true);
  const draft = useColourwayDraftFields({
    colour_name: null,
    hex: initialHex,
    pantone: null,
    notes: null,
  });
  const selection = useColourwaySelectionDraft(
    colourwayContext.colourways,
    colourwayContext.lastUsedColourwayId,
  );

  // Genuinely close the editor (not fade it) so its portalled Dialog — and its
  // own outside-click interception — is removed from the DOM entirely, leaving
  // the canvas capture overlay free to receive the sample click.
  function handleRequestResample() {
    if (!requestResample) return;
    setOpen(false);
    requestResample((hex) => {
      if (hex !== undefined) draft.applySample(hex);
      setOpen(true);
    });
  }

  return (
    <>
      {/* Pending-placement marker at the click point (see DraftFabricPin). */}
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
      <PinEditorDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onCancel();
        }}
        title="New Colourway pin"
        header={
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            New Colourway pin
          </div>
        }
      >
        <ColourwayPinEditor
          mode="create"
          slotId={slotId}
          x={x}
          y={y}
          productId={productId}
          draft={draft}
          selection={selection}
          colourways={colourwayContext.colourways}
          onColourwayCreated={colourwayContext.onColourwayCreated}
          onRequestResample={requestResample ? handleRequestResample : undefined}
          onCreated={onCreated}
          onCancel={onCancel}
        />
      </PinEditorDialog>
    </>
  );
}

// ---- Draft pin (Construction: pick sub-type BEFORE creating) ----------------

/**
 * A new Construction pin defers `createAnnotation` until save for the same
 * reason Fabrics & Trim does: the sub-type chosen in the editor (Stitch /
 * Construction Note) IS the pin's `layer_type`, which determines its S/CN
 * reference-code prefix and is immutable after creation. Same pulsing-marker
 * pattern; dismissing without saving never touches the server.
 */
function DraftConstructionPin({
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
  const color = useLayerColours().colourFor("construction");
  return (
    <>
      {/* Pending-placement marker at the click point (see DraftFabricPin). */}
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
      <PinEditorDialog
        open
        onOpenChange={(next) => !next && onCancel()}
        title="New Construction pin"
        header={
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            New Construction pin
          </div>
        }
      >
        <ConstructionPinEditor
          mode="create"
          slotId={slotId}
          x={x}
          y={y}
          libraryItems={libraryItems}
          onCreated={onCreated}
          onCancel={onCancel}
        />
      </PinEditorDialog>
    </>
  );
}

// ---- Draft pin (Branding & Labels: pick family + type BEFORE creating) ------

/**
 * A new Branding & Labels pin defers `createAnnotation` until the editor is
 * saved, exactly like Fabrics & Trim: the family chosen in the editor
 * (Branding/Labels) IS the pin's `layer_type`, which determines its B/L
 * reference-code prefix and is immutable after creation. Same pulsing-marker
 * pattern; dismissing without saving never touches the server.
 */
function DraftBrandingLabelPin({
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
  const color = useLayerColours().colourFor("branding_labels");
  return (
    <>
      {/* Pending-placement marker at the click point (see DraftFabricPin). */}
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
      <PinEditorDialog
        open
        onOpenChange={(next) => !next && onCancel()}
        title="New Branding & Labels pin"
        header={
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            New Branding &amp; Labels pin
          </div>
        }
      >
        <BrandingLabelPinEditor
          mode="create"
          slotId={slotId}
          x={x}
          y={y}
          libraryItems={libraryItems}
          onCreated={onCreated}
          onCancel={onCancel}
        />
      </PinEditorDialog>
    </>
  );
}

// ---- Annotation slot (filled, locked) ---------------------------------------

function AnnotationSlot({
  slot,
  productId,
  activeLayerKey,
  allLayers,
  atAnnotationCap,
  onAnnotationCapBlocked,
  workspaceId,
  libraryItems,
  colourwayContext,
  selectedAnnotationId,
  onAnnotationCreated,
  onAnnotationUpdated,
  onAnnotationMoved,
  onAnnotationLabelOffset,
  onAnnotationDeleted,
  onSelectAnnotation,
}: {
  slot: ResolvedSlot;
  productId: string;
  activeLayerKey: LayerKey;
  allLayers: boolean;
  atAnnotationCap: boolean;
  onAnnotationCapBlocked: () => void;
  workspaceId: string;
  libraryItems: ResolvedLibraryItem[];
  colourwayContext: ColourwayContext;
  selectedAnnotationId: string | null;
} & AnnotationMutationHandlers) {
  const router = useRouter();
  // Live slot-container box (for the design-box scale) vs the click/fraction
  // overlay INSIDE the scaled design box (for pin coordinates) — two elements,
  // two refs, deliberately not shared: the overlay's local size is frozen.
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Decoded intrinsic size for the unclipped painted-box rendering (same
  // ground-truth-over-DB-columns chain as FramingSlot / the sampler).
  const [decodedDims, setDecodedDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  // Per-user "don't warn me about unlocking pinned slots" preference; the
  // checkbox state is per-dialog-open and only persists on confirm.
  const { hideUnlockWarning, setHideUnlockWarning } = useUserPreferences();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isUnlocking, startUnlock] = useTransition();
  // A colourway draft carries the colour auto-sampled at its click point (or null
  // if sampling wasn't possible); other layers ignore `hex`.
  const [draftPoint, setDraftPoint] = useState<{
    x: number;
    y: number;
    hex: string | null;
  } | null>(null);

  // Measurement two-click drawing state: a DEDICATED flag for this layer's
  // two-step line placement, deliberately not shared with `draftPoint` (the
  // single-click layers' pending pin) or `pickMode` (Colourways' sampling) —
  // three distinct interactions, three distinct flags, so no click can ever be
  // routed to the wrong flow. Set by the first click (start point + live
  // cursor for the rubber-band preview); the second click — captured by a
  // dedicated overlay, so it can't land on pins or place anything else —
  // completes the line. Escape or switching layers discards it untouched.
  const [measureDraft, setMeasureDraft] = useState<{
    startX: number;
    startY: number;
    cursorX: number;
    cursorY: number;
  } | null>(null);

  // The measurement line just created by the second click — its editor opens
  // immediately (annotation already exists server-side, unlike the deferred
  // draft-pin editors) to capture name/value/unit.
  const [justCreated, setJustCreated] = useState<CanvasAnnotation | null>(null);

  // Render-time adjustment (documented local-state resync pattern): switching
  // away from the Measurements layer mid-draw — OR into the read-only
  // All-layers composite (which leaves activeLayerKey unchanged, so the layer
  // test alone wouldn't fire) — discards the pending start point so a stale
  // line can never be completed where placement isn't allowed.
  if (measureDraft && (allLayers || activeLayerKey !== "measurement")) {
    setMeasureDraft(null);
  }
  // Likewise discard any pending single-click draft when entering All-layers,
  // so the composite stays strictly read-only.
  if (draftPoint && allLayers) {
    setDraftPoint(null);
  }

  const measureColor = useLayerColours().colourFor("measurement");

  // Colour pick-mode: a DISTINCT flag (not reused draft/placement state) so a
  // re-sample click can never be mistaken for placing a new pin. When set, the
  // next canvas click samples a colour and hands it to `resolve`, rather than
  // creating a pin. `resolve` is called exactly once — with the sampled hex
  // (or null on failure) on a genuine sample, or `undefined` on cancel/escape —
  // so the requesting popover (already fully closed, not just faded) knows to
  // reopen either way.
  const [pickMode, setPickMode] = useState<{
    resolve: (hex: string | null | undefined) => void;
  } | null>(null);

  // Track the slot CONTAINER's live size. Since the frozen design-space box
  // (0025), this no longer sizes the annotation layout — it only drives the
  // uniform scale `k` that fits the frozen box into the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- Frozen design-space box (the resize-drift fix, 0025) -----------------
  // The locked layout is laid out at the slot's LOCK-TIME size — the exact
  // local-px space the framing pan was authored in — and scaled to the live
  // container as ONE UNIT. Pins (`fraction × design size`) and the garment
  // (base-fit + px pan against the design size) therefore share a coordinate
  // space that never changes; a container resize (fullscreen portal swap,
  // smaller dashboard render) only changes the uniform `k`, the same
  // proven-shift-free mechanism as stageZoom. The nullable columns fall back
  // to the live size (k = 1) — exactly the pre-0025 behaviour — though after
  // the 0025 reset every locked slot records its dims.
  const designW = slot.lock_width ?? size.width;
  const designH = slot.lock_height ?? size.height;
  // Contain-fit, centred: uniform (aspect preserved), never clipped. The live
  // box normally matches the design box's aspect (the same grid layout
  // produced both), but fullscreen/dashboard renders can differ — any gutters
  // are honest letterboxing of the frozen design space.
  const k =
    designW > 0 && designH > 0 && size.width > 0 && size.height > 0
      ? Math.min(size.width / designW, size.height / designH)
      : 0;
  const boxLeft = (size.width - designW * k) / 2;
  const boxTop = (size.height - designH * k) / 2;

  // Sample the true image colour at a 0–1 slot coordinate, via the shared
  // sampler that mirrors the display transform. Returns null (→ manual entry)
  // when the asset is missing, the slot isn't measured yet, or CORS blocks the read.
  const sampleAt = useCallback(
    async (xFraction: number, yFraction: number): Promise<string | null> => {
      const asset = slot.asset;
      if (!asset || designW === 0 || designH === 0) return null;
      return sampleColourAtPoint(
        { file_url: asset.file_url, width: asset.width, height: asset.height },
        {
          crop_x: slot.crop_x,
          crop_y: slot.crop_y,
          zoom: slot.zoom,
          fit_mode: slot.fit_mode,
        },
        designW,
        designH,
        xFraction,
        yFraction,
      );
    },
    [
      slot.asset,
      slot.crop_x,
      slot.crop_y,
      slot.zoom,
      slot.fit_mode,
      designW,
      designH,
    ],
  );

  // Called by an open colourway editor's "Re-sample" button — arm pick-mode; the
  // next canvas click samples and feeds the result back through `resolve`.
  const requestResample = useCallback(
    (resolve: (hex: string | null | undefined) => void) => {
      setPickMode({ resolve });
    },
    [],
  );

  // Leaves pick-mode WITHOUT sampling — resolve(undefined) tells the caller "no
  // change," distinct from resolve(null) which means "sampled but it failed."
  const cancelPickMode = useCallback(() => {
    pickMode?.resolve(undefined);
    setPickMode(null);
  }, [pickMode]);

  // Escape leaves pick-mode without changing the hex. Capture phase +
  // preventDefault, mirroring Radix's own escape handling: during pick-mode
  // the editor popover is genuinely CLOSED (no DismissableLayer exists to
  // claim the key), and the fullscreen editor exits on any UNCLAIMED Escape —
  // without the claim, cancelling a sample would also eject to the launchpad
  // and destroy the in-progress pin draft.
  useEffect(() => {
    if (!pickMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPickMode();
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [pickMode, cancelPickMode]);

  // Escape mid-draw cancels the measurement line cleanly: discard the start
  // point, create nothing. (Mirrors the pick-mode escape above — separate
  // effect because the two modes are separate flags; same capture-phase claim
  // so the cancel never doubles as an exit-the-editor Escape.)
  useEffect(() => {
    if (!measureDraft) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMeasureDraft(null);
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [measureDraft]);

  /**
   * Second click of the measurement flow: create the line annotation NOW —
   * `pin_type: 'line'` with both endpoints, reference code from the same
   * unchanged `createAnnotation` path as every layer — then open its editor
   * to capture name/value/unit. A second click (nearly) on top of the start
   * point is ignored (still drawing) so an accidental double-click can't
   * produce a degenerate zero-length dimension.
   */
  async function completeMeasurementLine(endX: number, endY: number) {
    const draft = measureDraft;
    if (!draft) return;
    const px = Math.hypot(
      (endX - draft.startX) * designW,
      (endY - draft.startY) * designH,
    );
    if (px < 4) return;
    setMeasureDraft(null);
    try {
      const result = await createAnnotation(
        slot.id,
        "measurement",
        draft.startX,
        draft.startY,
        "line",
        endX,
        endY,
      );
      const annotation: CanvasAnnotation = {
        id: result.id,
        slot_id: slot.id,
        workspace_id: workspaceId,
        layer_type: "measurement",
        reference_code: result.referenceCode,
        x: draft.startX,
        y: draft.startY,
        pin_type: "line",
        end_x: endX,
        end_y: endY,
        label_offset_x: null,
        label_offset_y: null,
        colourway_id: null,
        data: {},
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onAnnotationCreated(slot.id, annotation);
      setJustCreated(annotation);
    } catch {
      toast.error("Could not place the measurement.");
    }
  }

  async function handleSampleClick(e: React.MouseEvent<HTMLDivElement>) {
    const current = pickMode;
    if (!current) return;
    const { x, y } = clientToFraction(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect(),
    );
    // Exit pick-mode immediately so the capture layer clears; the (fast) sample
    // then flows back into the hex field once it resolves.
    setPickMode(null);
    const hex = await sampleAt(x, y);
    current.resolve(hex);
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    // Per-page annotation cap: block placement (all layers, all pin types) and
    // point the user at Duplicate page. Never blocks editing/moving/deleting —
    // those don't route through here — and the count drops the moment a pin is
    // deleted, re-enabling placement. Server enforces the same cap
    // authoritatively.
    if (atAnnotationCap) {
      onAnnotationCapBlocked();
      return;
    }
    // 0–1 fractions of the slot via the shared helper — the exact same math the
    // pin tip-drag reuses on release, so a click and a drag onto the same point
    // land identically.
    const { x, y } = clientToFraction(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect(),
    );

    // Every layer now routes through a dedicated flow — the old immediate
    // point-create path (and its [TIMING] instrumentation) is gone, along with
    // the latency it was investigating; nothing placed a bare pin on click
    // anymore once Measurements moved to two-click:
    //  • Fabrics & Trim / Construction / Branding & Labels defer creation to
    //    their editor (the chosen sub-type/family decides the immutable
    //    reference-code prefix).
    //  • Colourways samples the clicked pixel first, then defers likewise.
    //  • Measurements arms the two-click line draw — the FIRST click only
    //    records the start point; the second is captured by the dedicated
    //    drawing overlay (never this handler), so the two placement styles
    //    can't interfere.
    if (
      activeLayerKey === "fabric" ||
      activeLayerKey === "construction" ||
      activeLayerKey === "branding_labels"
    ) {
      setDraftPoint({ x, y, hex: null });
      return;
    }
    if (activeLayerKey === "colourway") {
      // Auto-sample the colour at the exact click point, then open the editor
      // with the hex pre-filled. Sampling failure is silent here — the editor
      // just opens with an empty hex, ready for manual entry (never a crash).
      void sampleAt(x, y).then((hex) => setDraftPoint({ x, y, hex }));
      return;
    }
    // Measurements (the only remaining layer key).
    setMeasureDraft({ startX: x, startY: y, cursorX: x, cursorY: y });
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
      label_offset_x: null,
      label_offset_y: null,
      colourway_id: null,
      data: result.data as unknown as Json,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setDraftPoint(null);
  }

  function handleColourwayDraftCreated(result: {
    id: string;
    referenceCode: string;
    colourway: CanvasColourway;
    data: ColourwayAnnotationData;
  }) {
    if (!draftPoint) return;
    // The resolved colourway may have been auto-created server-side (first pin);
    // upsert it into product state and mark it the last-used one.
    colourwayContext.onColourwayCreated(result.colourway);
    colourwayContext.onColourwayUsed(result.colourway.id);
    onAnnotationCreated(slot.id, {
      id: result.id,
      slot_id: slot.id,
      workspace_id: workspaceId,
      layer_type: "colourway",
      reference_code: result.referenceCode,
      x: draftPoint.x,
      y: draftPoint.y,
      pin_type: "point",
      end_x: null,
      end_y: null,
      label_offset_x: null,
      label_offset_y: null,
      colourway_id: result.colourway.id,
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
    // Warn only when there are pins to misalign AND the user hasn't opted out;
    // a pin-free slot (or a dismissed warning) unlocks silently. Unlocking
    // itself never clears or moves pins either way.
    if (slot.annotations.length > 0 && !hideUnlockWarning) {
      setUnlockConfirm(true);
    } else {
      doUnlock();
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl"
      style={{ height: "100%" }}
    >
      {/* The frozen design-space box: image, pins, drafts and capture
          overlays all live in LOCK-TIME coordinates and scale together as one
          unit — so nothing inside can drift relative to anything else at any
          container size. Slot chrome (toolbar, mode banners) stays outside,
          unscaled; editor dialogs portal to document.body so an ancestor
          transform never affects them. */}
      <div
        className="absolute"
        style={{
          left: boxLeft,
          top: boxTop,
          width: designW,
          height: designH,
          transform: `scale(${k})`,
          transformOrigin: "top left",
        }}
      >
      {/* Frozen image at the locked framing — unclipped painted box so large
          locked pans render fully (and exactly as the sampler models them). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slot.asset!.file_url}
        alt={slot.asset!.name}
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            setDecodedDims({ w: el.naturalWidth, h: el.naturalHeight });
          }
        }}
        style={{
          ...(paintedImageStyle(
            decodedDims?.w ?? slot.asset?.width ?? null,
            decodedDims?.h ?? slot.asset?.height ?? null,
            designW,
            designH,
            slot.crop_x,
            slot.crop_y,
            slot.zoom,
            normaliseFitMode(slot.fit_mode),
          ) ?? {
            position: "absolute",
            transform: slotImageCssTransform(slot.crop_x, slot.crop_y, slot.zoom),
            transformOrigin: "center",
            width: "100%",
            height: "100%",
            objectFit: slotImageObjectFit(normaliseFitMode(slot.fit_mode)),
          }),
          pointerEvents: "none",
        }}
      />

      {/* Click overlay for placing pins — the Konva stage replaces this next
          session. In the All-layers composite it becomes an inert layer (no
          crosshair, no placement) so the view is a pure read-only preview. */}
      <div
        ref={overlayRef}
        className={cn("absolute inset-0", allLayers ? "" : "cursor-crosshair")}
        onClick={allLayers ? undefined : handleCanvasClick}
        data-slot-id={slot.id}
      />

      {/* Existing pins. Per-layer view: active-layer pins interactive, others
          dimmed for context. All-layers composite: every pin non-interactive
          but at FULL opacity — exactly what the PDF page will show.
          Measurement LINES (pin_type 'line') render as dimension arrows via
          MeasurementLinePin; every point pin keeps the standard AnnotationPin. */}
      {slot.annotations.map((annotation) => {
        const interactive =
          !allLayers &&
          layerForType(annotation.layer_type)?.key === activeLayerKey;
        // Dim only inactive-layer context pins in a per-layer view; the
        // all-layers preview shows everything full-strength.
        const dimmed = !allLayers && !interactive;
        return annotation.pin_type === "line" ? (
          <MeasurementLinePin
            key={annotation.id}
            annotation={annotation}
            slotWidth={designW}
            slotHeight={designH}
            interactive={interactive}
            dimmed={dimmed}
            isSelected={annotation.id === selectedAnnotationId}
            getSlotRect={() =>
              overlayRef.current?.getBoundingClientRect() ?? null
            }
            onUpdated={(id, data) => onAnnotationUpdated(slot.id, id, data)}
            onMoved={(id, x, y, endX, endY) =>
              onAnnotationMoved(slot.id, id, x, y, endX, endY)
            }
            onDeleted={(id) => onAnnotationDeleted(slot.id, id)}
            onSelected={onSelectAnnotation}
          />
        ) : (
          <AnnotationPin
            key={annotation.id}
            annotation={annotation}
            slotWidth={designW}
            slotHeight={designH}
            interactive={interactive}
            dimmed={dimmed}
            isSelected={annotation.id === selectedAnnotationId}
            libraryItems={libraryItems}
            colourways={colourwayContext.colourways}
            getSlotRect={() =>
              overlayRef.current?.getBoundingClientRect() ?? null
            }
            requestResample={requestResample}
            onUpdated={(id, data) => onAnnotationUpdated(slot.id, id, data)}
            onMoved={(id, x, y) => onAnnotationMoved(slot.id, id, x, y)}
            onLabelOffsetChanged={(id, ox, oy) =>
              onAnnotationLabelOffset(slot.id, id, ox, oy)
            }
            onDeleted={(id) => onAnnotationDeleted(slot.id, id)}
            onSelected={onSelectAnnotation}
          />
        );
      })}

      {draftPoint && activeLayerKey === "fabric" && (
        <DraftFabricPin
          x={draftPoint.x}
          y={draftPoint.y}
          slotWidth={designW}
          slotHeight={designH}
          slotId={slot.id}
          libraryItems={libraryItems}
          onCreated={handleDraftCreated}
          onCancel={() => setDraftPoint(null)}
        />
      )}

      {draftPoint && activeLayerKey === "construction" && (
        <DraftConstructionPin
          x={draftPoint.x}
          y={draftPoint.y}
          slotWidth={designW}
          slotHeight={designH}
          slotId={slot.id}
          libraryItems={libraryItems}
          onCreated={handleDraftCreated}
          onCancel={() => setDraftPoint(null)}
        />
      )}

      {draftPoint && activeLayerKey === "branding_labels" && (
        <DraftBrandingLabelPin
          x={draftPoint.x}
          y={draftPoint.y}
          slotWidth={designW}
          slotHeight={designH}
          slotId={slot.id}
          libraryItems={libraryItems}
          onCreated={handleDraftCreated}
          onCancel={() => setDraftPoint(null)}
        />
      )}

      {draftPoint && activeLayerKey === "colourway" && (
        <DraftColourwayPin
          x={draftPoint.x}
          y={draftPoint.y}
          slotWidth={designW}
          slotHeight={designH}
          slotId={slot.id}
          productId={productId}
          initialHex={draftPoint.hex}
          colourwayContext={colourwayContext}
          requestResample={requestResample}
          onCreated={handleColourwayDraftCreated}
          onCancel={() => setDraftPoint(null)}
        />
      )}

      {/* Measurement drawing mode: after the first click armed the line, a
          dedicated capture layer above everything (same construction as the
          colour pick-mode layer below — the two are separate flags on separate
          layers and can never co-occur) takes the live cursor for the
          rubber-band preview and the SECOND click as the end point. Because it
          sits above every pin, that click can't open an editor or place a
          single-click pin — and because the preview + completion both use the
          shared clientToFraction on the same inset-0 rect, the previewed line
          and the saved line are byte-identical. */}
      {measureDraft && (
        <>
          <div
            className="absolute inset-0 z-30 cursor-crosshair"
            data-measure-draw="true"
            onPointerMove={(e) => {
              const f = clientToFraction(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              );
              setMeasureDraft((prev) =>
                prev ? { ...prev, cursorX: f.x, cursorY: f.y } : prev,
              );
            }}
            onClick={(e) => {
              const f = clientToFraction(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              );
              void completeMeasurementLine(f.x, f.y);
            }}
          />
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
          >
            <line
              x1={measureDraft.startX * designW}
              y1={measureDraft.startY * designH}
              x2={measureDraft.cursorX * designW}
              y2={measureDraft.cursorY * designH}
              stroke={measureColor}
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
              opacity={0.85}
            />
            <circle
              cx={measureDraft.startX * designW}
              cy={measureDraft.startY * designH}
              r={3.5}
              fill={measureColor}
              stroke="#ffffff"
              strokeWidth={1.5}
            />
          </svg>
        </>
      )}

      {/* The measurement line just placed by the second click: its editor opens
          immediately to capture name/value/unit. The annotation already exists
          (created with its M-code by the standard path), so this is a plain
          edit — closing without saving keeps the line, which the list panel
          shows with a "No value yet" hint. */}
      {justCreated && (
        <PinEditorDialog
          open
          onOpenChange={(next) => {
            if (!next) setJustCreated(null);
          }}
          title={`Edit ${justCreated.reference_code}`}
          header={
            <div className="flex items-center justify-between">
              <span
                className="rounded-md px-2 py-0.5 text-xs font-bold"
                style={{
                  backgroundColor: measureColor,
                  color: readableTextOn(measureColor),
                }}
              >
                {justCreated.reference_code}
              </span>
              <span className="text-muted-foreground text-xs capitalize">
                {justCreated.layer_type}
              </span>
            </div>
          }
        >
          <MeasurementPinEditor
            annotation={justCreated}
            onSaved={(data) => {
              onAnnotationUpdated(slot.id, justCreated.id, data);
              setJustCreated(null);
            }}
            onDeleted={() => {
              onAnnotationDeleted(slot.id, justCreated.id);
              setJustCreated(null);
            }}
          />
        </PinEditorDialog>
      )}

      {/* Colour pick-mode: a crosshair capture layer above everything in the slot
          that intercepts the next click as a colour sample (never a new pin), plus
          an unobtrusive banner. Distinct from the place-a-pin overlay, so the two
          interactions can't be confused. */}
      {pickMode && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair"
          onClick={handleSampleClick}
          data-colour-pick="true"
        />
      )}
      </div>

      {/* Mode banners — slot-level chrome, outside the scaled design box so
          they never shrink or grow with k; as later siblings they sit above
          the box, exactly as they sat above the capture layers before. */}
      {measureDraft && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white shadow-lg">
            <span>Click to set the end point of the measurement</span>
            <button
              type="button"
              onClick={() => setMeasureDraft(null)}
              className="font-medium underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {pickMode && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white shadow-lg">
            <span>Click anywhere on the image to sample that colour</span>
            <button
              type="button"
              onClick={cancelPickMode}
              className="font-medium underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Slot name chip — top-left, above the design box. Hidden with the rest
          of the editing chrome during capture modes and in the read-only
          All-layers preview. */}
      {!allLayers && !measureDraft && !pickMode && (
        <div className="absolute top-2 left-2 z-40">
          <SlotNameEditor slotId={slot.id} name={slot.name} />
        </div>
      )}

      {/* Toolbar — hidden while a capture mode is active. The capture layer
          used to cover the whole slot (including this chrome); now that it is
          scoped to the design box, hiding the toolbar preserves the exact
          "the next click cannot hit slot chrome" behaviour. Also hidden in the
          All-layers composite, which is a read-only preview. */}
      {!allLayers && !measureDraft && !pickMode && (
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
      )}

      <AlertDialog
        open={unlockConfirm}
        onOpenChange={(open) => {
          setUnlockConfirm(open);
          if (!open) setDontShowAgain(false); // fresh checkbox per open
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this image?</AlertDialogTitle>
            <AlertDialogDescription>
              This slot has annotations. Re-framing the image may move them out
              of position, you can drag them back into place afterwards.
              Unlock anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-foreground size-4"
            />
            Don&apos;t show this again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUnlocking}
              onClick={(e) => {
                e.preventDefault();
                // Persist the opt-out only when the user actually proceeds.
                if (dontShowAgain) setHideUnlockWarning(true);
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
