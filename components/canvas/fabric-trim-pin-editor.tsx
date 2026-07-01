"use client";

import { useState } from "react";
import Link from "next/link";
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
import { FabricPicker } from "@/components/fabric-picker";
import {
  FABRIC_FAMILY_LABEL,
  FABRIC_FAMILY_TO_LIBRARY_CATEGORY,
  fabricTrimDataFromLibraryItem,
  libraryColourOptions,
  libraryItemSummaryLine,
  readFabricTrimData,
} from "@/components/canvas/fabric-trim-data";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type {
  CanvasAnnotation,
  CanvasLayerType,
  FabricTrimAnnotationData,
  ResolvedLibraryItem,
} from "@/types";

type FabricFamilyKey = "fabric" | "trim" | "hardware" | "elastic";
const FABRIC_FAMILY_KEYS: readonly FabricFamilyKey[] = [
  "fabric",
  "trim",
  "hardware",
  "elastic",
];

const UNIT_LABEL: Record<NonNullable<FabricTrimAnnotationData["unit"]>, string> = {
  per_metre: "per metre",
  per_unit: "per unit",
  per_kg: "per kg",
};

type CreatedResult = {
  id: string;
  referenceCode: string;
  layerType: CanvasLayerType;
  data: FabricTrimAnnotationData;
};

/**
 * The dedicated Fabrics & Trim pin editor — replaces the generic label/notes
 * form for pins whose layer_type is fabric/trim/hardware/elastic. Renders as
 * plain content (no Popover wrapper of its own) so it can be dropped into the
 * existing pin popover (`annotation-pin.tsx`, edit mode) or a "new pin" popover
 * anchored at the click point (`page-canvas.tsx`, create mode).
 */
