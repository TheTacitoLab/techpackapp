"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAnnotationSummary } from "@/components/canvas/annotation-summary";
import { FabricTrimPinEditor } from "@/components/canvas/fabric-trim-pin-editor";
import {
  colourForLayerType,
  layerForType,
  readableTextOn,
} from "@/components/canvas/layers";
import {
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type { CanvasAnnotation, ResolvedLibraryItem } from "@/types";

/** Read a string field out of the annotation's freeform `data` jsonb. */
function readString(data: CanvasAnnotation["data"], key: string): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
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
 */
export function AnnotationPin({
  annotation,
  slotWidth,
  slotHeight,
  interactive = true,
  isSelected = false,
  libraryItems,
  onUpdated,
  onDeleted,
  onSelected,
}: {
  annotation: CanvasAnnotation;
  slotWidth: number;
  slotHeight: number;
  interactive?: boolean;
  isSelected?: boolean;
  libraryItems: ResolvedLibraryItem[];
  onUpdated?: (id: string, data: Record<string, unknown>) => void;
  onDeleted?: (id: string) => void;
  onSelected?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const wrapperRef = useRef<HTMLButtonElement>(null);

  // Fractions of the slot's rendered size — never the raw stored pixel values.
  const left = annotation.x * slotWidth;
  const top = annotation.y * slotHeight;

  const color = colourForLayerType(annotation.layer_type);
  const textColor = readableTextOn(color);
  const isFabricFamily = layerForType(annotation.layer_type)?.key === "fabric";

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

  // Inactive-layer pins are context only: dimmed and non-interactive (no popover).
  if (!interactive) {
    return (
      <span
        aria-hidden
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left, top, opacity: 0.3, pointerEvents: "none" }}
      >
        <span
          className="block size-1.5 rounded-full ring-2 ring-white"
          style={{ backgroundColor: color }}
        />
        <span className="absolute bottom-full left-1/2 mb-0.5 flex -translate-x-1/2 flex-col items-center">
          <span
            className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-1 ring-black/10"
            style={{ backgroundColor: color, color: textColor }}
          >
            {annotation.reference_code}
          </span>
          <span className="h-2 w-0.5 rounded-full" style={{ backgroundColor: color }} />
        </span>
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
      <Tooltip open={open ? false : undefined}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <button
              ref={wrapperRef}
              type="button"
              aria-label={`Annotation ${annotation.reference_code}`}
              className="group/pin absolute -translate-x-1/2 -translate-y-1/2 outline-none"
              style={{ left, top }}
            >
              {/* Tip — the sole in-flow child; its 6x6 box IS what gets
                  centered on (left, top) by the translate above. */}
              <span
                className={
                  isSelected
                    ? "ring-brand block size-1.5 rounded-full ring-2 ring-offset-2"
                    : "block size-1.5 rounded-full ring-2 ring-white"
                }
                style={{ backgroundColor: color }}
              />
              {/* Badge + leader — absolutely positioned, out of flow, so they
                  can never affect the tip's box or its center. */}
              <span className="absolute bottom-full left-1/2 mb-0.5 flex -translate-x-1/2 flex-col items-center">
                <span
                  className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-1 ring-black/10 group-focus-visible/pin:ring-2"
                  style={{ backgroundColor: color, color: textColor }}
                >
                  {annotation.reference_code}
                </span>
                <span
                  className="h-2 w-0.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </span>
            </button>
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipContent side="top">
          <span className="font-semibold">{annotation.reference_code}</span>
          {" — "}
          {summary.title}
          {summary.detail ? ` · ${summary.detail}` : ""}
        </TooltipContent>
      </Tooltip>
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
