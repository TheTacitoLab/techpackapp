"use client";

import { useMemo, useState } from "react";
import { Archive, PackagePlus, Search } from "lucide-react";

import { CreateCollectionDialogSimple } from "@/components/hierarchy-dialogs";
import { CreateProductDialog } from "@/components/create-product-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProductCard } from "@/components/product-card";
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
import type {
  Brand,
  Collection,
  Label,
  Product,
  Season,
  SectionStatus,
} from "@/types";

type SectionSummary = { product_id: string; status: SectionStatus };
type ProductLabelLink = { product_id: string; label_id: string };
type CardLabel = { id: string; name: string; color: string };

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
  labels,
  productLabels,
}: {
  workspaceName: string | null;
  brands: Brand[];
  seasons: Season[];
  collections: Collection[];
  products: Product[];
  sections: SectionSummary[];
  labels: Label[];
  productLabels: ProductLabelLink[];
}) {
  const { activeBrandId, activeCollectionId, setActiveCollectionId, showArchived, setShowArchived } =
    useUiStore();

  const [searchInput, setSearchInput] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [labelFilter, setLabelFilter] = useState<string>("all");

  const search = useDebounce(searchInput);

  const brandById = useMemo(
    () => new Map(brands.map((b) => [b.id, b.name])),
    [brands],
  );

  const labelById = useMemo(
    () => new Map(labels.map((l) => [l.id, l])),
    [labels],
  );

  // product_id → completion statuses
  const sectionStatusMap = useMemo(() => {
    const map = new Map<string, SectionStatus[]>();
    for (const s of sections) {
      const arr = map.get(s.product_id) ?? [];
      arr.push(s.status);
      map.set(s.product_id, arr);
    }
    return map;
  }, [sections]);

  // product_id → resolved labels
  const labelsByProduct = useMemo(() => {
    const map = new Map<string, CardLabel[]>();
    for (const pl of productLabels) {
      const label = labelById.get(pl.label_id);
      if (!label) continue;
      const arr = map.get(pl.product_id) ?? [];
      arr.push({ id: label.id, name: label.name, color: label.color });
      map.set(pl.product_id, arr);
    }
    return map;
  }, [productLabels, labelById]);

  // product_id → set of label ids (for filtering)
  const labelIdsByProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const pl of productLabels) {
      const set = map.get(pl.product_id) ?? new Set<string>();
      set.add(pl.label_id);
      map.set(pl.product_id, set);
    }
    return map;
  }, [productLabels]);

  const brandCollections = activeBrandId
    ? collections.filter((c) => c.brand_id === activeBrandId)
    : collections;

  const filtered = useMemo(() => {
    let result = products.filter((p) =>
      showArchived ? p.archived_at !== null : p.archived_at === null,
    );

    // Brand context comes from the Zustand store (set in Settings only).
    if (activeBrandId) {
      result = result.filter((p) => p.brand_id === activeBrandId);
    }

    if (activeCollectionId) {
      result = result.filter((p) => p.collection_id === activeCollectionId);
    }

    if (selectedStatus !== "all") {
      result = result.filter((p) => p.status === selectedStatus);
    }

    if (labelFilter !== "all") {
      result = result.filter((p) =>
        labelIdsByProduct.get(p.id)?.has(labelFilter),
      );
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.style_number ?? "").toLowerCase().includes(q),
      );
    }

    return result;
  }, [
    products,
    showArchived,
    activeBrandId,
    activeCollectionId,
    selectedStatus,
    labelFilter,
    labelIdsByProduct,
    search,
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
          <CreateProductDialog collections={brandCollections} />
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

          {brandCollections.length > 0 && (
            <Select
              value={activeCollectionId ?? "all"}
              onValueChange={(v) =>
                setActiveCollectionId(v === "all" ? null : v)
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All collections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collections</SelectItem>
                {brandCollections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
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

      {/* Archived toggle */}
      {hasArchived && (
        <div className="flex">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-sm transition-colors"
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
          action={<CreateProductDialog collections={brandCollections} />}
        />
      )}

      {hasAnyProducts && filtered.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title={
            showArchived
              ? "No archived products"
              : "No products match your filters"
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
              labels={labelsByProduct.get(product.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
