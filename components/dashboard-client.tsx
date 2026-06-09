"use client";

import { useMemo, useState } from "react";
import { Archive, PackagePlus, Search } from "lucide-react";

import { CreateCollectionDialogSimple } from "@/components/hierarchy-dialogs";
import { CreateProductDialog } from "@/components/create-product-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProductCard } from "@/components/product-card";
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
import { useUiStore } from "@/stores/ui-store";
import type { Brand, Collection, Product, Season, SectionStatus } from "@/types";

type SectionSummary = { product_id: string; status: SectionStatus };

const PRODUCT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "sent_to_factory", label: "Sent to Factory" },
  { value: "sample_received", label: "Sample Received" },
  { value: "approved", label: "Approved" },
  { value: "in_production", label: "In Production" },
] as const;

export function DashboardClient({
  workspaceName,
  brands,
  seasons,
  collections,
  products,
  sections,
}: {
  workspaceName: string | null;
  brands: Brand[];
  seasons: Season[];
  collections: Collection[];
  products: Product[];
  sections: SectionSummary[];
}) {
  const { activeCollectionId, setActiveCollectionId, showArchived, setShowArchived } = useUiStore();

  const [searchInput, setSearchInput] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedSeason, setSelectedSeason] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const search = useDebounce(searchInput);

  const brandById = useMemo(
    () => new Map(brands.map((b) => [b.id, b.name])),
    [brands],
  );

  const collectionById = useMemo(
    () => new Map(collections.map((c) => [c.id, c])),
    [collections],
  );

  const sectionStatusMap = useMemo(() => {
    const map = new Map<string, SectionStatus[]>();
    for (const s of sections) {
      const arr = map.get(s.product_id) ?? [];
      arr.push(s.status);
      map.set(s.product_id, arr);
    }
    return map;
  }, [sections]);

  const filteredCollections =
    selectedBrand !== "all"
      ? collections.filter((c) => c.brand_id === selectedBrand)
      : collections;

  const filtered = useMemo(() => {
    let result = products.filter((p) =>
      showArchived ? p.archived_at !== null : p.archived_at === null,
    );

    if (activeCollectionId) {
      result = result.filter((p) => p.collection_id === activeCollectionId);
    } else {
      if (selectedBrand !== "all") {
        result = result.filter((p) => p.brand_id === selectedBrand);
      }
      if (selectedSeason !== "all") {
        result = result.filter((p) => {
          if (!p.collection_id) return false;
          const col = collectionById.get(p.collection_id);
          return col?.season_id === selectedSeason;
        });
      }
    }

    if (selectedStatus !== "all") {
      result = result.filter((p) => p.status === selectedStatus);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.style_number ?? "").toLowerCase().includes(q) ||
          (p.brand_id
            ? (brandById.get(p.brand_id) ?? "").toLowerCase().includes(q)
            : false) ||
          (p.collection_id
            ? (collectionById.get(p.collection_id)?.name ?? "")
                .toLowerCase()
                .includes(q)
            : false),
      );
    }

    return result;
  }, [
    products,
    showArchived,
    activeCollectionId,
    selectedBrand,
    selectedSeason,
    selectedStatus,
    search,
    brandById,
    collectionById,
  ]);

  const hasAnyProducts = products.length > 0;
  const hasArchived = products.some((p) => p.archived_at !== null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">
            {workspaceName ?? "Your workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateCollectionDialogSimple seasons={seasons} />
          <CreateProductDialog collections={collections} />
        </div>
      </div>

      {/* Filters */}
      {hasAnyProducts && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search products…"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {brands.length > 0 && (
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger className="w-[160px]">
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

          {filteredCollections.length > 0 && !activeCollectionId && (
            <Select
              value="all"
              onValueChange={(v) => {
                if (v !== "all") setActiveCollectionId(v);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All collections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collections</SelectItem>
                {filteredCollections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {activeCollectionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveCollectionId(null)}
              className="gap-1.5"
            >
              {collectionById.get(activeCollectionId)?.name ?? "Collection"}
              <span className="text-muted-foreground">×</span>
            </Button>
          )}

          {seasons.length > 0 && (
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All seasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All seasons</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PRODUCT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Archived toggle */}
      {hasArchived && (
        <div className="flex">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <Archive className="size-3.5" />
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
      )}

      {/* Empty states */}
      {!hasAnyProducts && (
        <EmptyState
          icon={PackagePlus}
          title="No products yet"
          description="Create your first tech pack to start building modular, factory-ready sections."
          action={<CreateProductDialog collections={collections} />}
        />
      )}

      {hasAnyProducts && filtered.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title={
            showArchived ? "No archived products" : "No products match your filters"
          }
          description={
            showArchived
              ? "Archive products to hide them from the main view."
              : "Try adjusting your search or filter."
          }
        />
      )}

      {/* Product grid */}
      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              brandName={
                product.brand_id
                  ? (brandById.get(product.brand_id) ?? null)
                  : null
              }
              sectionStatuses={sectionStatusMap.get(product.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
