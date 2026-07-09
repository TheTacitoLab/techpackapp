"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  archiveProduct,
  duplicateProduct,
  unarchiveProduct,
} from "@/app/(app)/dashboard/actions";
import { StatusPill } from "@/components/status-pill";
import { PinToggle } from "@/components/pin-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Product, SectionStatus } from "@/types";

type CardLabel = { id: string; name: string; color: string };

function CompactProgress({
  statuses,
}: {
  statuses: SectionStatus[];
}) {
  const total = statuses.length;
  const done = statuses.filter((s) => s === "complete").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {done}/{total}
      </span>
    </div>
  );
}

export function ProductCard({
  product,
  brandName,
  sectionStatuses,
  labels = [],
}: {
  product: Product;
  brandName: string | null;
  sectionStatuses: SectionStatus[];
  labels?: CardLabel[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const isArchived = product.archived_at !== null;

  function handleDuplicate() {
    startTransition(async () => {
      try {
        const { id, warnings } = await duplicateProduct(product.id);
        for (const warning of warnings) toast.warning(warning);
        toast.success("Product duplicated.");
        router.push(`/products/${id}`);
      } catch {
        toast.error("Could not duplicate product.");
      }
    });
  }

  function handleArchiveToggle() {
    startTransition(async () => {
      try {
        if (isArchived) {
          await unarchiveProduct(product.id);
          toast.success("Product unarchived.");
        } else {
          await archiveProduct(product.id);
          toast.success("Product archived.");
        }
        router.refresh();
      } catch {
        toast.error("Could not update product.");
      }
    });
  }

  return (
    <div className="bg-card shadow-card hover:shadow-card-hover group relative flex flex-col overflow-hidden rounded-xl transition-shadow">
      {/* Thumbnail placeholder */}
      <div className="bg-muted/40 border-border flex h-36 items-center justify-center border-b">
        <span className="text-muted-foreground/30 text-4xl font-bold select-none">
          {product.name.slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/products/${product.id}`}
              className="hover:text-primary line-clamp-1 cursor-pointer font-medium transition-colors"
            >
              {product.name}
            </Link>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {product.style_number ? (
                <span>#{product.style_number}</span>
              ) : (
                <span className="italic">No style #</span>
              )}
            </p>
          </div>
          <PinToggle type="product" id={product.id} appearance="card" />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                disabled={isPending}
                aria-label="Product actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/products/${product.id}`}>Open</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleArchiveToggle}
                className={isArchived ? "" : "text-destructive focus:text-destructive"}
              >
                {isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {brandName ?? <span className="italic">Unassigned</span>}
          </span>
          <StatusPill status={product.status} />
        </div>

        {labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {labels.slice(0, 3).map((label) => (
              <span
                key={label.id}
                className="bg-muted text-foreground inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="max-w-[8rem] truncate">{label.name}</span>
              </span>
            ))}
            {labels.length > 3 && (
              <span className="text-muted-foreground text-xs">
                +{labels.length - 3} more
              </span>
            )}
          </div>
        )}

        <CompactProgress statuses={sectionStatuses} />
      </div>
    </div>
  );
}
