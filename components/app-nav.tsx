"use client";

import { useEffect } from "react";
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
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { Collection } from "@/types";

export function AppNav({
  collections = [],
  collapsed = false,
  userName,
  userEmail,
}: {
  collections?: Collection[];
  collapsed?: boolean;
  userName: string | null;
  userEmail: string;
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

  // Warm the route once on mount so the first click navigates against a cached
  // payload instead of a cold server round-trip.
  useEffect(() => {
    router.prefetch("/products");
  }, [router]);

  // When already on /products these are pure client-state changes.
  function goToAllProducts() {
    setActiveCollectionId(null);
    setShowArchived(false);
    if (!onProducts) router.push("/products");
  }

  function goToArchived() {
    setShowArchived(true);
    setActiveCollectionId(null);
    if (!onProducts) router.push("/products");
  }

  function goToCollection(id: string) {
    setActiveCollectionId(id);
    setShowArchived(false);
    if (!onProducts) router.push("/products");
  }

  // The lime indicator bar shown at the left edge of the active nav item.
  const indicator = (
    <span className="bg-sidebar-accent absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full" />
  );

  // Item base classes — full-width row when expanded, centered icon when collapsed.
  const itemBase = collapsed
    ? "relative flex w-full cursor-pointer items-center justify-center rounded-lg p-2 transition-colors"
    : "relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";

  return (
    <div className="flex h-full flex-col gap-1">
      <ul className="flex flex-col gap-1">
        <li>
          <button
            onClick={goToAllProducts}
            className={cn(
              itemBase,
              isAllProductsActive
                ? "bg-sidebar-accent-bg text-sidebar-accent"
                : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
            )}
          >
            {isAllProductsActive && indicator}
            <LayoutDashboard className="size-4 shrink-0" />
            {!collapsed && "All Products"}
          </button>
        </li>
        <li>
          <button
            onClick={goToArchived}
            className={cn(
              itemBase,
              isArchivedActive
                ? "bg-sidebar-accent-bg text-sidebar-accent"
                : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
            )}
          >
            {isArchivedActive && indicator}
            <Archive className="size-4 shrink-0" />
            {!collapsed && "Archived"}
          </button>
        </li>
      </ul>

      <Separator className="bg-sidebar-border my-2" />

      {/* Collections — hidden when collapsed */}
      {!collapsed && activeBrandId !== null ? (
        <>
          <div className="mb-1 px-3">
            <p className="text-sidebar-muted text-xs font-semibold uppercase tracking-wider">
              Collections
            </p>
          </div>

          {activeCollections.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {activeCollections.map((col) => {
                const isActive = onProducts && activeCollectionId === col.id;
                return (
                  <li key={col.id}>
                    <button
                      onClick={() => goToCollection(col.id)}
                      className={cn(
                        "relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-accent-bg text-sidebar-accent"
                          : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                      )}
                    >
                      {isActive && indicator}
                      <FolderOpen className="size-3.5 shrink-0" />
                      <span className="truncate">{col.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-1 px-1">
            <CreateCollectionDialogSimple
              trigger={
                <button className="text-sidebar-muted hover:text-sidebar-foreground flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors">
                  <Plus className="size-3.5" />
                  New collection
                </button>
              }
            />
          </div>
        </>
      ) : !collapsed ? (
        <p className="text-sidebar-muted px-3 text-xs">
          No active brand. Visit Settings to set one.
        </p>
      ) : null}

      <div className="mt-auto">
        <Separator className="bg-sidebar-border my-2" />
        <UserMenu name={userName} email={userEmail} collapsed={collapsed} />
        <Link
          href="/settings"
          className={cn(
            itemBase,
            isSettingsActive
              ? "bg-sidebar-accent-bg text-sidebar-accent"
              : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
          )}
        >
          {isSettingsActive && indicator}
          <Settings className="size-4 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
      </div>
    </div>
  );
}
