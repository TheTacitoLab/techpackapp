"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  createLibraryItem,
  deleteLibraryItem,
  toggleGlobalItem,
  updateLibraryItem,
} from "@/app/(app)/settings/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { LibraryCategory, ResolvedLibraryItem } from "@/types";

// ---- Category + field configuration ------------------------------------------

const CATEGORY_META: { key: LibraryCategory; label: string }[] = [
  { key: "fabric", label: "Fabrics" },
  { key: "trim", label: "Trims" },
  { key: "fastener", label: "Fasteners" },
  { key: "elastic", label: "Elastics" },
  { key: "stitch_type", label: "Stitch Types" },
  { key: "thread", label: "Thread" },
  { key: "label_type", label: "Labels" },
  { key: "print_type", label: "Print Types" },
  { key: "packaging", label: "Packaging" },
  { key: "interlining", label: "Interlining" },
];

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number";
  placeholder?: string;
};

// Per-category property fields rendered dynamically in the add/edit form.
const FIELD_CONFIG: Record<LibraryCategory, FieldDef[]> = {
  fabric: [
    { key: "composition", label: "Composition", type: "text", placeholder: "92% Polyester / 8% Elastane" },
    { key: "gsm", label: "GSM", type: "number", placeholder: "180" },
    { key: "width_cm", label: "Width (cm)", type: "number", placeholder: "150" },
    { key: "construction", label: "Construction", type: "text", placeholder: "Single Jersey Knit" },
    { key: "finish", label: "Finish", type: "text", placeholder: "Moisture-wicking" },
    { key: "stretch", label: "Stretch", type: "text", placeholder: "4-way" },
  ],
  trim: [
    { key: "width_mm", label: "Width (mm)", type: "number", placeholder: "20" },
    { key: "composition", label: "Composition", type: "text", placeholder: "100% Polyester" },
  ],
  fastener: [
    { key: "brand", label: "Brand", type: "text", placeholder: "YKK" },
    { key: "zip_type", label: "Type", type: "text", placeholder: "Nylon Coil" },
    { key: "gauge", label: "Gauge / Size", type: "text", placeholder: "#5" },
    { key: "pull_type", label: "Pull / Mechanism", type: "text", placeholder: "Auto-lock slider" },
    { key: "material", label: "Material", type: "text", placeholder: "Brass" },
    { key: "finish", label: "Finish", type: "text", placeholder: "Matte" },
  ],
  elastic: [
    { key: "width_mm", label: "Width (mm)", type: "number", placeholder: "30" },
    { key: "elastic_type", label: "Type", type: "text", placeholder: "Flat woven" },
    { key: "stretch_pct", label: "Stretch %", type: "number", placeholder: "130" },
    { key: "composition", label: "Composition", type: "text", placeholder: "65% Polyester / 35% Rubber" },
  ],
  stitch_type: [
    { key: "spi_range", label: "SPI Range", type: "text", placeholder: "10-12" },
    { key: "thread_weight", label: "Thread Weight", type: "number", placeholder: "120" },
    { key: "iso_code", label: "ISO Code", type: "text", placeholder: "504" },
    { key: "use_case", label: "Typical Use", type: "text", placeholder: "Edge finishing, seams" },
  ],
  thread: [
    { key: "brand", label: "Brand", type: "text", placeholder: "Coats" },
    { key: "thread_ref", label: "Reference", type: "text", placeholder: "Epic" },
    { key: "weight", label: "Weight", type: "number", placeholder: "80" },
    { key: "thread_type", label: "Type", type: "text", placeholder: "Spun Polyester" },
  ],
  label_type: [
    { key: "size_mm", label: "Size", type: "text", placeholder: "55x30mm" },
    { key: "construction", label: "Construction", type: "text", placeholder: "Damask woven" },
    { key: "attachment", label: "Attachment", type: "text", placeholder: "Sew-in (centre fold)" },
    { key: "wash_fastness", label: "Wash Fastness", type: "text", placeholder: "High" },
  ],
  print_type: [
    { key: "artwork_format", label: "Artwork Format", type: "text", placeholder: "AI / EPS vector" },
    { key: "colour_mode", label: "Colour Mode", type: "text", placeholder: "Spot (Pantone)" },
    { key: "max_colours", label: "Max Colours", type: "number", placeholder: "8" },
    { key: "placement_notes", label: "Notes", type: "text", placeholder: "Separated layers" },
  ],
  packaging: [
    { key: "size", label: "Size", type: "text", placeholder: "30x40cm" },
    { key: "gauge_micron", label: "Gauge (micron)", type: "number", placeholder: "50" },
    { key: "material", label: "Material", type: "text", placeholder: "LDPE" },
    { key: "pkg_type", label: "Type", type: "text", placeholder: "Self-seal" },
  ],
  interlining: [
    { key: "gsm", label: "GSM", type: "number", placeholder: "40" },
    { key: "interlining_type", label: "Type", type: "text", placeholder: "Woven fusible" },
    { key: "width_cm", label: "Width (cm)", type: "number", placeholder: "90" },
    { key: "bonding_temp", label: "Bonding Temp", type: "text", placeholder: "130°C" },
    { key: "stretch_direction", label: "Stretch", type: "text", placeholder: "None" },
  ],
};

