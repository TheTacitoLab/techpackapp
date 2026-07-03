"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
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
  LibraryQuickAddForm,
  useInlineAddedLibraryItems,
} from "@/components/library-quick-add-form";
import {
  BRANDING_LABEL_FAMILY_LABEL,
  BRANDING_LABEL_LIBRARY_CATEGORIES,
  BRANDING_TYPES,
  BRANDING_TYPE_LABEL,
  LABEL_TYPES,
  LABEL_TYPE_LABEL,
  brandingLabelDataFromLibraryItem,
  brandingLabelSummaryLine,
  readBrandingLabelData,
  type BrandingLabelFamilyKey,
} from "@/components/canvas/branding-label-data";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "@/app/(app)/products/[id]/canvas-actions";
import type {
  BrandingLabelAnnotationData,
  BrandingType,
  CanvasAnnotation,
  CanvasLayerType,
  LabelType,
  ResolvedLibraryItem,
} from "@/types";

const FAMILY_KEYS: readonly BrandingLabelFamilyKey[] = ["branding", "label"];

type CreatedResult = {
  id: string;
  referenceCode: string;
  layerType: CanvasLayerType;
  data: BrandingLabelAnnotationData;
};

/**
 * The dedicated Branding & Labels pin editor — the fifth layer's editor,
 * following the Fabrics & Trim pattern exactly: renders as plain content
 * inside the shared centered `PinEditorDialog` (`annotation-pin.tsx` edit
 * mode, `DraftBrandingLabelPin` in `page-canvas.tsx` create mode).
 *
 * Family (Branding vs Labels) IS the pin's layer_type and fixes the B/L
 * reference-code prefix — choosable only at creation, immutable after (house
 * precedent). The specific type within the family (`branding_type` /
 * `label_type`), dimensions, placement, colour, notes and the OPTIONAL
 * library link are all just data — editable in both modes. The library
 * picker inherits the inline quick-add (category-driven: print_type for
 * Branding, label_type for Labels), so a missing artwork/label item can be
 * created on the spot without leaving the canvas.
 */
