"use client";

import { useRouter } from "next/navigation";
import {
  Archive,
  FolderOpen,
  LayoutDashboard,
  Plus,
} from "lucide-react";

import { CreateCollectionDialogSimple } from "@/components/hierarchy-dialogs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { Brand, Collection } from "@/types";

export function AppNav({
  brands: _brands = [],
  collections = [],
}: {
  brands?: Brand[];
  collections?: Collection[];
}) {
  const router = useRouter();

  const {
    activeBrandId,
    activeCollectionId,
    showArchived,
    setActiveCollectionId,
    setShowArchived,
  } = useUiStore();

  const activeCollections = activeBrandId
    ? collections.filter((c) => c.brand_id === activeBrandId)
    : collections;

  const isAllProductsActive = !showArchived && !activeCollectionId;
  const isArchivedActive = showArchived;

  function goToAllProducts() {
    setActiveCollectionId(null);
    setShowArchived(false);
    router.push("/dashboard");
  }

  function goToArchived() {
    setShowArchived(true);
    setActiveCollectionId(null);
    router.push("/dashboard");
  }

  function goToCollection(id: string) {
    setActiveCollectionId(id);
    setShowArchived(false);
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        <li>
          <button
            onClick={goToAllProducts}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isAllProductsActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <LayoutDashboard className="size-4" />
            All Products
          </button>
        </li>
        <li>
          <button
            onClick={goToArchived}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isArchivedActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Archive className="size-4" />
            Archived
          </button>
        </li>
      </ul>

      <Separator className="my-2" />

      {activeBrandId !== null ? (
        <>
          <div className="mb-1 px-3">
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Collections
            </p>
          </div>

          {activeCollections.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {activeCollections.map((col) => (
                <li key={col.id}>
                  <button
                    onClick={() => goToCollection(col.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                      activeCollectionId === col.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <FolderOpen className="size-3.5 shrink-0" />
                    <span className="truncate">{col.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 px-1">
            <CreateCollectionDialogSimple
              trigger={
                <button className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors">
                  <Plus className="size-3.5" />
                  New collection
                </button>
              }
            />
          </div>
        </>
      ) : (
        <p className="px-3 text-xs text-muted-foreground">
          No active brand. Visit Settings to set one.
        </p>
      )}
    </div>
  );
}
