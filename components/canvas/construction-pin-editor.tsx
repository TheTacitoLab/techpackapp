"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FabricPicker } from "@/components/fabric-picker";
import {
  CONSTRUCTION_SUBTYPE_LABEL,
  constructionDataFromLibraryItem,
  readConstructionData,
  stitchLibraryDetails,
  stitchSummaryLine,
  type ConstructionSubType,
} from "@/components/canvas/construction-data";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type {
  CanvasAnnotation,
  CanvasLayerType,
  ConstructionAnnotationData,
  ResolvedLibraryItem,
} from "@/types";

const CONSTRUCTION_SUBTYPE_KEYS: readonly ConstructionSubType[] = [
  "stitch",
  "construction_note",
];

type CreatedResult = {
  id: string;
  referenceCode: string;
  layerType: CanvasLayerType;
  data: ConstructionAnnotationData;
};

/**
 * The dedicated Construction pin editor — covers the layer's two sub-types
 * (stitch / construction note) the way `FabricTrimPinEditor` covers its four.
 * Renders as plain content inside the shared centered `PinEditorDialog`
 * (`annotation-pin.tsx` for edit mode, `DraftConstructionPin` in
 * `page-canvas.tsx` for create mode) — no popup container of its own.
 *
 * Sub-type is chosen once, at creation, and is immutable afterwards (it IS the
 * pin's `layer_type`, which determines the S/CN reference-code prefix) — the
 * same precedent as Fabrics & Trim's category and Colourways' colourway
 * assignment. Unlike Fabrics & Trim, toggling the sub-type mid-draft does NOT
 * reset the other side's fields: neither side's inputs can invalidate the
 * other's (there's no category-filtered picker to go stale), and
 * `buildData()` nulls the inactive family's fields at save time, so nothing
 * hidden can leak into the saved pin.
 *
 * Draft state lives in plain component state (not lifted like Colourways'):
 * this editor has no re-sample-style flow that closes and reopens the dialog
 * mid-edit, so it never unmounts while a draft is in flight.
 */
