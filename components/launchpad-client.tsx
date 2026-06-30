"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  PackagePlus,
  Plus,
} from "lucide-react";

import { CreateCollectionDialogSimple } from "@/components/hierarchy-dialogs";
import { CreateProductDialog } from "@/components/create-product-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProgressTracker } from "@/components/progress-tracker";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type {
  Brand,
  Collection,
  Product,
  ProductStatus,
  Season,
  SectionStatus,
} from "@/types";

type SectionSummary = { product_id: string; status: SectionStatus };

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  sent_to_factory: "Sent to Factory",
  sample_received: "Sample Received",
  approved: "Approved",
  in_production: "In Production",
};

const STATUS_DOT: Record<ProductStatus, string> = {
  draft: "bg-status-draft-fg",
  in_review: "bg-status-review-fg",
  sent_to_factory: "bg-status-factory-fg",
  sample_received: "bg-status-sample-fg",
  approved: "bg-status-approved-fg",
  in_production: "bg-status-production-fg",
};

const DAY_MS = 1000 * 60 * 60 * 24;

function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const days = Math.floor(diff / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card shadow-card rounded-xl p-5",
        accent && "shadow-card-hover",
      )}
    >
      <p
        className={cn(
          "text-4xl font-bold tracking-tight",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">{label}</p>
    </div>
  );
}

