"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * The profile/account menu, rendered as a sidebar row (directly above the
 * Settings link — see `app-nav.tsx`) rather than a top-right header trigger.
 * Since it lives at the BOTTOM of the sidebar, the dropdown opens upward
 * (`side="top"`) so it never renders off-screen. `collapsed` mirrors the
 * sidebar's own collapsed state: icon-only when collapsed, avatar + name +
 * chevron when expanded. Menu contents (Settings, Sign out) are unchanged
 * from the previous top-bar version.
 */
export function UserMenu({
  name,
  email,
  collapsed = false,
}: {
  name: string | null;
  email: string;
  collapsed?: boolean;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  const initials = (name ?? email ?? "?").trim().slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground flex w-full cursor-pointer items-center rounded-lg transition-colors",
            collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2",
          )}
        >
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-white/10 text-sidebar-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                {name ?? email}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name ?? "Account"}</span>
            <span className="text-muted-foreground text-xs">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
