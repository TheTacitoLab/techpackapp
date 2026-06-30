"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, Shirt } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { AppNav } from "@/components/app-nav";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { Collection, Profile, Workspace } from "@/types";

export function AppShell({
  user,
  profile,
  workspace,
  collections,
  children,
}: {
  user: User;
  profile: Profile;
  workspace: Workspace | null;
  collections?: Collection[];
  children: ReactNode;
}) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <div className="flex min-h-screen min-w-[1280px]">
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
              TechPack
            </span>
          )}
        </Link>

        <Separator className="bg-sidebar-border" />

        <nav
          className={cn(
            "flex-1 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <AppNav collections={collections} collapsed={collapsed} />
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* Workspace info + collapse toggle */}
        <div
          className={cn(
            "flex items-center py-3",
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

      <div className="flex flex-1 flex-col">
        <header className="border-border flex h-16 items-center justify-end border-b px-6">
          <UserMenu name={profile.full_name} email={user.email ?? ""} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
