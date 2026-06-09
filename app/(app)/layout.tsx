import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentUser();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const [{ data: brands }, { data: collections }] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase.from("collections").select("*").eq("workspace_id", wsId).order("name"),
  ]);

  return (
    <AppShell
      user={ctx.user}
      profile={ctx.profile}
      workspace={ctx.workspace}
      brands={brands ?? []}
      collections={collections ?? []}
    >
      {children}
    </AppShell>
  );
}
