"use client";

import { useState } from "react";
import { SwatchBook, Trash2 } from "lucide-react";
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
import { ColourLibraryPickPanel } from "@/components/canvas/colour-library-picker";
import { useSupplierPartners } from "@/components/canvas/supplier-partners-context";
import {
  FABRIC_FAMILY_LABEL,
  FABRIC_FAMILY_LIBRARY_CATEGORIES,
  TRIM_KINDS,
  TRIM_KIND_LABEL,
  fabricTrimDataFromLibraryItem,
  libraryCategoryForTrimKind,
  libraryColourOptions,
  libraryItemSummaryLine,
  readFabricTrimData,
  trimKindFromLibraryCategory,
  type FabricFamilyKey,
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
  TrimKind,
  WorkspaceColour,
} from "@/types";

const FABRIC_FAMILY_KEYS: readonly FabricFamilyKey[] = ["fabric", "trim"];

// Sentinel for the "no directory partner" Select option — Radix Select can't
// use an empty-string value, so a real token stands in for null.
const NO_PARTNER = "__none__";

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
 * form for pins whose layer_type is fabric/trim. Renders as plain content (no
 * Popover wrapper of its own) so it can be dropped into the existing pin
 * popover (`annotation-pin.tsx`, edit mode) or a "new pin" popover anchored at
 * the click point (`page-canvas.tsx`, create mode). Family (Fabric vs Trim)
 * fixes the layer_type and is immutable after creation; a Trim pin's KIND
 * (`data.trim_kind`) is only descriptive — never in the reference code — so
 * it stays editable in both modes.
 */
