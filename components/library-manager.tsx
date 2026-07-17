"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createLibraryItem,
  deleteLibraryItem,
  toggleFavouriteItem,
  toggleGlobalItem,
  updateLibraryItem,
} from "@/app/(app)/settings/actions";
import { ColourEditor } from "@/components/library-colour-editor";
import {
  CATEGORY_META,
  COLOUR_CATEGORIES,
  FIELD_CONFIG,
  asRecord,
  buildLibraryProperties,
  parseColours,
  type Colour,
} from "@/components/library-item-fields";
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

// Category metadata, per-category field definitions, colour helpers and the
// properties builder all live in the shared `library-item-fields` module —
// one source of truth with the inline quick-add form the annotation editors
// open from their picker (`library-quick-add-form.tsx`).

type SourceFilter = "all" | "garspec" | "mine" | "hidden";

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

  function onSubmit() {
    if (!name.trim()) {
      toast.error("Enter a name.");
      return;
    }
    // The shared builder; non-colour categories pass no rows so a stray
    // `colours` key can never be (re)introduced on their items.
    const properties = buildLibraryProperties(
      fields,
      values,
      showColours ? colours : [],
    );
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

  function onFavourite(favourite: boolean) {
    startTransition(async () => {
      try {
        await toggleFavouriteItem(item.id, favourite);
        toast.success(
          favourite ? "Added to favourites." : "Removed from favourites.",
        );
        router.refresh();
      } catch {
        toast.error("Could not update favourites.");
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
              GarSpec
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
        {/* Star toggle — every item (GarSpec or Custom) can be a favourite;
            the filled lockup-coloured star makes the starred state readable
            at a glance. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isPending}
          onClick={() => onFavourite(!item.isFavourite)}
          aria-label={
            item.isFavourite
              ? `Remove ${item.name} from favourites`
              : `Add ${item.name} to favourites`
          }
        >
          <Star
            className={cn(
              "size-3.5",
              item.isFavourite
                ? "fill-brand text-brand-foreground"
                : "text-muted-foreground",
            )}
          />
        </Button>
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
  { key: "garspec", label: "GarSpec Library" },
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
        case "garspec":
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
