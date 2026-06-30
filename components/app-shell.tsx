import Link from "next/link";
import { Shirt } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { AppNav } from "@/components/app-nav";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/user-menu";
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
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen min-w-[1280px]">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-[280px] shrink-0 flex-col border-r">
        <Link
          href="/dashboard"
          className="flex h-16 cursor-pointer items-center gap-2 px-6"
        >
          <span className="bg-white/10 text-sidebar-foreground flex size-8 items-center justify-center rounded-lg">
            <Shirt className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">TechPack</span>
        </Link>
        <Separator className="bg-sidebar-border" />
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <AppNav collections={collections} />
        </nav>
        <Separator className="bg-sidebar-border" />
        <div className="px-6 py-4">
          <p className="text-sidebar-muted text-xs">Workspace</p>
          <p className="truncate text-sm font-medium">
            {workspace?.name ?? "—"}
          </p>
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
