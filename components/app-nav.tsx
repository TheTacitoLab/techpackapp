"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  FolderOpen,
  LayoutDashboard,
  Package,
  Settings,
} from "lucide-react";

import { UserMenu } from "@/components/user-menu";
import { Separator } from "@/components/ui/separator";
import type { PinType } from "@/lib/pins";
import { cn } from "@/lib/utils";

/**
 * A pin resolved against the DB by the app layout: display name +
 * destination. Dangling pins (deleted targets) never reach this shape — the
 * layout filters them out and PinsProvider triggers the durable cleanup.
 */
export type PinnedNavItem = {
  type: PinType;
  id: string;
  name: string;
  href: string;
  /** For pinned sub-collections: the parent's name, shown as a muted prefix. */
  parentName: string | null;
};

// The active item gets a lime edge bar in addition to the tinted background.
const indicator = (
  <span className="bg-sidebar-accent absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full" />
);

// Collapsed = icon-only rows, centred; expanded = icon + label.
function navItemBase(collapsed: boolean): string {
  return collapsed
    ? "relative flex w-full cursor-pointer items-center justify-center rounded-lg p-2 transition-colors"
    : "relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
}

function navItemState(active: boolean): string {
  return active
    ? "bg-sidebar-accent-bg text-sidebar-accent"
    : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground";
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(navItemBase(collapsed), navItemState(active))}
      title={collapsed ? label : undefined}
    >
      {active && indicator}
      <Icon className="size-4 shrink-0" />
      {!collapsed && label}
    </Link>
  );
}

/**
 * Sidebar nav: Dashboard, All Products, Collections, then the user's PINNED
 * items (products and collections mixed, in pin order, max 10). Everything
 * is a plain route link — the old brand-filtered collections list and its
 * Zustand selection state (active brand / active collection) are gone.
 */
export function AppNav({
  pinnedItems = [],
  collapsed = false,
}: {
  pinnedItems?: PinnedNavItem[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        <li>
          <NavLink
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            active={pathname === "/dashboard"}
            collapsed={collapsed}
          />
        </li>
        <li>
          <NavLink
            href="/products"
            icon={Package}
            label="All Products"
            active={pathname === "/products"}
            collapsed={collapsed}
          />
        </li>
        <li>
          <NavLink
            href="/collections"
            icon={FolderOpen}
            label="Collections"
            active={pathname === "/collections"}
            collapsed={collapsed}
          />
        </li>
      </ul>

      {/* Pinned items — hidden when collapsed (icon-only pins would all look
          alike), same treatment as the old collections list. */}
      {!collapsed && (
        <>
          <Separator className="bg-sidebar-border my-2" />
          {pinnedItems.length > 0 ? (
            <>
              <div className="mb-1 px-3">
                <p className="text-sidebar-muted text-xs font-semibold uppercase tracking-wider">
                  Pinned
                </p>
              </div>
              <ul className="flex flex-col gap-0.5">
                {pinnedItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon =
                    item.type === "collection" ? FolderOpen : Package;
                  return (
                    <li key={`${item.type}:${item.id}`}>
                      <Link
                        href={item.href}
                        className={cn(
                          "relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          navItemState(isActive),
                        )}
                      >
                        {isActive && indicator}
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {item.parentName && (
                            <span className="text-sidebar-muted">
                              {item.parentName}
                              {" / "}
                            </span>
                          )}
                          {item.name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sidebar-muted px-3 text-xs">
              Pin products or collections for quick access.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The sidebar's pinned bottom cluster — Settings, Archive, then the user
 * menu. Rendered by the shell OUTSIDE the scrollable nav region so it stays
 * visible even when the nav's own items overflow and scroll internally.
 */
export function AppNavFooter({
  collapsed = false,
  userName,
  userEmail,
}: {
  collapsed?: boolean;
  userName: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();

  return (
    <div>
      <Separator className="bg-sidebar-border mb-2" />
      <div className="flex flex-col gap-1">
        <NavLink
          href="/settings"
          icon={Settings}
          label="Settings"
          active={pathname === "/settings"}
          collapsed={collapsed}
        />
        <NavLink
          href="/archive"
          icon={Archive}
          label="Archive"
          active={pathname === "/archive"}
          collapsed={collapsed}
        />
        <UserMenu name={userName} email={userEmail} collapsed={collapsed} />
      </div>
    </div>
  );
}
