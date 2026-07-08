"use client";

import { useCallback, useState } from "react";
import { Pipette, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  colourwayLabel,
  isValidHex,
} from "@/components/canvas/colourway-data";
import {
  createColourway,
  createColourwayAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type {
  CanvasAnnotation,
  CanvasColourway,
  ColourwayAnnotationData,
} from "@/types";

// Non-colourway Select values: pick the "new colourway" row, or (when the
// product has no colourway yet) the implicit first one the server will create.
const NEW_COLOURWAY = "__new__";
const DEFAULT_COLOURWAY = "__default__";

type CreatedResult = {
  id: string;
  referenceCode: string;
  colourway: CanvasColourway;
  data: ColourwayAnnotationData;
};

export type ColourwayDraftFields = {
  colourName: string;
  setColourName: (value: string) => void;
  hex: string;
  setHex: (value: string) => void;
  pantone: string;
  setPantone: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  /** True after an explicit re-sample attempt came back unsampleable (CORS/etc). */
  resampleFailed: boolean;
  /** Apply a re-sample result: a hex string on success, null when sampling failed. */
  applySample: (hex: string | null) => void;
};

/**
 * Owns the colourway pin editor's draft field state (colour name / hex / Pantone /
 * notes) OUTSIDE the Popover's own content subtree — call this in the component
 * that renders the `Popover` itself (`AnnotationPin` for edit mode,
 * `DraftColourwayPin` for create mode), NOT inside `ColourwayPinEditor`.
 *
 * This matters because "Re-sample from image" now genuinely closes the popover
 * (see `ColourwayPinEditor` doc comment) rather than just fading it, which
 * unmounts `PopoverContent` and everything rendered inside it (Radix wraps it in
 * a `Portal` with `Presence`, so a closed popover has no DOM at all). Any state
 * living inside `ColourwayPinEditor` itself would reset to its initial value on
 * reopen. Because the caller of this hook sits one level up and never unmounts
 * during that close/reopen cycle, the draft the user already typed — including a
 * still-inflight hex from re-sampling — survives untouched.
 */
export function useColourwayDraftFields(
  initial: ColourwayAnnotationData,
): ColourwayDraftFields {
  const [colourName, setColourName] = useState(initial.colour_name ?? "");
  const [hex, setHex] = useState(initial.hex ?? "");
  const [pantone, setPantone] = useState(initial.pantone ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  // Set only when an explicit re-sample returns null (CORS/security), so the user
  // who actively asked to sample gets feedback. Auto-sample-on-create stays silent.
  const [resampleFailed, setResampleFailed] = useState(false);

  const applySample = useCallback((sampled: string | null) => {
    if (sampled) {
      setHex(sampled);
      setResampleFailed(false);
    } else {
      setResampleFailed(true);
    }
  }, []);

  return {
    colourName,
    setColourName,
    hex,
    setHex,
    pantone,
    setPantone,
    notes,
    setNotes,
    resampleFailed,
    applySample,
  };
}

export type ColourwaySelectionDraft = {
  selection: string;
  setSelection: (value: string) => void;
  newName: string;
  setNewName: (value: string) => void;
};

/**
 * Owns the create-mode "which colourway" draft (existing selection, or the name
 * typed for a brand-new one) — same lifting rationale as `useColourwayDraftFields`:
 * called by `DraftColourwayPin`, not by `ColourwayPinEditor`, so it survives the
 * popover closing during re-sample.
 */
export function useColourwaySelectionDraft(
  colourways: CanvasColourway[],
  lastUsedColourwayId: string | null,
): ColourwaySelectionDraft {
  // The most-recently-created colourway is the sensible default; fall back to
  // the caller's last-used one when it still exists.
  const mostRecent =
    colourways.length > 0
      ? [...colourways].sort((a, b) => b.sequence_number - a.sequence_number)[0]
      : null;
  const initialSelection =
    lastUsedColourwayId && colourways.some((c) => c.id === lastUsedColourwayId)
      ? lastUsedColourwayId
      : (mostRecent?.id ?? DEFAULT_COLOURWAY);

  const [selection, setSelection] = useState(initialSelection);
  const [newName, setNewName] = useState("");
  return { selection, setSelection, newName, setNewName };
}

/**
 * The dedicated Colourways pin editor — replaces the generic label/notes form
 * for pins whose layer_type is 'colourway'. Renders as plain content (no Popover
 * of its own) so it drops into the existing pin popover (edit mode) or a
 * new-pin popover anchored at the click point (create mode), exactly like
 * `FabricTrimPinEditor`.
 *
 * Colourway assignment is chosen once, at creation, then immutable — edit mode
 * shows it as read-only text. Colour name / hex / Pantone / notes stay editable
 * in both modes, via the `draft` prop — owned by the caller (see
 * `useColourwayDraftFields`), NOT local state here, so it survives this
 * component unmounting when the popover closes for "Re-sample."
 *
 * The hex field auto-fills from the image pixel at the pin's click point: create
 * mode receives that pre-sampled value as the draft's initial `hex`, and both
 * modes expose a "Re-sample from image" action (`onRequestResample`) that lets
 * the user pick a different spot to correct an inaccurate read. Sampling is a
 * pure enhancement — manual entry always works, and a failed re-sample just
 * shows an inline note.
 */
export function ColourwayPinEditor(
  props: {
    colourways: CanvasColourway[];
    draft: ColourwayDraftFields;
    /**
     * Request image pick-mode for the "Re-sample" action. The caller (which owns
     * the Popover's `open` state) closes the popover, samples, then reopens it
     * with `draft` already carrying the result — this component doesn't manage
     * any of that, it just asks for it. Omitted when no slot is available to
     * sample from, in which case the button is hidden.
     */
    onRequestResample?: () => void;
  } & (
    | {
        mode: "create";
        slotId: string;
        x: number;
        y: number;
        productId: string;
        selection: ColourwaySelectionDraft;
        onColourwayCreated: (colourway: CanvasColourway) => void;
        onCreated: (result: CreatedResult) => void;
        onCancel: () => void;
      }
    | {
        mode: "edit";
        annotation: CanvasAnnotation;
        onSaved: (data: ColourwayAnnotationData) => void;
        onDeleted: () => void;
      }
  ),
) {
  const { colourways, draft, onRequestResample } = props;
  const {
    colourName,
    setColourName,
    hex,
    setHex,
    pantone,
    setPantone,
    notes,
    setNotes,
    resampleFailed,
  } = draft;

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isCreatingColourway, setIsCreatingColourway] = useState(false);

  async function handleCreateColourway() {
    if (props.mode !== "create") return;
    const { selection } = props;
    setIsCreatingColourway(true);
    try {
      const colourway = await createColourway(
        props.productId,
        selection.newName.trim() || undefined,
      );
      props.onColourwayCreated(colourway);
      selection.setSelection(colourway.id);
      selection.setNewName("");
      toast.success(`${colourway.name} created.`);
    } catch {
      toast.error("Could not create the colourway.");
    } finally {
      setIsCreatingColourway(false);
    }
  }

  function buildData(): ColourwayAnnotationData {
    return {
      colour_name: colourName.trim() || null,
      hex: hex.trim() || null,
      pantone: pantone.trim() || null,
      notes: notes.trim() || null,
    };
  }

  async function handleSave() {
    if (props.mode === "create" && props.selection.selection === NEW_COLOURWAY) {
      toast.error("Name and create the colourway first.");
      return;
    }
    setIsSaving(true);
    try {
      const data = buildData();
      if (props.mode === "edit") {
        await updateAnnotation(props.annotation.id, data);
        toast.success("Colour saved.");
        props.onSaved(data);
      } else {
        const { selection } = props.selection;
        const colourwayId = selection === DEFAULT_COLOURWAY ? null : selection;
        const { id, referenceCode, colourway } =
          await createColourwayAnnotation(
            props.slotId,
            props.x,
            props.y,
            colourwayId,
            data,
          );
        toast.success("Colour pin placed.");
        props.onCreated({ id, referenceCode, colourway, data });
      }
    } catch {
      toast.error("Could not save the colour.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (props.mode !== "edit") return;
    setIsDeleting(true);
    try {
      await deleteAnnotation(props.annotation.id);
      toast.success("Colour pin deleted.");
      props.onDeleted();
    } catch {
      toast.error("Could not delete the colour pin.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Read-only colourway line for edit mode: "Colourway: Navy (C1.2)".
  const editingColourway =
    props.mode === "edit"
      ? colourways.find((c) => c.id === props.annotation.colourway_id)
      : null;

  return (
    <div className="space-y-3">
      {props.mode === "create" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Colourway</Label>
          <Select
            value={props.selection.selection}
            onValueChange={props.selection.setSelection}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {colourways.length === 0 && (
                <SelectItem value={DEFAULT_COLOURWAY}>
                  Colourway 1 (new)
                </SelectItem>
              )}
              {[...colourways]
                .sort((a, b) => a.sequence_number - b.sequence_number)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {colourwayLabel(c)}
                  </SelectItem>
                ))}
              <SelectSeparator />
              <SelectItem value={NEW_COLOURWAY}>+ New Colourway</SelectItem>
            </SelectContent>
          </Select>

          {props.selection.selection === NEW_COLOURWAY && (
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={props.selection.newName}
                onChange={(e) => props.selection.setNewName(e.target.value)}
                placeholder={`Colourway ${colourways.length + 1}`}
                maxLength={60}
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                disabled={isCreatingColourway}
                onClick={handleCreateColourway}
              >
                {isCreatingColourway ? "Creating…" : "Create"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-muted/50 rounded-md px-3 py-2 text-xs">
          <span className="text-muted-foreground">Colourway: </span>
          <span className="font-medium">
            {editingColourway ? editingColourway.name : "Unknown"} (
            {props.annotation.reference_code})
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="cpe-colour-name" className="text-xs">
          Colour name
        </Label>
        <Input
          id="cpe-colour-name"
          value={colourName}
          onChange={(e) => setColourName(e.target.value)}
          placeholder="e.g. Bering Sea"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpe-hex" className="text-xs">
          Hex
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isValidHex(hex) ? hex : "#000000"}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            aria-label="Pick colour"
            className="size-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
          />
          <Input
            id="cpe-hex"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#000000"
            className="w-32 font-mono uppercase"
            maxLength={7}
          />
          {onRequestResample && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestResample}
              title="Click a point on the image to sample its colour"
            >
              <Pipette className="size-4" />
              Re-sample
            </Button>
          )}
        </div>
        {resampleFailed && (
          <p className="text-muted-foreground text-xs">
            Couldn&apos;t read colour from this image, enter it manually.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpe-pantone" className="text-xs">
          Pantone reference
        </Label>
        <Input
          id="cpe-pantone"
          value={pantone}
          onChange={(e) => setPantone(e.target.value)}
          placeholder="e.g. 19-4025 TCX"
        />
        <p className="text-muted-foreground text-xs">
          From your supplier or swatch book.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cpe-notes" className="text-xs">
          Notes
        </Label>
        <Textarea
          id="cpe-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the factory should know…"
          className="min-h-16"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {props.mode === "edit" ? (
          confirmingDelete ? (
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
          )
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
