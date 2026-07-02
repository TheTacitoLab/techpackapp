"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAnnotationSummary } from "@/components/canvas/annotation-summary";
import { usePointerDrag } from "@/components/canvas/annotation-pin";
import { clientToFraction } from "@/components/canvas/coords";
import {
  colourForLayerType,
  readableTextOn,
} from "@/components/canvas/layers";
import {
  formatMeasurementValue,
  readMeasurementData,
} from "@/components/canvas/measurement-data";
import { MeasurementPinEditor } from "@/components/canvas/measurement-pin-editor";
import { PinEditorDialog } from "@/components/canvas/pin-editor-dialog";
import { moveAnnotation } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type { CanvasAnnotation } from "@/types";

// Arrowhead wing length (px) and half-angle — the classic dimension-arrow
// look. Wings are longer than the endpoint handles' radius so the arrowheads
// stay visible past the grab dots sitting on the line ends.
const ARROW_LENGTH = 12;
const ARROW_ANGLE = Math.PI / 7;

// The label pill floats this many px off the line's midpoint, along the
// perpendicular that points "upward" on screen, so it never sits on the line.
const PILL_OFFSET = 14;

/** Rotate the unit vector (ux, uy) by `angle` radians. */
function rotate(ux: number, uy: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [ux * cos - uy * sin, ux * sin + uy * cos];
}

/**
 * SVG path for a straight double-headed dimension arrow from (sx, sy) to
 * (ex, ey) in slot pixels: the line itself plus two wing strokes at each end,
 * computed explicitly from the line's direction rather than SVG `<marker>`
 * defs — marker ids are document-global, and one annotation per SVG would need
 * unique ids per pin; explicit wings have no such hazard and track live drags
 * for free. Degenerate (zero-length) lines get no wings, just the dot-like line.
 */
function dimensionArrowPath(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): string {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  let d = `M ${sx} ${sy} L ${ex} ${ey}`;
  if (len < 1) return d;
  const ux = dx / len;
  const uy = dy / len;
  // Wings at the END point back toward the start; at the START, toward the end.
  for (const [px, py, wx, wy] of [
    [ex, ey, -ux, -uy],
    [sx, sy, ux, uy],
  ] as const) {
    for (const sign of [1, -1] as const) {
      const [rx, ry] = rotate(wx, wy, ARROW_ANGLE * sign);
      d += ` M ${px} ${py} L ${px + rx * ARROW_LENGTH} ${py + ry * ARROW_LENGTH}`;
    }
  }
  return d;
}

/**
 * A measurement dimension line: a straight double-headed amber arrow between
 * two draggable endpoints, labelled by a midpoint pill carrying the reference
 * code (M1, M2…) and, once entered, the value + unit ("60mm") — the industry
 * dimension-callout look. Rendered for `pin_type === 'line'` annotations by
 * `AnnotationPin`'s dispatch; the single-point pin rendering is untouched.
 *
 * Geometry: `x/y` (start) and `end_x/end_y` (end) are 0–1 fractions of the
 * slot's rendered size, converted to pixels here exactly like point pins
 * (`fraction * slotWidth/Height`), and endpoint drags convert back through the
 * shared `clientToFraction` — the same math as every other canvas interaction,
 * so a drag release and a fresh click on the same screen point are identical.
 * Both endpoint drags persist through the existing `moveAnnotation(id, x, y,
 * endX, endY)` (which always receives all four coordinates, keeping the
 * untouched endpoint stable), optimistically patched via `onMoved` with
 * revert-on-error — the standard no-refresh CRUD pattern.
 *
 * The pill is the click target for the editor (`MeasurementPinEditor` inside
 * the shared centered `PinEditorDialog`); handle clicks (press without
 * movement) open it too, via the same `usePointerDrag` disambiguation as pin
 * tips. Inactive-layer lines render dimmed and non-interactive, matching
 * inactive point pins.
 */