export function LaunchpadClient({
  brands,
  seasons,
  collections,
  products,
  sections,
  now,
}: {
  brands: Brand[];
  seasons: Season[];
  collections: Collection[];
  products: Product[];
  sections: SectionSummary[];
  now: number;
}) {
  const router = useRouter();
  const { activeBrandId, setActiveCollectionId, setShowArchived } =
    useUiStore();

  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? null;

  // Everything below is scoped to the active brand.
  const brandCollections = useMemo(
    () =>
      activeBrandId
        ? collections.filter((c) => c.brand_id === activeBrandId)
        : [],
    [collections, activeBrandId],
  );

  const liveProducts = useMemo(
    () =>
      products.filter(
        (p) => p.archived_at === null && p.brand_id === activeBrandId,
      ),
    [products, activeBrandId],
  );

  const statusesByProduct = useMemo(() => {
    const map = new Map<string, SectionStatus[]>();
    for (const s of sections) {
      const arr = map.get(s.product_id) ?? [];
      arr.push(s.status);
      map.set(s.product_id, arr);
    }
    return map;
  }, [sections]);

  const stats = useMemo(() => {
    let inProduction = 0;
    let inReview = 0;
    let drafts = 0;
    for (const p of liveProducts) {
      if (p.status === "in_production") inProduction += 1;
      else if (p.status === "in_review") inReview += 1;
      else if (p.status === "draft") drafts += 1;
    }
    return { total: liveProducts.length, inProduction, inReview, drafts };
  }, [liveProducts]);

  const needsAttention = useMemo(() => {
    const items: { product: Product; reason: string }[] = [];
    for (const p of liveProducts) {
      const statuses = statusesByProduct.get(p.id) ?? [];
      // 1. Draft with no section started.
      if (
        p.status === "draft" &&
        statuses.length > 0 &&
        statuses.every((s) => s === "not_started")
      ) {
        items.push({ product: p, reason: "Not started" });
        continue;
      }
      // 2. Stalled: untouched > 7 days and not yet approved / in production.
      const stale = now - new Date(p.updated_at).getTime() > 7 * DAY_MS;
      if (
        stale &&
        p.status !== "approved" &&
        p.status !== "in_production"
      ) {
        items.push({ product: p, reason: "Stalled" });
        continue;
      }
      // 3. Missing style number.
      if (!p.style_number || p.style_number.trim() === "") {
        items.push({ product: p, reason: "Missing style #" });
        continue;
      }
    }
    return items.slice(0, 5);
  }, [liveProducts, statusesByProduct, now]);

  const recent = useMemo(
    () =>
      [...liveProducts]
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        .slice(0, 5),
    [liveProducts],
  );

  function openCollection(id: string) {
    setActiveCollectionId(id);
    setShowArchived(false);
    router.push("/products");
  }

  // ---- No brand: a single clear call to action --------------------------------
  if (!activeBrand) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={PackagePlus}
          title="No brand yet"
          description="Create your first brand in Settings to start building tech packs."
          action={
            <Button asChild>
              <Link href="/settings">Go to Settings</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Brand header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {activeBrand.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {seasons.length > 0
              ? `${seasons.length} ${seasons.length === 1 ? "season" : "seasons"} · ${brandCollections.length} ${brandCollections.length === 1 ? "collection" : "collections"}`
              : `${brandCollections.length} ${brandCollections.length === 1 ? "collection" : "collections"}`}
          </p>
        </div>
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-sm transition-colors"
        >
          Switch Brand
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard value={stats.total} label="Total Products" />
        <StatCard value={stats.inProduction} label="In Production" />
        <StatCard
          value={stats.inReview}
          label="In Review"
          accent={stats.inReview > 0}
        />
        <StatCard value={stats.drafts} label="Drafts" />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column (~60%) */}
        <div className="space-y-6 lg:col-span-3">
          {/* Collection progress */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Collection Progress
            </h2>
            {brandCollections.length === 0 ? (
              <EmptyState
                icon={PackagePlus}
                title="No collections yet"
                description="Group products into collections to track their progress here."
                action={<CreateCollectionDialogSimple seasons={seasons} />}
              />
            ) : (
              <div className="space-y-3">
                {brandCollections.map((col) => {
                  const colProducts = liveProducts.filter(
                    (p) => p.collection_id === col.id,
                  );
                  const colStatuses = colProducts.flatMap(
                    (p) => statusesByProduct.get(p.id) ?? [],
                  );
                  const statusCounts = colProducts.reduce(
                    (acc, p) => {
                      acc[p.status] = (acc[p.status] ?? 0) + 1;
                      return acc;
                    },
                    {} as Partial<Record<ProductStatus, number>>,
                  );
                  return (
                    <button
                      key={col.id}
                      onClick={() => openCollection(col.id)}
                      className="bg-card shadow-card hover:shadow-card-hover w-full cursor-pointer space-y-3 rounded-xl p-4 text-left transition-shadow"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{col.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {colProducts.length}{" "}
                          {colProducts.length === 1 ? "product" : "products"}
                        </span>
                      </div>
                      <ProgressTracker statuses={colStatuses} />
                      {colProducts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3">
                          {(
                            Object.entries(statusCounts) as [
                              ProductStatus,
                              number,
                            ][]
                          ).map(([status, count]) => (
                            <span
                              key={status}
                              className="text-muted-foreground flex items-center gap-1.5 text-xs"
                            >
                              <span
                                className={cn(
                                  "size-2 rounded-full",
                                  STATUS_DOT[status],
                                )}
                              />
                              {count} {STATUS_LABELS[status]}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Needs attention */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Needs Attention
            </h2>
            {needsAttention.length === 0 ? (
              <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-xl p-4 text-sm">
                <CheckCircle2 className="text-status-approved-fg size-4" />
                All products on track
              </div>
            ) : (
              <ul className="divide-border bg-card shadow-card divide-y rounded-xl">
                {needsAttention.map(({ product, reason }) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.id}`}
                      className="hover:bg-accent flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <AlertTriangle className="text-status-progress-fg size-4 shrink-0" />
                        <span className="truncate text-sm font-medium">
                          {product.name}
                        </span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {reason}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column (~40%) */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Quick Actions" icon={<Plus />}>
            <div className="flex flex-col gap-2">
              <CreateProductDialog collections={brandCollections} />
              <CreateCollectionDialogSimple
                seasons={seasons}
                trigger={
                  <Button variant="secondary" className="w-full justify-start">
                    <Plus className="size-4" />
                    New Collection
                  </Button>
                }
              />
              <Button variant="ghost" asChild className="w-full justify-start">
                <Link href="/products">
                  <ArrowRight className="size-4" />
                  View All Products
                </Link>
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Recently Updated" icon={<ArrowRight />}>
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No products yet. Create one to get started.
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.id}`}
                      className="hover:bg-accent -mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {product.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {product.style_number
                            ? `#${product.style_number}`
                            : "No style #"}{" "}
                          · {relativeTime(product.updated_at, now)}
                        </p>
                      </div>
                      <StatusPill status={product.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
