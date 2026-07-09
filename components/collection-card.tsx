"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { LabelChip } from "@/components/label-chip";
import { PinToggle } from "@/components/pin-toggle";
import { CompactProgress } from "@/components/progress-tracker";
import type { SectionStatus } from "@/types";
import { cn } from "@/lib/utils";

type CardLabel = { id: string; name: string; color: string };

/**
 * Everything a collection card renders, pre-derived by the server page:
 * roll-up counts/progress include sub-collections' products, and the cover
 * is a mosaic of up to 4 product images (hero assets first) — covers are
 * derived, never uploaded (V1 decision).
 */
export type CollectionCardData = {
  id: string;
  name: string;
  brandName: string | null;
  labels: CardLabel[];
  /** Direct sub-collections (always 0 for a sub-collection itself). */
  subCount: number;
  /** Live products, including those in sub-collections. */
  productCount: number;
  /** Section statuses across all counted products (for the progress bar). */
  sectionStatuses: SectionStatus[];
  /** Up to 4 image URLs for the cover mosaic. */
  coverUrls: string[];
};

function CoverMosaic({
  urls,
  compact,
}: {
  urls: string[];
  compact: boolean;
}) {
  const height = compact ? "h-24" : "h-36";
  if (urls.length === 0) {
    return (
      <div
        className={cn(
          "bg-muted/40 border-border flex items-center justify-center border-b",
          height,
        )}
      >
        <FolderOpen className="text-muted-foreground/30 size-8" />
      </div>
    );
  }
  // 1 image fills the band; 2 split it; 3 = one tall + two stacked; 4 = 2×2.
  return (
    <div
      className={cn(
        "border-border grid gap-px overflow-hidden border-b",
        height,
        urls.length === 1 ? "grid-cols-1" : "grid-cols-2",
        urls.length > 2 && "grid-rows-2",
      )}
    >
      {urls.map((url, index) => (
        // Plain <img>: file_url is a signed URL for the private bucket, so
        // next/image optimization would need a custom loader — same call as
        // the canvas asset library.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className={cn(
            "size-full object-cover",
            urls.length === 3 && index === 0 && "row-span-2",
          )}
        />
      ))}
    </div>
  );
}

function counts(data: CollectionCardData): string {
  const products = `${data.productCount} ${data.productCount === 1 ? "product" : "products"}`;
  if (data.subCount === 0) return products;
  return `${data.subCount} ${data.subCount === 1 ? "sub-collection" : "sub-collections"} · ${products}`;
}

export function CollectionCard({
  collection,
  size = "default",
}: {
  collection: CollectionCardData;
  size?: "default" | "sm";
}) {
  const compact = size === "sm";

  return (
    <div className="bg-card shadow-card hover:shadow-card-hover group relative flex flex-col overflow-hidden rounded-xl transition-shadow">
      <Link
        href={`/collections/${collection.id}`}
        className="absolute inset-0 z-0"
        aria-label={collection.name}
      />
      <CoverMosaic urls={collection.coverUrls} compact={compact} />
      {/* The pin sits over the mosaic; a solid disc keeps it legible on any
          image. pointer-events on the button only — the card link stays
          clickable around it. */}
      <div className="pointer-events-none absolute top-2 right-2 z-10">
        <PinToggle
          type="collection"
          id={collection.id}
          appearance="card"
          className="bg-background/80 hover:bg-background pointer-events-auto shadow-sm"
        />
      </div>

      <div
        className={cn(
          "pointer-events-none z-10 flex flex-1 flex-col",
          compact ? "gap-2 p-3" : "gap-3 p-4",
        )}
      >
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-medium",
              compact && "text-sm",
            )}
          >
            {collection.name}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {counts(collection)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {collection.brandName && (
            <span className="bg-primary/10 text-primary rounded-sm px-2 py-0.5 text-xs font-medium">
              {collection.brandName}
            </span>
          )}
          {collection.labels.slice(0, compact ? 2 : 3).map((label) => (
            <LabelChip key={label.id} name={label.name} color={label.color} />
          ))}
          {collection.labels.length > (compact ? 2 : 3) && (
            <span className="text-muted-foreground text-xs">
              +{collection.labels.length - (compact ? 2 : 3)}
            </span>
          )}
        </div>

        {/* Roll-up progress: sections complete across every counted product. */}
        <CompactProgress
          statuses={collection.sectionStatuses}
          className="mt-auto"
        />
      </div>
    </div>
  );
}
