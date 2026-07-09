"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Plus, Search } from "lucide-react";

import { CollectionCard, type CollectionCardData } from "@/components/collection-card";
import { CreateCollectionDialog } from "@/components/hierarchy-dialogs";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import type { Brand, Collection, Label, Season } from "@/types";

/** A top-level collection card plus the raw brand id its filter matches on. */
export type DashboardCollection = CollectionCardData & {
  brandId: string;
};

/**
 * The Collections dashboard: a grid of top-level collection cards with
 * search, brand and label filters. Sub-collections don't get their own
 * cards here — they live on their parent's detail page and roll up into its
 * counts, progress and cover.
 */
export function CollectionsDashboardClient({
  items,
  brands,
  seasons,
  labels,
  collections,
}: {
  items: DashboardCollection[];
  brands: Brand[];
  seasons: Season[];
  labels: Label[];
  /** All workspace collections — parent options for the creation dialog. */
  collections: Collection[];
}) {
  const [searchInput, setSearchInput] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [labelFilter, setLabelFilter] = useState<string>("all");

  const search = useDebounce(searchInput);

  const filtered = useMemo(() => {
    let result = items;
    if (brandFilter !== "all") {
      result = result.filter((c) => c.brandId === brandFilter);
    }
    if (labelFilter !== "all") {
      result = result.filter((c) =>
        c.labels.some((l) => l.id === labelFilter),
      );
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    return result;
  }, [items, brandFilter, labelFilter, search]);

  const newCollectionButton = (
    <CreateCollectionDialog
      brands={brands}
      seasons={seasons}
      collections={collections}
      trigger={
        <Button>
          <Plus />
          New Collection
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
          <p className="text-muted-foreground text-sm">
            {items.length}{" "}
            {items.length === 1 ? "collection" : "collections"}
          </p>
        </div>
        {newCollectionButton}
      </div>

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search collections…"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {brands.length > 0 && (
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {labels.length > 0 && (
            <Select value={labelFilter} onValueChange={setLabelFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All labels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All labels</SelectItem>
                {labels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      {l.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Empty states */}
      {items.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="No collections yet"
          description="Collections group your products — by client, team, range, or however you work."
          action={newCollectionButton}
        />
      )}

      {items.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="No collections match your filters"
          description="Try adjusting your search or filter."
        />
      )}

      {/* Card grid */}
      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <CollectionCard key={item.id} collection={item} />
          ))}
        </div>
      )}
    </div>
  );
}
