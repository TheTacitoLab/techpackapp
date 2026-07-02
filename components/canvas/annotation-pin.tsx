"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAnnotationSummary } from "@/components/canvas/annotation-summary";
import { clientToFraction } from "@/components/canvas/coords";
import { FabricTrimPinEditor } from "@/components/canvas/fabric-trim-pin-editor";
import {
  colourForLayerType,
  layerForType,
  readableTextOn,
} from "@/components/canvas/layers";
import {
  deleteAnnotation,
  moveAnnotation,
  updateAnnotation,
  updateLabelOffset,
} from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type { CanvasAnnotation, ResolvedLibraryItem } from "@/types";

/** Read a string field out of the annotation's freeform `data` jsonb. */
function readString(data: CanvasAnnotation["data"], key: string): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

// Movement past this many screen pixels between pointerdown and pointerup turns
// a "click" (open the editor) into a "drag" (move the tip / peel the badge).
const DRAG_THRESHOLD_PX = 4;

// The badge's default resting place when it has no persisted offset: centered
// horizontally on the tip (x = 0) and a short hop above it (y, a slot-height
// fraction ≈ the old fixed 20px gap on a standard-height slot).
const DEFAULT_OFFSET_X = 0;
const DEFAULT_OFFSET_Y = -0.04;

// Keep a dragged badge inside the slot so it can never be flung off-screen and
// become unreachable.
const OFFSET_LIMIT = 0.9;
function clampOffset(value: number): number {
  return Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, value));
}

type DragPoint = { clientX: number; clientY: number; dx: number; dy: number };

/**
 * Pointer-based click-vs-drag disambiguation shared by the tip and the badge.
 * A press that never travels past `DRAG_THRESHOLD_PX` counts as a click (opens
 * the editor); any real movement is a drag (repositions), and suppresses the
 * click entirely. `active` is non-null only once a gesture has crossed the
 * threshold, giving callers a live delta to render the drag against while
 * leaving a plain click untouched. Callbacks are read through refs so the
 * window listeners never need re-binding mid-gesture.
 */
function usePointerDrag(onDragEnd: (p: DragPoint) => void, onClick: () => void): {
  active: DragPoint | null;
  onPointerDown: (e: React.PointerEvent) => void;
} {
  const [active, setActive] = useState<DragPoint | null>(null);
  const endRef = useRef(onDragEnd);
  const clickRef = useRef(onClick);
  // Keep the refs pointing at the latest callbacks so the window listeners
  // attached on pointerdown always fire the current closures — updated in an
  // effect (never during render) so a re-render mid-gesture stays consistent.
  useEffect(() => {
    endRef.current = onDragEnd;
    clickRef.current = onClick;
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Don't let the press reach the slot's place-a-new-pin click handler.
    e.stopPropagation();
    const originX = e.clientX;
    const originY = e.clientY;
    let moved = false;

    function handleMove(ev: PointerEvent) {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) moved = true;
      if (moved) setActive({ clientX: ev.clientX, clientY: ev.clientY, dx, dy });
    }
    function handleUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setActive(null);
      if (moved) {
        endRef.current({
          clientX: ev.clientX,
          clientY: ev.clientY,
          dx: ev.clientX - originX,
          dy: ev.clientY - originY,
        });
      } else {
        clickRef.current();
      }
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, []);

  return { active, onPointerDown };
}

/**
 * The thin line connecting the tip (its origin, 0,0) to the badge (toX, toY,
 * tip-relative px). Recomputed every render — default position or dragged — so
 * it tracks the badge live during a drag. `overflow-visible` on a 1px SVG lets
 * the line paint out to negative/large coordinates without a sized viewport.
 */