export function BrandingLabelPinEditor(
  props: { libraryItems: ResolvedLibraryItem[] } & (
    | {
        mode: "edit";
        annotation: CanvasAnnotation;
        onSaved: (data: BrandingLabelAnnotationData) => void;
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
  // Server-passed library merged with anything added inline this session, so
  // a just-created item is selectable before router.refresh() catches up.
  const { items: libraryItems, registerCreated } = useInlineAddedLibraryItems(
    props.libraryItems,
  );

  const initial: BrandingLabelAnnotationData =
    props.mode === "edit"
      ? readBrandingLabelData(props.annotation.data)
      : {
          branding_type: null,
          label_type: null,
          library_item_id: null,
          library_item_name: null,
          library_item_image_url: null,
          width_mm: null,
          height_mm: null,
          placement: null,
          colour: null,
          notes: null,
        };

  // Family is only choosable for a brand-new pin — an existing pin's
  // layer_type (and therefore its B/L reference-code prefix) is fixed forever.
  const fixedFamily =
    props.mode === "edit"
      ? (props.annotation.layer_type as BrandingLabelFamilyKey)
      : null;
  const [family, setFamily] = useState<BrandingLabelFamilyKey>(
    fixedFamily ?? "branding",
  );

  // Per-family specific type — descriptive stored fields (never in the code),
  // so both stay editable on existing pins too.
  const [brandingType, setBrandingType] = useState<BrandingType | null>(
    initial.branding_type,
  );
  const [labelType, setLabelType] = useState<LabelType | null>(
    initial.label_type,
  );

  const [libraryItemId, setLibraryItemId] = useState(initial.library_item_id);
  const [autoFilled, setAutoFilled] = useState<
    Pick<
      BrandingLabelAnnotationData,
      "library_item_name" | "library_item_image_url"
    >
  >({
    library_item_name: initial.library_item_name,
    library_item_image_url: initial.library_item_image_url,
  });
  const [widthMm, setWidthMm] = useState(
    initial.width_mm !== null ? String(initial.width_mm) : "",
  );
  const [heightMm, setHeightMm] = useState(
    initial.height_mm !== null ? String(initial.height_mm) : "",
  );
  const [placement, setPlacement] = useState(initial.placement ?? "");
  const [colour, setColour] = useState(initial.colour ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Inline "add to library" sub-view: non-null while open, carrying the
  // picker's search text to pre-fill the new item's name. Swaps this
  // component's render only — every in-progress pin field stays mounted.
  const [inlineAddName, setInlineAddName] = useState<string | null>(null);

  const categories = BRANDING_LABEL_LIBRARY_CATEGORIES[family];
  const filteredItems = libraryItems.filter((i) =>
    categories.includes(i.category),
  );
  const selectedItem = libraryItems.find((i) => i.id === libraryItemId) ?? null;

  const isBranding = family === "branding";
  const familyNoun = isBranding ? "branding item" : "label";

  function handlePickLibraryItem(id: string, item: ResolvedLibraryItem) {
    setLibraryItemId(id);
    const filled = brandingLabelDataFromLibraryItem(item);
    setAutoFilled({
      library_item_name: filled.library_item_name,
      library_item_image_url: filled.library_item_image_url,
    });
    // Auto-fill the colour where the item carries one; stays editable.
    if (filled.colour) setColour(filled.colour);
  }

  function handleUnlinkLibraryItem() {
    // The link is OPTIONAL — unlinking only clears the denormalised item
    // fields; everything typed on the pin (dimensions, placement…) stays.
    setLibraryItemId(null);
    setAutoFilled({ library_item_name: null, library_item_image_url: null });
  }

  function buildData(): BrandingLabelAnnotationData {
    return {
      branding_type: isBranding ? brandingType : null,
      label_type: !isBranding ? labelType : null,
      library_item_id: libraryItemId,
      library_item_name: autoFilled.library_item_name,
      library_item_image_url: autoFilled.library_item_image_url,
      width_mm: widthMm.trim() ? Number(widthMm) : null,
      height_mm: heightMm.trim() ? Number(heightMm) : null,
      placement: placement.trim() || null,
      colour: colour.trim() || null,
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
          family,
          props.x,
          props.y,
          "point",
          null,
          null,
          data,
        );
        toast.success("Pin placed.");
        props.onCreated({ id, referenceCode, layerType: family, data });
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

  if (inlineAddName !== null) {
    return (
      <LibraryQuickAddForm
        categories={categories}
        defaultCategory={isBranding ? "print_type" : "label_type"}
        initialName={inlineAddName}
        onCreated={(item) => {
          registerCreated(item);
          handlePickLibraryItem(item.id, item);
          setInlineAddName(null);
        }}
        onCancel={() => setInlineAddName(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {props.mode === "create" ? (
        <div className="grid grid-cols-2 gap-1">
          {FAMILY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFamily(key);
                // Family-specific fields reset; user-entered spec fields
                // (dimensions, placement, colour, notes) deliberately survive.
                setBrandingType(null);
                setLabelType(null);
                handleUnlinkLibraryItem();
              }}
              className={
                key === family
                  ? "bg-brand text-brand-foreground rounded-md px-2 py-1.5 text-xs font-semibold"
                  : "bg-muted text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
              }
            >
              {BRANDING_LABEL_FAMILY_LABEL[key]}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">
          Family:{" "}
          <span className="text-foreground font-medium">
            {BRANDING_LABEL_FAMILY_LABEL[family]}
          </span>
        </div>
      )}

      {isBranding ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Branding type</Label>
          <Select
            value={brandingType ?? undefined}
            onValueChange={(v) => setBrandingType(v as BrandingType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a branding type…" />
            </SelectTrigger>
            <SelectContent>
              {BRANDING_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {BRANDING_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Label type</Label>
          <Select
            value={labelType ?? undefined}
            onValueChange={(v) => setLabelType(v as LabelType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a label type…" />
            </SelectTrigger>
            <SelectContent>
              {LABEL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {LABEL_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Library item (optional)</Label>
          {selectedItem && (
            <button
              type="button"
              onClick={handleUnlinkLibraryItem}
              className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-0.5 text-xs transition-colors"
            >
              <X className="size-3" /> Unlink
            </button>
          )}
        </div>
        <FabricPicker
          fabrics={filteredItems}
          value={libraryItemId}
          onChange={handlePickLibraryItem}
          summaryLine={brandingLabelSummaryLine}
          thumbnailUrl={(item) => item.image_url}
          placeholder={`Link a ${familyNoun} from the library…`}
          emptyMessage={<>No {familyNoun}s in your library yet.</>}
          onCreateNew={setInlineAddName}
          createLabel={`Add new ${familyNoun} to library`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="blpe-width" className="text-xs">
            Width (mm)
          </Label>
          <Input
            id="blpe-width"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={widthMm}
            onChange={(e) => setWidthMm(e.target.value)}
            placeholder="e.g. 60"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="blpe-height" className="text-xs">
            Height (mm)
          </Label>
          <Input
            id="blpe-height"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={heightMm}
            onChange={(e) => setHeightMm(e.target.value)}
            placeholder="e.g. 7.5"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="blpe-placement" className="text-xs">
          Placement
        </Label>
        <Input
          id="blpe-placement"
          value={placement}
          onChange={(e) => setPlacement(e.target.value)}
          placeholder="e.g. Centre back neck"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="blpe-colour" className="text-xs">
          Colour
        </Label>
        <Input
          id="blpe-colour"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          placeholder="e.g. White thread / Pantone 19-4052 TCX"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="blpe-notes" className="text-xs">
          Notes
        </Label>
        <Textarea
          id="blpe-notes"
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
