"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Shirt } from "lucide-react";

import { AppNav, AppNavFooter, type PinnedNavItem } from "@/components/app-nav";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/supabase/session-user";
import { useUiStore } from "@/stores/ui-store";
import type { Profile, Workspace } from "@/types";

/**
 * The authenticated chrome: a viewport-height flex row where the SIDEBAR is
 * pinned (its own nav scrolls internally if it ever overflows, with the
 * profile/Settings cluster and the workspace row in fixed bottom sections)
 * and ONLY the main content area scrolls. The document itself never scrolls
 * vertically — long tech packs scroll in the right panel while the sidebar
 * stays put. The fullscreen editor is untouched by this: it portals to
 * document.body as a `fixed inset-0` layer above the shell.
 */
export function AppShell({
  user,
  profile,
  workspace,
  pinnedItems,
  children,
}: {
  user: SessionUser;
  profile: Profile;
  workspace: Workspace | null;
  pinnedItems?: PinnedNavItem[];
  children: ReactNode;
}) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // With <main> as the scroll container, the browser manages NEITHER the
  // route-change scroll reset NOR history scroll restoration (both are
  // window-scroll features) — so the shell does both. Every scroll records
  // the offset for the current path; a Back/Forward traversal (flagged by
  // popstate, which fires before the router re-renders) restores the saved
  // offset, while an ordinary navigation resets to top. Hash navigations are
  // left alone: the browser scrolls the anchor into view within the
  // container, and this must not fight it. Layout effect: the correction
  // must land before paint, or the new page flashes at the old offset.
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const scrollPositions = useRef(new Map<string, number>());
  const isTraversal = useRef(false);
  // The pathname currently RENDERED — popstate fires before the router
  // re-renders, so comparing it to the traversal target's pathname tells a
  // real page traversal from a hash/search-only one. The flag is only set
  // when the pathname effect below will actually run to consume it; a
  // same-pathname Back (e.g. over a hash history entry) must not leave a
  // stuck flag that would misclassify the NEXT forward navigation.
  const renderedPathname = useRef(pathname);
  useEffect(() => {
    const onPopState = () => {
      isTraversal.current =
        window.location.pathname !== renderedPathname.current;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useLayoutEffect(() => {
    renderedPathname.current = pathname;
    const main = mainRef.current;
    if (!main) return;
    if (isTraversal.current) {
      isTraversal.current = false;
      main.scrollTo(0, scrollPositions.current.get(pathname) ?? 0);
    } else if (!window.location.hash) {
      main.scrollTo(0, 0);
    }
  }, [pathname]);

  return (
    <div className="flex h-dvh min-w-[1280px] overflow-hidden">
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground border-sidebar-border flex shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200",
          collapsed ? "w-16" : "w-[280px]",
        )}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className={cn(
            "flex h-16 shrink-0 cursor-pointer items-center",
            collapsed ? "justify-center" : "gap-2 px-6",
          )}
        >
          <span className="bg-white/10 text-sidebar-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Shirt className="size-5" />
          </span>
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight">
              GarSpec
            </span>
          )}
        </Link>

        <Separator className="bg-sidebar-border" />

        {/* Scrollable nav region — the ONLY part of the sidebar that scrolls
            when its items (many pins) overflow the viewport. */}
        <nav
          className={cn(
            "min-h-0 flex-1 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <AppNav pinnedItems={pinnedItems} collapsed={collapsed} />
        </nav>

        {/* Pinned bottom cluster — profile + Settings stay reachable no
            matter how long the nav or the page content is. */}
        <div className={cn("shrink-0 pb-4", collapsed ? "px-2" : "px-3")}>
          <AppNavFooter
            collapsed={collapsed}
            userName={profile.full_name}
            userEmail={user.email ?? ""}
          />
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Workspace info + collapse toggle */}
        <div
          className={cn(
            "flex shrink-0 items-center py-3",
            collapsed ? "justify-center px-2" : "justify-between px-6",
          )}
        >
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sidebar-muted text-xs">Workspace</p>
              <p className="truncate text-sm font-medium">
                {workspace?.name ?? "—"}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-sidebar-muted hover:text-sidebar-foreground shrink-0 transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>
      </aside>

      {/* The one scrolling region for page content. The page padding lives on
          an INNER wrapper, not on <main> itself: Chromium insets a sticky
          child's constraint rectangle by its scroll container's padding, so
          padding here would make every `sticky top-0` inside pin 24px below
          the pane's visual top — with scrolled content showing through the
          band above it (the product-header/canvas-toolbar overlap bug). */}
      <main
        ref={mainRef}
        onScroll={(e) =>
          scrollPositions.current.set(pathname, e.currentTarget.scrollTop)
        }
        className="min-w-0 flex-1 overflow-y-auto"
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
