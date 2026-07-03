"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { createLibraryItem } from "@/app/(app)/settings/actions";
import { ColourEditor } from "@/components/library-colour-editor";
import {
  CATEGORY_SINGULAR,
  COLOUR_CATEGORIES,
  FIELD_CONFIG,
  buildLibraryProperties,
  type Colour,
} from "@/components/library-item-fields";
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
import type { LibraryCategory, ResolvedLibraryItem } from "@/types";

/**
 * The inline "add to Master Library" form the annotation editors open from
 * their library picker — a sub-view WITHIN the pin editor dialog (never a
 * second dialog), so the pin's other in-progress fields stay mounted in the
 * parent editor and survive the detour untouched.
 *
 * Entirely category-driven: fields come from the shared `FIELD_CONFIG`, the
 * colour-variant editor appears for the shared `COLOUR_CATEGORIES`, and
 * creation goes through the same `createLibraryItem` server action Settings
 * uses (workspace-scoped) — one source of truth, so a future layer's
 * categories (branding/labels) plug in by just passing them. Kept compact by
 * design: name + the category's property fields; description/enrichment can
 * happen later in Settings.
 */
export function LibraryQuickAddForm({
  categories,
  defaultCategory,
  initialName,
  onCreated,
  onCancel,
}: {
  /** The categories this picker context allows (>1 shows a category select). */
  categories: readonly LibraryCategory[];
  defaultCategory: LibraryCategory;
  /** Pre-filled from the picker's search text — what the user typed IS the name. */
  initialName: string;
  /** Called with the created item (already resolved) to auto-select it. */
  onCreated: (item: ResolvedLibraryItem) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<LibraryCategory>(defaultCategory);
  const [name, setName] = useState(initialName);
  const [values, setValues] = useState<Record<string, string>>({});
  const [colours, setColours] = useState<Colour[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const fields = FIELD_CONFIG[category];
  const showColours = COLOUR_CATEGORIES.has(category);

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleAdd() {
    if (!name.trim()) {
      toast.error("Enter a name.");
      return;
    }
    setIsSaving(true);
    try {
      const properties = buildLibraryProperties(
        fields,
        values,
        showColours ? colours : [],
      );
      const row = await createLibraryItem(category, name.trim(), "", properties);
      toast.success("Added to your library.");
      // The action already revalidates /settings; refresh this route too so
      // the server-passed library everywhere catches up. The caller doesn't
      // wait for it — the returned row is selected immediately.
      router.refresh();
      onCreated({ ...row, isGlobal: false, isHidden: false });
    } catch {
      // Leave the form (and everything typed) intact for a retry.
      toast.error("Could not add the item.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to pin"
          className="text-muted-foreground hover:text-foreground -ml-1 flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">Add to Master Library</span>
      </div>

      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-0.5">
        {categories.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as LibraryCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="capitalize">{CATEGORY_SINGULAR[c]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="lqa-name" className="text-xs">
            Name
          </Label>
          <Input
            id="lqa-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. My ${CATEGORY_SINGULAR[category]}`}
            maxLength={80}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`lqa-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={`lqa-${f.key}`}
                type={f.type === "number" ? "number" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValue(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>

        {showColours && <ColourEditor colours={colours} onChange={setColours} />}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={isSaving} onClick={handleAdd}>
          {isSaving ? "Adding…" : "Add & select"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Merge the server-passed library with items created inline this session, so
 * a just-created item is pickable/selected IMMEDIATELY — before the
 * `router.refresh()` round-trip delivers it in the server props. Dedupes by
 * id, so once the refreshed props include the item nothing doubles up.
 */
export function useInlineAddedLibraryItems(base: ResolvedLibraryItem[]): {
  items: ResolvedLibraryItem[];
  registerCreated: (item: ResolvedLibraryItem) => void;
} {
  const [added, setAdded] = useState<ResolvedLibraryItem[]>([]);

  const items = useMemo(() => {
    if (added.length === 0) return base;
    const baseIds = new Set(base.map((i) => i.id));
    const fresh = added.filter((i) => !baseIds.has(i.id));
    return fresh.length > 0 ? [...base, ...fresh] : base;
  }, [base, added]);

  const registerCreated = useCallback((item: ResolvedLibraryItem) => {
    setAdded((prev) => [...prev, item]);
  }, []);

  return { items, registerCreated };
}