const COLOUR_CATEGORIES = new Set<LibraryCategory>([
  "fabric",
  "trim",
  "fastener",
  "elastic",
  "thread",
]);

const HEX = /^#[0-9A-Fa-f]{6}$/;

type Colour = { name: string; pantone_tcx: string; hex: string };
type SourceFilter = "all" | "techpack" | "mine" | "hidden";

// ---- Property helpers --------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseColours(props: Record<string, unknown>): Colour[] {
  const raw = props.colours;
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const o = asRecord(c);
    return {
      name: typeof o.name === "string" ? o.name : "",
      pantone_tcx: typeof o.pantone_tcx === "string" ? o.pantone_tcx : "",
      hex: typeof o.hex === "string" ? o.hex : "#000000",
    };
  });
}

/** Short one-line summary of an item's key properties for the card. */
function summarise(category: LibraryCategory, props: Record<string, unknown>) {
  const parts: string[] = [];
  for (const f of FIELD_CONFIG[category]) {
    const v = props[f.key];
    if (v === null || v === undefined || v === "") continue;
    parts.push(f.type === "number" ? `${v}${f.key.includes("gsm") ? "gsm" : ""}` : String(v));
    if (parts.length >= 3) break;
  }
  return parts.join(" · ");
}

// ---- Add / edit form dialog --------------------------------------------------

