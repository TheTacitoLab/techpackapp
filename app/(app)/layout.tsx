import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/supabase/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentUser();
  if (!ctx) redirect("/login");

  return (
    <AppShell user={ctx.user} profile={ctx.profile} workspace={ctx.workspace}>
      {children}
    </AppShell>
  );
}
