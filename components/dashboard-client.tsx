"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Search } from "lucide-react";

import { CreateCollectionDialog } from "@/components/hierarchy-dialogs";
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
import { groupSectionStatuses } from "@/lib/collection-card-data";
import {
  collectionWithChildIds,
  orderCollectionsForPicker,
} from "@/lib/collection-hierarchy";
import type { TemplateSummary } from "@/lib/templates";
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

/**
 * The product grid, shared by /products (live) and /archive (archived) —
 * the archive stopped being a Zustand toggle when it became a route. All
 * filters are local state; the old active-brand/active-collection selection
 * model is gone.
 */
export function DashboardClient({
  workspaceName,
  brands,
  seasons,
  collections,
  products,
  sections,
  labels,
  productLabels,
  templates = [],
  view = "live",
}: {
  workspaceName: string | null;
  brands: Brand[];
  seasons: Season[];
  collections: Collection[];
  products: Product[];
  sections: SectionSummary[];
  labels: Label[];
  productLabels: ProductLabelLink[];
  templates?: TemplateSummary[];
  view?: "live" | "archived";
}) {
  const [searchInput, setSearchInput] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [labelFilter, setLabelFilter] = useState<string>("all");

  const search = useDebounce(searchInput);
  const archived = view === "archived";

  const brandById = useMemo(
    () => new Map(brands.map((b) => [b.id, b.name])),
    [brands],
  );

  const labelById = useMemo(
    () => new Map(labels.map((l) => [l.id, l])),
    [labels],
  );

  // product_id → completion statuses
  const sectionStatusMap = useMemo(
    () => groupSectionStatuses(sections),
    [sections],
  );

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

  // Sub-collections indented under their parents, in one flat picker list.
  const collectionOptions = useMemo(
    () => orderCollectionsForPicker(collections),
    [collections],
  );

  const filtered = useMemo(() => {
    let result = products.filter((p) =>
      archived ? p.archived_at !== null : p.archived_at === null,
    );

    if (collectionFilter !== "all") {
      // Filtering by a parent includes its sub-collections' products.
      const ids = new Set(collectionWithChildIds(collections, collectionFilter));
      result = result.filter(
        (p) => p.collection_id !== null && ids.has(p.collection_id),
      );
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
    archived,
    collections,
    collectionFilter,
    selectedStatus,
    labelFilter,
    labelIdsByProduct,
    search,
  ]);

  const inView = useMemo(
    () =>
      products.filter((p) =>
        archived ? p.archived_at !== null : p.archived_at === null,
      ),
    [products, archived],
  );
  const hasAnyInView = inView.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {archived ? "Archive" : "Products"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {archived
              ? "Archived products stay out of every live view."
              : (workspaceName ?? "Your workspace")}
          </p>
        </div>
        {!archived && (
          <div className="flex items-center gap-2">
            <CreateCollectionDialog
              brands={brands}
              seasons={seasons}
              collections={collections}
            />
            <CreateProductDialog
              collections={collections}
              brands={brands}
              templates={templates}
            />
          </div>
        )}
      </div>

      {/* Filters */}
      {hasAnyInView && (
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

          {collectionOptions.length > 0 && (
            <Select value={collectionFilter} onValueChange={setCollectionFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All collections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collections</SelectItem>
                {collectionOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className={c.depth === 1 ? "pl-4" : undefined}>
                      {c.name}
                    </span>
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

      {/* Empty states */}
      {!hasAnyInView && (
        <EmptyState
          icon={PackagePlus}
          title={archived ? "No archived products" : "No products yet"}
          description={
            archived
              ? "Archive products to hide them from the main view."
              : "Create your first tech pack to start building modular, factory-ready sections."
          }
          action={
            archived ? undefined : (
              <CreateProductDialog
                collections={collections}
                brands={brands}
                templates={templates}
              />
            )
          }
        />
      )}

      {hasAnyInView && filtered.length === 0 && (
        <EmptyState
          icon={PackagePlus}
          title="No products match your filters"
          description="Try adjusting your search or filter."
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