export function FabricTrimPinEditor(
  props: {
    libraryItems: ResolvedLibraryItem[];
    /** Workspace colour library for the colour field's "From library" picker. */
    workspaceColours: WorkspaceColour[];
  } & (
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
  // Server-passed library merged with anything added inline this session, so
  // a just-created item is selectable before router.refresh() catches up.
  const { items: libraryItems, registerCreated } = useInlineAddedLibraryItems(
    props.libraryItems,
  );

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
          width_cm: null,
          trim_kind: null,
          placement: null,
          quantity: null,
          unit: null,
          unit_cost: null,
          supplier_code: null,
          supplier_partner_id: null,
          supplier_partner_name: null,
          notes: null,
        };

  // Family is only choosable for a brand-new pin — an existing pin's
  // layer_type (and therefore its reference-code prefix) is fixed forever.
  const fixedSubType =
    props.mode === "edit" ? (props.annotation.layer_type as FabricFamilyKey) : null;
  const [subType, setSubType] = useState<FabricFamilyKey>(fixedSubType ?? "fabric");
  // The trim kind, by contrast, is a descriptive stored field (never part of
  // the reference code), so it stays editable on existing trim pins too.
  const [trimKind, setTrimKind] = useState<TrimKind | null>(initial.trim_kind);

  // The workspace's supplier/factory partners (from context) for the supplier
  // picker — empty when none exist yet.
  const supplierPartners = useSupplierPartners();

  const [libraryItemId, setLibraryItemId] = useState(initial.library_item_id);
  const [autoFilled, setAutoFilled] = useState<
    Pick<FabricTrimAnnotationData, "library_item_name" | "category" | "composition" | "gsm">
  >({
    library_item_name: initial.library_item_name,
    category: initial.category,
    composition: initial.composition,
    gsm: initial.gsm,
  });
  // Supplier: a Partner-directory link (preferred) plus a free-text fallback
  // (supplier_code) for anything not in the directory. Both can be set; the
  // directory link is what P2's portal reads, the free text is display-only.
  const [supplierPartnerId, setSupplierPartnerId] = useState(
    initial.supplier_partner_id,
  );
  const [supplierCode, setSupplierCode] = useState(initial.supplier_code ?? "");
  const [colour, setColour] = useState(initial.colour);
  const [placement, setPlacement] = useState(initial.placement ?? "");
  const [quantity, setQuantity] = useState(
    initial.quantity !== null ? String(initial.quantity) : "",
  );
  const [unit, setUnit] = useState<FabricTrimAnnotationData["unit"]>(initial.unit);
  // Fabric width (cm) — fabric family only; trims never carry one.
  const [widthCm, setWidthCm] = useState(
    initial.width_cm !== null ? String(initial.width_cm) : "",
  );
  // Cost per the chosen unit — both families; drives the BOM's Total column.
  const [unitCost, setUnitCost] = useState(
    initial.unit_cost !== null ? String(initial.unit_cost) : "",
  );
  const [notes, setNotes] = useState(initial.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Inline "add to library" sub-view: non-null while open, carrying the
  // picker's search text to pre-fill the new item's name. The sub-view swaps
  // this component's RENDER only — the component (and every in-progress pin
  // field above) stays mounted, so the detour loses nothing.
  const [inlineAddName, setInlineAddName] = useState<string | null>(null);
  // Inline "pick from workspace colour library" sub-view — same detour pattern.
  const [pickingColour, setPickingColour] = useState(false);

  // The Trim family's picker spans every trim-ish library category (trim +
  // fastener + elastic) in one searchable list — the Master Library keeps its
  // finer categories, the canvas just stops splitting them into layer types.
  const categories = FABRIC_FAMILY_LIBRARY_CATEGORIES[subType];
  const filteredItems = libraryItems.filter((i) =>
    categories.includes(i.category),
  );
  const selectedItem = libraryItems.find((i) => i.id === libraryItemId) ?? null;
  // Supplier options = the live directory, PLUS the pin's own partner if it has
  // since been deleted (its id no longer resolves). Keeping the dangling
  // partner as an option preserves the retained name — the delete-partner flow
  // deliberately leaves the denormalised `supplier_partner_name` on the pin —
  // so it stays visible in the Select and round-trips through buildData()
  // instead of being silently nulled when an unrelated field is edited.
  const supplierPartnerOptions =
    supplierPartnerId &&
    !supplierPartners.some((p) => p.id === supplierPartnerId)
      ? [
          ...supplierPartners,
          {
            id: supplierPartnerId,
            name: initial.supplier_partner_name ?? "Unknown partner",
            type: "supplier" as const,
          },
        ]
      : supplierPartners;
  const supplierPartner =
    supplierPartnerOptions.find((p) => p.id === supplierPartnerId) ?? null;
  const colourOptions = selectedItem ? libraryColourOptions(selectedItem) : [];
  // A colour picked from the WORKSPACE library isn't among the item's own
  // variants — append it as an extra option so the Select can display it
  // (swatch resolved live from the library list when the name still matches).
  const extendedColourOptions =
    colour && !colourOptions.some((o) => o.name === colour)
      ? [
          ...colourOptions,
          {
            name: colour,
            hex: props.workspaceColours.find((w) => w.name === colour)?.hex,
          },
        ]
      : colourOptions;

  function handlePickLibraryItem(id: string, item: ResolvedLibraryItem) {
    setLibraryItemId(id);
    const filled = fabricTrimDataFromLibraryItem(item, null);
    setAutoFilled({
      library_item_name: filled.library_item_name,
      category: filled.category,
      composition: filled.composition,
      gsm: filled.gsm,
    });
    // If the library item carries a supplier code and the field is empty,
    // seed the free-text fallback with it (still editable).
    if (filled.supplier_code && !supplierCode.trim()) {
      setSupplierCode(filled.supplier_code);
    }
    const options = libraryColourOptions(item);
    setColour(options.length === 1 ? options[0].name : null);
    // A fastener/elastic library item states what kind of trim it is —
    // auto-fill the Trim type (still user-editable afterwards).
    if (subType === "trim") {
      const derived = trimKindFromLibraryCategory(item.category);
      if (derived) setTrimKind(derived);
    }
  }

  function buildData(): FabricTrimAnnotationData {
    return {
      library_item_id: libraryItemId,
      library_item_name: autoFilled.library_item_name,
      category: autoFilled.category,
      composition: autoFilled.composition,
      colour,
      gsm: autoFilled.gsm,
      width_cm:
        subType === "fabric" && widthCm.trim() ? Number(widthCm) : null,
      trim_kind: subType === "trim" ? trimKind : null,
      placement: placement.trim() || null,
      quantity: quantity.trim() ? Number(quantity) : null,
      unit,
      unit_cost: unitCost.trim() ? Number(unitCost) : null,
      supplier_code: supplierCode.trim() || null,
      supplier_partner_id: supplierPartner?.id ?? null,
      supplier_partner_name: supplierPartner?.name ?? null,
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

  if (inlineAddName !== null) {
    return (
      <LibraryQuickAddForm
        categories={FABRIC_FAMILY_LIBRARY_CATEGORIES[subType]}
        defaultCategory={
          subType === "trim" ? libraryCategoryForTrimKind(trimKind) : "fabric"
        }
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

  if (pickingColour) {
    return (
      <ColourLibraryPickPanel
        colours={props.workspaceColours}
        onPick={(picked) => {
          setColour(picked.name);
          setPickingColour(false);
        }}
        onCancel={() => setPickingColour(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {props.mode === "create" && (
        <div className="grid grid-cols-2 gap-1">
          {FABRIC_FAMILY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSubType(key);
                setTrimKind(null);
                setLibraryItemId(null);
                setColour(null);
                setAutoFilled({
                  library_item_name: null,
                  category: null,
                  composition: null,
                  gsm: null,
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

      {subType === "trim" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Trim type</Label>
          <Select
            value={trimKind ?? undefined}
            onValueChange={(v) => setTrimKind(v as TrimKind)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a trim type…" />
            </SelectTrigger>
            <SelectContent>
              {TRIM_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {TRIM_KIND_LABEL[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">{FABRIC_FAMILY_LABEL[subType]}</Label>
        <FabricPicker
          fabrics={filteredItems}
          value={libraryItemId}
          onChange={handlePickLibraryItem}
          summaryLine={libraryItemSummaryLine}
          placeholder={`Select a ${FABRIC_FAMILY_LABEL[subType].toLowerCase()}…`}
          emptyMessage={
            <>No {FABRIC_FAMILY_LABEL[subType].toLowerCase()}s in your library yet.</>
          }
          onCreateNew={setInlineAddName}
          createLabel={`Add new ${FABRIC_FAMILY_LABEL[subType].toLowerCase()} to library`}
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
        </div>
      )}

      {selectedItem &&
        (extendedColourOptions.length > 0 ||
          props.workspaceColours.length > 0) && (
          <div className="space-y-1.5">
            <Label className="text-xs">Colour</Label>
            <div className="flex items-center gap-2">
              {extendedColourOptions.length > 0 && (
                <Select value={colour ?? undefined} onValueChange={setColour}>
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder="Select a colour…" />
                  </SelectTrigger>
                  <SelectContent>
                    {extendedColourOptions.map((c) => (
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
              )}
              {props.workspaceColours.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setPickingColour(true)}
                  title="Pick a colour from your workspace library"
                >
                  <SwatchBook className="size-4" />
                  From library
                </Button>
              )}
            </div>
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

      <div className="grid grid-cols-2 gap-2">
        {subType === "fabric" && (
          <div className="space-y-1.5">
            <Label htmlFor="ftpe-width" className="text-xs">
              Width (cm)
            </Label>
            <Input
              id="ftpe-width"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ftpe-unit-cost" className="text-xs">
            Unit cost
          </Label>
          <Input
            id="ftpe-unit-cost"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder={unit ? `Cost ${UNIT_LABEL[unit]}` : "Cost per unit"}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Supplier</Label>
        {supplierPartnerOptions.length > 0 && (
          <Select
            value={supplierPartnerId ?? NO_PARTNER}
            onValueChange={(v) =>
              setSupplierPartnerId(v === NO_PARTNER ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Link a partner…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARTNER}>
                Not in directory
              </SelectItem>
              {supplierPartnerOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={supplierCode}
          onChange={(e) => setSupplierCode(e.target.value)}
          placeholder={
            supplierPartners.length > 0
              ? "Supplier code or reference (optional)"
              : "Supplier code or name (optional)"
          }
        />
        <p className="text-muted-foreground text-xs">
          {supplierPartners.length > 0
            ? "Link a directory partner, or type a supplier that isn’t in your directory. Manage partners in Settings → Partners."
            : "Add partners in Settings → Partners to link suppliers from your directory."}
        </p>
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
