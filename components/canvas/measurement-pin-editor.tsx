"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MEASUREMENT_UNITS,
  readMeasurementData,
} from "@/components/canvas/measurement-data";
import {
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type { CanvasAnnotation, MeasurementAnnotationData } from "@/types";

/**
 * The dedicated Measurements pin editor — name / value / unit / notes for one
 * freehand dimension line. Deliberately simpler than the other three layers'
 * editors: no library picker, no sub-type, no immutable fields, and edit-mode
 * only — the annotation is created by the two-click placement flow BEFORE this
 * editor first opens (see `AnnotationSlot`'s measurement drawing state), so
 * every open edits an existing line via the unchanged `updateAnnotation`.
 * Renders as plain content inside the shared centered `PinEditorDialog`.
 *
 * This is NOT the Grading size chart — a measurement is one value, full stop;
 * nothing here reads or writes per-size data.
 */
export function MeasurementPinEditor({
  annotation,
  onSaved,
  onDeleted,
}: {
  annotation: CanvasAnnotation;
  onSaved: (data: MeasurementAnnotationData) => void;
  onDeleted: () => void;
}) {
  const initial = readMeasurementData(annotation.data);

  const [name, setName] = useState(initial.name ?? "");
  const [value, setValue] = useState(
    initial.value !== null ? String(initial.value) : "",
  );
  const [unit, setUnit] = useState<MeasurementAnnotationData["unit"]>(
    initial.unit,
  );
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function buildData(): MeasurementAnnotationData {
    return {
      name: name.trim() || null,
      value: value.trim() ? Number(value) : null,
      unit,
      notes: notes.trim() || null,
    };
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const data = buildData();
      await updateAnnotation(annotation.id, data);
      toast.success("Measurement saved.");
      onSaved(data);
    } catch {
      toast.error("Could not save the measurement.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteAnnotation(annotation.id);
      toast.success("Measurement deleted.");
      onDeleted();
    } catch {
      toast.error("Could not delete the measurement.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="mpe-name" className="text-xs">
          Name
        </Label>
        <Input
          id="mpe-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What are you measuring? e.g. Logo width"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="mpe-value" className="text-xs">
            Value
          </Label>
          <Input
            id="mpe-value"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 60"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Unit</Label>
          <Select
            value={unit ?? undefined}
            onValueChange={(v) => setUnit(v as MeasurementAnnotationData["unit"])}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unit…" />
            </SelectTrigger>
            <SelectContent>
              {MEASUREMENT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mpe-notes" className="text-xs">
          Notes
        </Label>
        <Textarea
          id="mpe-notes"
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
        <Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
