"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  FolderOpen,
  LayoutDashboard,
  Plus,
  Settings,
} from "lucide-react";

import { CreateCollectionDialogSimple } from "@/components/hierarchy-dialogs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { Collection } from "@/types";

export function AppNav({
  collections = [],
}: {
  collections?: Collection[];
}) {
  const router = useRouter();
  const pathname = usePathname();

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

  const onProducts = pathname === "/products";
  const isAllProductsActive = onProducts && !showArchived && !activeCollectionId;
  const isArchivedActive = onProducts && showArchived;
  const isSettingsActive = pathname === "/settings";

  function goToAllProducts() {
    setActiveCollectionId(null);
    setShowArchived(false);
    router.push("/products");
  }

  function goToArchived() {
    setShowArchived(true);
    setActiveCollectionId(null);
    router.push("/products");
  }

  function goToCollection(id: string) {
    setActiveCollectionId(id);
    setShowArchived(false);
    router.push("/products");
  }

  const itemBase =
    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

  return (
    <div className="flex h-full flex-col gap-1">
      <ul className="flex flex-col gap-1">
        <li>
          <button
            onClick={goToAllProducts}
            className={cn(
              itemBase,
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
              itemBase,
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
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                      onProducts && activeCollectionId === col.id
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
                <button className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors">
                  <Plus className="size-3.5" />
                  New collection
                </button>
              }
            />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground px-3 text-xs">
          No active brand. Visit Settings to set one.
        </p>
      )}

      <div className="mt-auto">
        <Separator className="my-2" />
        <Link
          href="/settings"
          className={cn(
            itemBase,
            isSettingsActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Settings className="size-4" />
          Settings
        </Link>
      </div>
    </div>
  );
}