export function ConstructionPinEditor(
  props: { libraryItems: ResolvedLibraryItem[] } & (
    | {
        mode: "edit";
        annotation: CanvasAnnotation;
        onSaved: (data: ConstructionAnnotationData) => void;
        onDeleted: () => void;
      }
    | {
        mode: "create";
        slotId: string;
        x: number;
        y: number;
        onCreated: (result: CreatedResult) => void;
        onCancel: () => void;
      }
  ),
) {
  const { libraryItems } = props;

  const initial: ConstructionAnnotationData =
    props.mode === "edit"
      ? readConstructionData(props.annotation.data)
      : {
          library_item_id: null,
          library_item_name: null,
          library_item_image_url: null,
          spi: null,
          thread_colour: null,
          note_text: null,
          placement: null,
          notes: null,
        };

  // Sub-type is only choosable for a brand-new pin — an existing pin's
  // layer_type (and therefore its reference-code prefix) is fixed forever.
  const fixedSubType =
    props.mode === "edit"
      ? (props.annotation.layer_type as ConstructionSubType)
      : null;
  const [subType, setSubType] = useState<ConstructionSubType>(
    fixedSubType ?? "stitch",
  );
  const effectiveSubType = fixedSubType ?? subType;
  const isStitch = effectiveSubType === "stitch";

  // Stitch-side draft
  const [libraryItemId, setLibraryItemId] = useState(initial.library_item_id);
  const [autoFilled, setAutoFilled] = useState<
    Pick<
      ConstructionAnnotationData,
      "library_item_name" | "library_item_image_url"
    >
  >({
    library_item_name: initial.library_item_name,
    library_item_image_url: initial.library_item_image_url,
  });
  const [spi, setSpi] = useState(
    initial.spi !== null ? String(initial.spi) : "",
  );
  const [threadColour, setThreadColour] = useState(initial.thread_colour ?? "");

  // Note-side draft
  const [noteText, setNoteText] = useState(initial.note_text ?? "");

  // Shared
  const [placement, setPlacement] = useState(initial.placement ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const stitchItems = libraryItems.filter((i) => i.category === "stitch_type");
  const selectedItem = libraryItems.find((i) => i.id === libraryItemId) ?? null;
  const selectedDetails = selectedItem ? stitchLibraryDetails(selectedItem) : null;

  function handlePickLibraryItem(id: string, item: ResolvedLibraryItem) {
    setLibraryItemId(id);
    const filled = constructionDataFromLibraryItem(item);
    setAutoFilled({
      library_item_name: filled.library_item_name,
      library_item_image_url: filled.library_item_image_url,
    });
    // Pre-fill the editable SPI input with the derived single-number default
    // (range midpoint) — the user confirms or adjusts from there.
    setSpi(filled.spi !== null ? String(filled.spi) : "");
  }

  function buildData(): ConstructionAnnotationData {
    return {
      library_item_id: isStitch ? libraryItemId : null,
      library_item_name: isStitch ? autoFilled.library_item_name : null,
      library_item_image_url: isStitch
        ? autoFilled.library_item_image_url
        : null,
      spi: isStitch && spi.trim() ? Number(spi) : null,
      thread_colour: isStitch ? threadColour.trim() || null : null,
      note_text: !isStitch ? noteText.trim() || null : null,
      placement: placement.trim() || null,
      notes: notes.trim() || null,
    };
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const data = buildData();
      if (props.mode === "edit") {
        await updateAnnotation(props.annotation.id, data);
        toast.success("Annotation saved.");
        props.onSaved(data);
      } else {
        const { id, referenceCode } = await createAnnotation(
          props.slotId,
          effectiveSubType,
          props.x,
          props.y,
          "point",
          null,
          null,
          data,
        );
        toast.success("Pin placed.");
        props.onCreated({ id, referenceCode, layerType: effectiveSubType, data });
      }
    } catch {
      toast.error("Could not save the annotation.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (props.mode !== "edit") return;
    setIsDeleting(true);
    try {
      await deleteAnnotation(props.annotation.id);
      toast.success("Annotation deleted.");
      props.onDeleted();
    } catch {
      toast.error("Could not delete the annotation.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      {props.mode === "create" ? (
        <div className="grid grid-cols-2 gap-1">
          {CONSTRUCTION_SUBTYPE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubType(key)}
              className={
                key === subType
                  ? "bg-brand text-brand-foreground rounded-md px-2 py-1.5 text-xs font-semibold"
                  : "bg-muted text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
              }
            >
              {CONSTRUCTION_SUBTYPE_LABEL[key]}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">
          Type:{" "}
          <span className="text-foreground font-medium">
            {CONSTRUCTION_SUBTYPE_LABEL[effectiveSubType]}
          </span>
        </div>
      )}

      {isStitch ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Stitch</Label>
            <FabricPicker
              fabrics={stitchItems}
              value={libraryItemId}
              onChange={handlePickLibraryItem}
              summaryLine={stitchSummaryLine}
              thumbnailUrl={(item) => item.image_url}
              placeholder="Select a stitch…"
              emptyMessage={
                <>
                  No stitch types in your library yet — add one in{" "}
                  <Link
                    href="/settings?tab=library"
                    className="text-foreground font-medium underline underline-offset-2"
                  >
                    Settings → Master Library
                  </Link>
                  .
                </>
              }
            />
          </div>

          {selectedItem && selectedDetails && (
            <div className="bg-muted/50 flex items-start gap-3 rounded-md px-3 py-2 text-xs">
              {autoFilled.library_item_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={autoFilled.library_item_image_url}
                  alt=""
                  className="h-12 w-18 shrink-0 rounded-sm border bg-white object-contain"
                />
              )}
              <div className="space-y-1">
                {selectedDetails.spiRange && (
                  <div>
                    <span className="text-muted-foreground">SPI range: </span>
                    <span className="font-medium">
                      {selectedDetails.spiRange}
                    </span>
                  </div>
                )}
                {selectedDetails.isoCode && (
                  <div>
                    <span className="text-muted-foreground">ISO: </span>
                    <span className="font-medium">{selectedDetails.isoCode}</span>
                  </div>
                )}
                {selectedDetails.useCase && (
                  <div>
                    <span className="text-muted-foreground">Use: </span>
                    <span className="font-medium">{selectedDetails.useCase}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cpe-spi" className="text-xs">
                SPI
              </Label>
              <Input
                id="cpe-spi"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={spi}
                onChange={(e) => setSpi(e.target.value)}
                placeholder="e.g. 11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpe-thread" className="text-xs">
                Thread colour
              </Label>
              <Input
                id="cpe-thread"
                value={threadColour}
                onChange={(e) => setThreadColour(e.target.value)}
                placeholder="e.g. DTM navy"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="cpe-note" className="text-xs">
            Note
          </Label>
          <Textarea
            id="cpe-note"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. Reinforce here — match grain direction across seam"
            className="min-h-24"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="cpe-placement" className="text-xs">
          Placement
        </Label>
        <Input
          id="cpe-placement"
          value={placement}
          onChange={(e) => setPlacement(e.target.value)}
          placeholder="e.g. Centre back seam"
        />
      </div>

      {isStitch && (
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
      )}

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