function ItemFormDialog({
  mode,
  category,
  item,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  category: LibraryCategory;
  item?: ResolvedLibraryItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fields = FIELD_CONFIG[category];
  const showColours = COLOUR_CATEGORIES.has(category);

  const initialProps = useMemo(() => asRecord(item?.properties), [item]);
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      const raw = initialProps[f.key];
      v[f.key] = raw === null || raw === undefined ? "" : String(raw);
    }
    return v;
  });
  const [colours, setColours] = useState<Colour[]>(() =>
    parseColours(initialProps),
  );

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function buildProperties(): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key]?.trim();
      if (!raw) continue;
      properties[f.key] =
        f.type === "number" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    }
    if (showColours) {
      const clean = colours.filter((c) => c.name.trim());
      if (clean.length) properties.colours = clean;
    }
    return properties;
  }

  function onSubmit() {
    if (!name.trim()) {
      toast.error("Enter a name.");
      return;
    }
    const properties = buildProperties();
    startTransition(async () => {
      try {
        if (mode === "create") {
          await createLibraryItem(category, name.trim(), description.trim(), properties);
          toast.success("Item added to your library.");
        } else if (item) {
          await updateLibraryItem(item.id, name.trim(), description.trim(), properties);
          toast.success("Item updated.");
        }
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error(
          mode === "create" ? "Could not add item." : "Could not update item.",
        );
      }
    });
  }

  const categoryLabel =
    CATEGORY_META.find((c) => c.key === category)?.label ?? "Item";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? `Add ${categoryLabel} item` : "Edit item"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Custom Jersey"
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Description</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short description"
              maxLength={300}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.key} className="space-y-2">
                <FieldLabel>{f.label}</FieldLabel>
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValue(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
          </div>

          {showColours && (
            <ColourEditor colours={colours} onChange={setColours} />
          )}
        </div>

        <DialogFooter>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending
              ? "Saving…"
              : mode === "create"
                ? "Add item"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Colour editor (repeatable {name, pantone, hex} rows) --------------------

function ColourEditor({
  colours,
  onChange,
}: {
  colours: Colour[];
  onChange: (next: Colour[]) => void;
}) {
  function update(i: number, patch: Partial<Colour>) {
    onChange(colours.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function add() {
    onChange([...colours, { name: "", pantone_tcx: "", hex: "#000000" }]);
  }
  function remove(i: number) {
    onChange(colours.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <FieldLabel>Colourways</FieldLabel>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      {colours.length === 0 ? (
        <p className="text-muted-foreground text-xs">No colourways added.</p>
      ) : (
        <div className="space-y-2">
          {colours.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={HEX.test(c.hex) ? c.hex : "#000000"}
                onChange={(e) => update(i, { hex: e.target.value.toUpperCase() })}
                aria-label="Colour swatch"
                className="size-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
              />
              <Input
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Name"
                className="flex-1"
              />
              <Input
                value={c.pantone_tcx}
                onChange={(e) => update(i, { pantone_tcx: e.target.value })}
                placeholder="Pantone TCX"
                className="w-32"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove colourway"
                className="text-muted-foreground hover:text-destructive flex size-7 shrink-0 cursor-pointer items-center justify-center rounded transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Single item row ---------------------------------------------------------

function LibraryItemRow({ item }: { item: ResolvedLibraryItem }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const props = asRecord(item.properties);
  const summary = summarise(item.category, props);
  const colours = parseColours(props);

  function onToggle(hidden: boolean) {
    startTransition(async () => {
      try {
        await toggleGlobalItem(item.id, hidden);
        toast.success(hidden ? "Hidden from your library." : "Restored to your library.");
        router.refresh();
      } catch {
        toast.error("Could not update item.");
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteLibraryItem(item.id);
        toast.success("Item deleted.");
        router.refresh();
      } catch {
        toast.error("Could not delete item.");
      }
    });
  }

  return (
    <li
      className={cn(
        "bg-card flex items-center gap-3 rounded-lg border p-3",
        item.isHidden && "opacity-60",
      )}
    >
      {item.category === "stitch_type" && item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt=""
          className="bg-muted size-14 shrink-0 rounded-md border object-contain p-1"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          {item.isGlobal ? (
            <Badge variant="secondary" className="shrink-0">
              TechPackApp
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">
              Custom
            </Badge>
          )}
        </div>
        {summary && (
          <p className="text-muted-foreground truncate text-xs">{summary}</p>
        )}
        {colours.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            {colours.slice(0, 8).map((c, i) => (
              <span
                key={i}
                title={c.name}
                className="size-3 rounded-full border"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {item.isGlobal ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => onToggle(!item.isHidden)}
            className="gap-1.5"
          >
            {item.isHidden ? (
              <>
                <Eye className="size-3.5" /> Show
              </>
            ) : (
              <>
                <EyeOff className="size-3.5" /> Hide
              </>
            )}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setEditOpen(true)}
              aria-label={`Edit ${item.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 className="text-destructive size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete &ldquo;{item.name}&rdquo;?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the item from your workspace library. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isPending ? "Deleting…" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {editOpen && (
              <ItemFormDialog
                key={item.id}
                mode="edit"
                category={item.category}
                item={item}
                open={editOpen}
                onOpenChange={setEditOpen}
              />
            )}
          </>
        )}
      </div>
    </li>
  );
}

// ---- Library manager ---------------------------------------------------------

const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "techpack", label: "TechPackApp Library" },
  { key: "mine", label: "My Library" },
  { key: "hidden", label: "Hidden" },
];

export function LibraryManager({ items }: { items: ResolvedLibraryItem[] }) {
  const [category, setCategory] = useState<LibraryCategory>("fabric");
  const [source, setSource] = useState<SourceFilter>("all");
  const [addOpen, setAddOpen] = useState(false);

  const visible = useMemo(() => {
    return items.filter((it) => {
      if (it.category !== category) return false;
      switch (source) {
        case "techpack":
          return it.isGlobal && !it.isHidden;
        case "mine":
          return !it.isGlobal;
        case "hidden":
          return it.isGlobal && it.isHidden;
        case "all":
        default:
          return !it.isHidden; // active library: global-not-hidden + workspace
      }
    });
  }, [items, category, source]);

  const categoryLabel =
    CATEGORY_META.find((c) => c.key === category)?.label ?? "";

  return (
    <div className="space-y-4">
      <Tabs
        value={category}
        onValueChange={(v) => setCategory(v as LibraryCategory)}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          {CATEGORY_META.map((c) => (
            <TabsTrigger key={c.key} value={c.key}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {SOURCE_FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={source === f.key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSource(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" /> Add {categoryLabel} item
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {source === "hidden"
            ? "No hidden items in this category."
            : source === "mine"
              ? "You haven't added any items in this category yet."
              : "No items in this category."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <LibraryItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {addOpen && (
        <ItemFormDialog
          key={`create-${category}`}
          mode="create"
          category={category}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      )}
    </div>
  );
}
