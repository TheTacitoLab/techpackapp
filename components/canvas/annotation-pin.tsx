"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  colourForLayerType,
  readableTextOn,
} from "@/components/canvas/layers";
import {
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type { CanvasAnnotation } from "@/types";

/** Read a string field out of the annotation's freeform `data` jsonb. */
function readString(data: CanvasAnnotation["data"], key: string): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * A single annotation pin positioned on a locked slot. In Phase 4c these are
 * absolute-positioned HTML elements; Phase 4d moves the identical positioning
 * math (`x * slotWidth`, `y * slotHeight`) inside Konva.
 *
 * The pin's circle and leader render in its layer family's colour (from the
 * shared `layers` config). When `interactive` is false — the pin belongs to a
 * layer other than the active one — it renders at 30% opacity with pointer
 * events disabled: visible for context, not clickable.
 *
 * Self-contained: the edit popover and delete both call server actions and
 * `router.refresh()` directly, so the parent slot never has to thread callbacks
 * for every pin.
 */
export function AnnotationPin({
  annotation,
  slotWidth,
  slotHeight,
  interactive = true,
}: {
  annotation: CanvasAnnotation;
  slotWidth: number;
  slotHeight: number;
  interactive?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  // Fractions of the slot's rendered size — never the raw stored pixel values.
  const left = annotation.x * slotWidth;
  const top = annotation.y * slotHeight;

  const color = colourForLayerType(annotation.layer_type);
  const textColor = readableTextOn(color);

  const [label, setLabel] = useState(() => readString(annotation.data, "label"));
  const [notes, setNotes] = useState(() => readString(annotation.data, "notes"));

  // Inactive-layer pins are context only: dimmed and non-interactive (no popover).
  if (!interactive) {
    return (
      <span
        aria-hidden
        className="absolute -translate-x-1/2 -translate-y-full"
        style={{ left, top, opacity: 0.3, pointerEvents: "none" }}
      >
        <span
          className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-1 ring-black/10"
          style={{ backgroundColor: color, color: textColor }}
        >
          {annotation.reference_code}
        </span>
        <span
          className="absolute top-5 left-1/2 h-5 w-1 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
    );
  }

  function handleSave() {
    startSave(async () => {
      try {
        await updateAnnotation(annotation.id, { label, notes });
        toast.success("Annotation saved.");
        setOpen(false);
        router.refresh();
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
        router.refresh();
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
        if (!next) setConfirmingDelete(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Annotation ${annotation.reference_code}`}
          className="group/pin absolute -translate-x-1/2 -translate-y-full outline-none"
          style={{ left, top }}
        >
          {/* Circle with the reference code — coloured by its layer family */}
          <span
            className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ring-1 ring-black/10 group-focus-visible/pin:ring-2"
            style={{ backgroundColor: color, color: textColor }}
          >
            {annotation.reference_code}
          </span>
          {/* Leader line dropping from the circle to the marked point */}
          <span
            className="absolute top-5 left-1/2 h-5 w-1 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: color }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 space-y-3">
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
      </PopoverContent>
    </Popover>
  );
}