export function FabricTrimPinEditor(
  props: { libraryItems: ResolvedLibraryItem[] } & (
    | {
        mode: "edit";
        annotation: CanvasAnnotation;
        onSaved: (data: FabricTrimAnnotationData) => void;
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

  const initial: FabricTrimAnnotationData =
    props.mode === "edit"
      ? readFabricTrimData(props.annotation.data)
      : {
          library_item_id: null,
          library_item_name: null,
          category: null,
          composition: null,
          colour: null,
          gsm: null,
          placement: null,
          quantity: null,
          unit: null,
          supplier_code: null,
          notes: null,
        };

  // Sub-type is only choosable for a brand-new pin — an existing pin's
  // layer_type (and therefore its reference-code prefix) is fixed forever.
  const fixedSubType =
    props.mode === "edit" ? (props.annotation.layer_type as FabricFamilyKey) : null;
  const [subType, setSubType] = useState<FabricFamilyKey>(fixedSubType ?? "fabric");

  const [libraryItemId, setLibraryItemId] = useState(initial.library_item_id);
  const [autoFilled, setAutoFilled] = useState<
    Pick<FabricTrimAnnotationData, "library_item_name" | "category" | "composition" | "gsm" | "supplier_code">
  >({
    library_item_name: initial.library_item_name,
    category: initial.category,
    composition: initial.composition,
    gsm: initial.gsm,
    supplier_code: initial.supplier_code,
  });
  const [colour, setColour] = useState(initial.colour);
  const [placement, setPlacement] = useState(initial.placement ?? "");
  const [quantity, setQuantity] = useState(
    initial.quantity !== null ? String(initial.quantity) : "",
  );
  const [unit, setUnit] = useState<FabricTrimAnnotationData["unit"]>(initial.unit);
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const category = FABRIC_FAMILY_TO_LIBRARY_CATEGORY[subType];
  const filteredItems = libraryItems.filter((i) => i.category === category);
  const selectedItem = libraryItems.find((i) => i.id === libraryItemId) ?? null;
  const colourOptions = selectedItem ? libraryColourOptions(selectedItem) : [];

  function handlePickLibraryItem(id: string, item: ResolvedLibraryItem) {
    setLibraryItemId(id);
    const filled = fabricTrimDataFromLibraryItem(item, null);
    setAutoFilled({
      library_item_name: filled.library_item_name,
      category: filled.category,
      composition: filled.composition,
      gsm: filled.gsm,
      supplier_code: filled.supplier_code,
    });
    const options = libraryColourOptions(item);
    setColour(options.length === 1 ? options[0].name : null);
  }

  function buildData(): FabricTrimAnnotationData {
    return {
      library_item_id: libraryItemId,
      library_item_name: autoFilled.library_item_name,
      category: autoFilled.category,
      composition: autoFilled.composition,
      colour,
      gsm: autoFilled.gsm,
      placement: placement.trim() || null,
      quantity: quantity.trim() ? Number(quantity) : null,
      unit,
      supplier_code: autoFilled.supplier_code,
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
          subType,
          props.x,
          props.y,
          "point",
          null,
          null,
          data,
        );
        toast.success("Pin placed.");
        props.onCreated({ id, referenceCode, layerType: subType, data });
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
      {props.mode === "create" && (
        <div className="grid grid-cols-4 gap-1">
          {FABRIC_FAMILY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSubType(key);
                setLibraryItemId(null);
                setColour(null);
                setAutoFilled({
                  library_item_name: null,
                  category: null,
                  composition: null,
                  gsm: null,
                  supplier_code: null,
                });
              }}
              className={
                key === subType
                  ? "bg-brand text-brand-foreground rounded-md px-2 py-1.5 text-xs font-semibold"
                  : "bg-muted text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
              }
            >
              {FABRIC_FAMILY_LABEL[key]}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">
          {FABRIC_FAMILY_LABEL[fixedSubType ?? subType]}
        </Label>
        <FabricPicker
          fabrics={filteredItems}
          value={libraryItemId}
          onChange={handlePickLibraryItem}
          summaryLine={libraryItemSummaryLine}
          placeholder={`Select a ${FABRIC_FAMILY_LABEL[fixedSubType ?? subType].toLowerCase()}…`}
          emptyMessage={
            <>
              No {FABRIC_FAMILY_LABEL[fixedSubType ?? subType].toLowerCase()}s in
              your library yet — add one in{" "}
              <Link
                href="/settings"
                className="text-foreground font-medium underline underline-offset-2"
              >
                Settings → Master Library
              </Link>
              .
            </>
          }
        />
      </div>

      {selectedItem && (
        <div className="bg-muted/50 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md px-3 py-2 text-xs">
          {autoFilled.composition && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Composition: </span>
              <span className="font-medium">{autoFilled.composition}</span>
            </div>
          )}
          {autoFilled.gsm !== null && (
            <div>
              <span className="text-muted-foreground">GSM: </span>
              <span className="font-medium">{autoFilled.gsm}</span>
            </div>
          )}
          {autoFilled.supplier_code && (
            <div>
              <span className="text-muted-foreground">Supplier code: </span>
              <span className="font-medium">{autoFilled.supplier_code}</span>
            </div>
          )}
        </div>
      )}

      {selectedItem && colourOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Colour</Label>
          <Select value={colour ?? undefined} onValueChange={setColour}>
            <SelectTrigger>
              <SelectValue placeholder="Select a colour…" />
            </SelectTrigger>
            <SelectContent>
              {colourOptions.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  <span className="flex items-center gap-2">
                    {c.hex && (
                      <span
                        className="size-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: c.hex }}
                      />
                    )}
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ftpe-placement" className="text-xs">
          Placement
        </Label>
        <Input
          id="ftpe-placement"
          value={placement}
          onChange={(e) => setPlacement(e.target.value)}
          placeholder="e.g. Centre front"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ftpe-quantity" className="text-xs">
            Quantity
          </Label>
          <Input
            id="ftpe-quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Unit</Label>
          <Select
            value={unit ?? undefined}
            onValueChange={(v) => setUnit(v as FabricTrimAnnotationData["unit"])}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unit…" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(UNIT_LABEL) as (keyof typeof UNIT_LABEL)[]).map((u) => (
                <SelectItem key={u} value={u}>
                  {UNIT_LABEL[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ftpe-notes" className="text-xs">
          Notes
        </Label>
        <Textarea
          id="ftpe-notes"
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