function LeaderLine({
  toX,
  toY,
  color,
}: {
  toX: number;
  toY: number;
  color: string;
}) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute overflow-visible"
      style={{ left: 0, top: 0, width: 1, height: 1 }}
    >
      <line
        x1={0}
        y1={0}
        x2={toX}
        y2={toY}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A single annotation pin: a small precise TIP (a filled dot) whose exact
 * center sits on the clicked coordinate, with the reference-code BADGE
 * floating a fixed distance above it on a thin leader line — the badge labels
 * the point without covering it.
 *
 * Anchor precision (see the tip `<span>` below): the tip is the pin's ONLY
 * in-flow child, sized 6px (`size-1.5`). The outer element is positioned at
 * `(left, top) = (x*slotWidth, y*slotHeight)` with `-translate-x-1/2
 * -translate-y-1/2`, so its 6x6 content box — which IS the tip — ends up
 * centered exactly on `(left, top)`. The badge+leader are `position: absolute`
 * (out of flow), so they can never perturb that box or its center; they're
 * anchored via `bottom-full`, which places their own bottom edge at the outer
 * box's top edge (i.e. right at the tip), and stack upward from there.
 * `stageZoom` (a uniform scale on the whole grid) and per-slot framing `zoom`
 * (applied only to the frozen `<img>`, never this overlay) cannot affect this
 * local-coordinate math — both scale the whole subtree uniformly, so the tip
 * stays exactly on the originally-clicked screen pixel at any zoom.
 *
 * Fabrics & Trim pins (layer_type fabric/trim/hardware/elastic) open the
 * dedicated `FabricTrimPinEditor`; every other layer keeps the generic
 * label/notes form for now. Edit popover and delete call server actions, then
 * report the result up via `onUpdated`/`onDeleted` so the parent slot can
 * update its local annotation list directly — no `router.refresh()` / full
 * page re-fetch on every edit.
 *
 * Two drags live on this element, each disambiguated from a plain click by a
 * small movement threshold (see `usePointerDrag`): dragging the TIP moves the
 * annotation's real x/y (via `moveAnnotation`), dragging the BADGE peels the
 * label away from the tip along a dynamic leader line without touching the
 * anchor (via `updateLabelOffset`). Both persist once on release and update
 * local state optimistically, matching the no-refresh CRUD pattern. Because
 * only the badge's offset is new, a pin with no persisted offset renders
 * exactly as before. The popover is fully controlled so a genuine drag can
 * suppress it from opening.
 */