export function MeasurementLinePin({
  annotation,
  slotWidth,
  slotHeight,
  interactive = true,
  isSelected = false,
  getSlotRect,
  onUpdated,
  onDeleted,
  onMoved,
  onSelected,
}: {
  annotation: CanvasAnnotation;
  slotWidth: number;
  slotHeight: number;
  interactive?: boolean;
  isSelected?: boolean;
  getSlotRect: () => DOMRect | null;
  onUpdated?: (id: string, data: Record<string, unknown>) => void;
  onDeleted?: (id: string) => void;
  onMoved?: (
    id: string,
    x: number,
    y: number,
    endX?: number | null,
    endY?: number | null,
  ) => void;
  onSelected?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);

  const color = colourForLayerType(annotation.layer_type);
  const textColor = readableTextOn(color);

  // Defensive: a line pin always carries end coordinates, but fall back to a
  // degenerate zero-length line rather than crashing on malformed rows.
  const baseEndX = annotation.end_x ?? annotation.x;
  const baseEndY = annotation.end_y ?? annotation.y;

  // ---- Endpoint drags — each persists all four coordinates -----------------
  function persistMove(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) {
    const prev = {
      x: annotation.x,
      y: annotation.y,
      endX: baseEndX,
      endY: baseEndY,
    };
    onMoved?.(annotation.id, startX, startY, endX, endY); // optimistic
    void moveAnnotation(annotation.id, startX, startY, endX, endY).catch(() => {
      toast.error("Could not move the measurement.");
      onMoved?.(annotation.id, prev.x, prev.y, prev.endX, prev.endY); // revert
    });
  }

  const startDrag = usePointerDrag(
    ({ clientX, clientY }) => {
      const rect = getSlotRect();
      if (!rect) return;
      const f = clientToFraction(clientX, clientY, rect);
      persistMove(f.x, f.y, baseEndX, baseEndY);
    },
    () => setOpen(true),
  );
  const endDrag = usePointerDrag(
    ({ clientX, clientY }) => {
      const rect = getSlotRect();
      if (!rect) return;
      const f = clientToFraction(clientX, clientY, rect);
      persistMove(annotation.x, annotation.y, f.x, f.y);
    },
    () => setOpen(true),
  );

  // Live endpoint positions — the in-flight drag position while dragging, else
  // the stored fractions. Same live-tracking pattern as the point pin's tip.
  let startX = annotation.x;
  let startY = annotation.y;
  let endX = baseEndX;
  let endY = baseEndY;
  if (startDrag.active) {
    const rect = getSlotRect();
    if (rect) {
      const f = clientToFraction(
        startDrag.active.clientX,
        startDrag.active.clientY,
        rect,
      );
      startX = f.x;
      startY = f.y;
    }
  }
  if (endDrag.active) {
    const rect = getSlotRect();
    if (rect) {
      const f = clientToFraction(
        endDrag.active.clientX,
        endDrag.active.clientY,
        rect,
      );
      endX = f.x;
      endY = f.y;
    }
  }

  const sx = startX * slotWidth;
  const sy = startY * slotHeight;
  const ex = endX * slotWidth;
  const ey = endY * slotHeight;

  // Midpoint pill position: offset along the line's normal, flipped so the
  // pill sits on the upward side of the line (screen-wise) when possible.
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  let nx = 0;
  let ny = -1;
  if (len >= 1) {
    nx = -dy / len;
    ny = dx / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  const pillLeft = mx + nx * PILL_OFFSET;
  const pillTop = my + ny * PILL_OFFSET;

  const summary = getAnnotationSummary(annotation);
  const d = readMeasurementData(annotation.data);
  const valueLabel = formatMeasurementValue(d.value, d.unit);

  // Two-way sync with the list panel, same as point pins.
  useEffect(() => {
    if (isSelected) {
      pillRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, [isSelected]);

  const arrow = (
    <svg
      aria-hidden
      className="pointer-events-none absolute overflow-visible"
      style={{ left: 0, top: 0, width: 1, height: 1 }}
    >
      <path
        d={dimensionArrowPath(sx, sy, ex, ey)}
        stroke={color}
        strokeWidth={isSelected ? 2.5 : 2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );

  // Inactive-layer lines are context only: dimmed, no handles, no editor.
  if (!interactive) {
    return (
      <span
        aria-hidden
        className="absolute"
        style={{ left: 0, top: 0, opacity: 0.3, pointerEvents: "none" }}
      >
        {arrow}
        <span
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap shadow-sm ring-1 ring-black/10"
          style={{ left: pillLeft, top: pillTop, backgroundColor: color, color: textColor }}
        >
          {annotation.reference_code}
          {valueLabel && <span className="font-medium">{valueLabel}</span>}
        </span>
      </span>
    );
  }

  return (
    <>
      <span className="absolute" style={{ left: 0, top: 0 }}>
        {arrow}

        {/* Endpoint handles — small draggable dots on each end of the line. */}
        {(
          [
            ["start", sx, sy, startDrag] as const,
            ["end", ex, ey, endDrag] as const,
          ]
        ).map(([key, left, top, drag]) => (
          <button
            key={key}
            type="button"
            aria-label={`Move ${key} of ${annotation.reference_code}`}
            onPointerDown={drag.onPointerDown}
            onClick={(e) => {
              // Keyboard-synthesized clicks open the editor; real pointer
              // clicks are handled by usePointerDrag.
              if (e.detail === 0) setOpen(true);
            }}
            className={cn(
              "absolute block size-2 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full ring-2 ring-white outline-none",
              drag.active ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{ left, top, backgroundColor: color }}
          />
        ))}

        {/* Midpoint pill — the reference code + value, and the click target. */}
        <Tooltip
          open={open || startDrag.active || endDrag.active ? false : undefined}
        >
          <TooltipTrigger asChild>
            <span
              ref={pillRef}
              role="button"
              tabIndex={0}
              aria-label={`Measurement ${annotation.reference_code}`}
              onClick={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap shadow-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-black/30",
                isSelected ? "ring-brand ring-2 ring-offset-1" : "ring-1 ring-black/10",
              )}
              style={{
                left: pillLeft,
                top: pillTop,
                backgroundColor: color,
                color: textColor,
              }}
            >
              {annotation.reference_code}
              {valueLabel && <span className="font-medium">{valueLabel}</span>}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="font-semibold">{annotation.reference_code}</span>
            {" — "}
            {summary.title}
            {summary.detail ? ` · ${summary.detail}` : ""}
          </TooltipContent>
        </Tooltip>
      </span>

      <PinEditorDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onSelected?.(annotation.id);
        }}
        title={`Edit ${annotation.reference_code}`}
        header={
          <div className="flex items-center justify-between">
            <span
              className="rounded-md px-2 py-0.5 text-xs font-bold"
              style={{ backgroundColor: color, color: textColor }}
            >
              {annotation.reference_code}
            </span>
            <span className="text-muted-foreground text-xs capitalize">
              {annotation.layer_type}
            </span>
          </div>
        }
      >
        <MeasurementPinEditor
          annotation={annotation}
          onSaved={(data) => {
            setOpen(false);
            onUpdated?.(annotation.id, data);
          }}
          onDeleted={() => {
            setOpen(false);
            onDeleted?.(annotation.id);
          }}
        />
      </PinEditorDialog>
    </>
  );
}