export function AnnotationPin({
  annotation,
  slotWidth,
  slotHeight,
  interactive = true,
  isSelected = false,
  libraryItems,
  getSlotRect,
  onUpdated,
  onDeleted,
  onMoved,
  onLabelOffsetChanged,
  onSelected,
}: {
  annotation: CanvasAnnotation;
  slotWidth: number;
  slotHeight: number;
  interactive?: boolean;
  isSelected?: boolean;
  libraryItems: ResolvedLibraryItem[];
  getSlotRect: () => DOMRect | null;
  onUpdated?: (id: string, data: Record<string, unknown>) => void;
  onDeleted?: (id: string) => void;
  onMoved?: (id: string, x: number, y: number) => void;
  onLabelOffsetChanged?: (
    id: string,
    offsetX: number | null,
    offsetY: number | null,
  ) => void;
  onSelected?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const color = colourForLayerType(annotation.layer_type);
  const textColor = readableTextOn(color);
  const isFabricFamily = layerForType(annotation.layer_type)?.key === "fabric";

  // Badge offset (slot fractions, relative to the tip). null on an axis means
  // "use the default," so untouched pins render exactly as before.
  const baseOffsetX = annotation.label_offset_x ?? DEFAULT_OFFSET_X;
  const baseOffsetY = annotation.label_offset_y ?? DEFAULT_OFFSET_Y;

  // ---- Tip drag: moves the annotation's real x/y ---------------------------
  const tipDrag = usePointerDrag(
    ({ clientX, clientY }) => {
      const rect = getSlotRect();
      if (!rect) return;
      const { x, y } = clientToFraction(clientX, clientY, rect);
      const prevX = annotation.x;
      const prevY = annotation.y;
      onMoved?.(annotation.id, x, y); // optimistic
      void moveAnnotation(annotation.id, x, y).catch(() => {
        toast.error("Could not move the pin.");
        onMoved?.(annotation.id, prevX, prevY); // revert
      });
    },
    () => setOpen(true),
  );

  // ---- Badge drag: peels the label off the tip -----------------------------
  const badgeDrag = usePointerDrag(
    ({ dx, dy }) => {
      const rect = getSlotRect();
      if (!rect) return;
      const offsetX = clampOffset(baseOffsetX + dx / rect.width);
      const offsetY = clampOffset(baseOffsetY + dy / rect.height);
      const prevX = annotation.label_offset_x;
      const prevY = annotation.label_offset_y;
      onLabelOffsetChanged?.(annotation.id, offsetX, offsetY); // optimistic
      void updateLabelOffset(annotation.id, offsetX, offsetY).catch(() => {
        toast.error("Could not move the label.");
        onLabelOffsetChanged?.(annotation.id, prevX, prevY); // revert
      });
    },
    () => setOpen(true),
  );

  // Tip position — the live drag position while dragging, else the stored x/y.
  // Fractions of the slot's rendered size, never raw stored pixels.
  let tipX = annotation.x;
  let tipY = annotation.y;
  if (tipDrag.active) {
    const rect = getSlotRect();
    if (rect) {
      const f = clientToFraction(
        tipDrag.active.clientX,
        tipDrag.active.clientY,
        rect,
      );
      tipX = f.x;
      tipY = f.y;
    }
  }
  const left = tipX * slotWidth;
  const top = tipY * slotHeight;

  // While the badge is being dragged the live delta is layered on the base.
  let offsetX = baseOffsetX;
  let offsetY = baseOffsetY;
  if (badgeDrag.active) {
    const rect = getSlotRect();
    if (rect) {
      offsetX = clampOffset(baseOffsetX + badgeDrag.active.dx / rect.width);
      offsetY = clampOffset(baseOffsetY + badgeDrag.active.dy / rect.height);
    }
  }
  const badgeLeft = offsetX * slotWidth;
  const badgeTop = offsetY * slotHeight;

  const [label, setLabel] = useState(() => readString(annotation.data, "label"));
  const [notes, setNotes] = useState(() => readString(annotation.data, "notes"));

  // Two-way sync with the list panel: scroll this pin into view when it
  // becomes the selected row (works across a page switch too, since this
  // effect fires on mount as well as on isSelected changing).
  useEffect(() => {
    if (isSelected) {
      wrapperRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, [isSelected]);

  // Inactive-layer pins are context only: dimmed and non-interactive (no
  // popover, no drag) — but they still honour a persisted custom badge offset.
  if (!interactive) {
    return (
      <span
        aria-hidden
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left, top, opacity: 0.3, pointerEvents: "none" }}
      >
        <span className="absolute top-1/2 left-1/2">
          <LeaderLine toX={badgeLeft} toY={badgeTop} color={color} />
          <span
            className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-1 ring-black/10"
            style={{
              left: badgeLeft,
              top: badgeTop,
              backgroundColor: color,
              color: textColor,
            }}
          >
            {annotation.reference_code}
          </span>
        </span>
        <span
          className="block size-1.5 rounded-full ring-2 ring-white"
          style={{ backgroundColor: color }}
        />
      </span>
    );
  }

  const summary = getAnnotationSummary(annotation);

  function handleSave() {
    startSave(async () => {
      try {
        const data = { label, notes };
        await updateAnnotation(annotation.id, data);
        toast.success("Annotation saved.");
        setOpen(false);
        onUpdated?.(annotation.id, data);
      } catch {
        toast.error("Could not save the annotation.");
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      try {
        await deleteAnnotation(annotation.id);
        toast.success("Annotation deleted.");
        setOpen(false);
        onDeleted?.(annotation.id);
      } catch {
        toast.error("Could not delete the annotation.");
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onSelected?.(annotation.id);
        if (!next) setConfirmingDelete(false);
      }}
    >
      <span
        ref={wrapperRef}
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left, top }}
      >
        {/* Leader line + badge — absolutely positioned with their origin at the
            tip center (this span's own center), so they can never affect the
            tip's box or its anchor precision. The badge is independently
            draggable to peel the label off a busy area. */}
        <span className="absolute top-1/2 left-1/2">
          <LeaderLine toX={badgeLeft} toY={badgeTop} color={color} />
          <span
            role="button"
            tabIndex={0}
            aria-label={`Move label ${annotation.reference_code}`}
            onPointerDown={badgeDrag.onPointerDown}
            onClick={(e) => {
              // Keyboard-synthesized clicks (detail 0) open the editor; real
              // pointer clicks are already handled by usePointerDrag.
              if (e.detail === 0) setOpen(true);
            }}
            className={cn(
              "absolute flex size-5 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-1 ring-black/10 outline-none select-none focus-visible:ring-2 focus-visible:ring-black/30",
              badgeDrag.active ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{
              left: badgeLeft,
              top: badgeTop,
              backgroundColor: color,
              color: textColor,
            }}
          >
            {annotation.reference_code}
          </span>
        </span>

        {/* Tip — the sole in-flow child; its 6x6 box IS what gets centered on
            (left, top) by the translate above. It anchors the popover, triggers
            the tooltip, and is draggable to move the annotation itself. */}
        <Tooltip
          open={open || tipDrag.active || badgeDrag.active ? false : undefined}
        >
          <PopoverAnchor asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Annotation ${annotation.reference_code}`}
                onPointerDown={tipDrag.onPointerDown}
                onClick={(e) => {
                  if (e.detail === 0) setOpen(true);
                }}
                className={cn(
                  "block size-1.5 touch-none rounded-full outline-none",
                  tipDrag.active ? "cursor-grabbing" : "cursor-grab",
                  isSelected
                    ? "ring-brand ring-2 ring-offset-2"
                    : "ring-2 ring-white",
                )}
                style={{ backgroundColor: color }}
              />
            </TooltipTrigger>
          </PopoverAnchor>
          <TooltipContent side="top">
            <span className="font-semibold">{annotation.reference_code}</span>
            {" — "}
            {summary.title}
            {summary.detail ? ` · ${summary.detail}` : ""}
          </TooltipContent>
        </Tooltip>
      </span>
      <PopoverContent
        align="center"
        className={isFabricFamily ? "w-80 space-y-3" : "w-64 space-y-3"}
      >
        <div className="flex items-center justify-between">
          <span
            className="rounded-md px-2 py-0.5 text-xs font-bold"
            style={{ backgroundColor: color, color: textColor }}
          >
            {annotation.reference_code}
          </span>
          <span className="text-muted-foreground text-xs capitalize">
            {annotation.layer_type.replace("_", " ")}
          </span>
        </div>

        {isFabricFamily ? (
          <FabricTrimPinEditor
            mode="edit"
            annotation={annotation}
            libraryItems={libraryItems}
            onSaved={(data) => {
              setOpen(false);
              onUpdated?.(annotation.id, data);
            }}
            onDeleted={() => {
              setOpen(false);
              onDeleted?.(annotation.id);
            }}
          />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`pin-label-${annotation.id}`} className="text-xs">
                Label
              </Label>
              <Input
                id={`pin-label-${annotation.id}`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Main body fabric"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`pin-notes-${annotation.id}`} className="text-xs">
                Notes
              </Label>
              <Textarea
                id={`pin-notes-${annotation.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the factory should know…"
                className="min-h-16"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={handleDelete}
                  >
                    {isDeleting ? "Deleting…" : "Confirm"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={isSaving}
                onClick={handleSave}
              >
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
