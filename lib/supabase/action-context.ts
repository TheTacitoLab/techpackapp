import { createClient } from "@/lib/supabase/server";

/**
 * Lean identity/workspace preamble for server actions that only need to know
 * WHO is calling and WHICH workspace scopes their queries — not the full
 * workspace row (name, etc.). Two round-trips: `auth.getUser()` then a
 * single-column `profiles` lookup.
 *
 * Uses `getUser()` (an authoritative Auth-server round-trip). An earlier
 * version read the session locally via `getSession()` + a manual JWT decode to
 * save a round-trip; that change coincided with app-wide server-action
 * failures, and `getSession()` is a documented server-side anti-pattern, so
 * this is reverted to the known-good `getUser()` path. Every action here still
 * only scopes by `workspaceId`, so this stays leaner than `getCurrentUser()`
 * (no workspace-row fetch).
 */
export async function requireActionContext() {
  const supabase = await createClient();

  const t0 = performance.now();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  console.log(
    `[AUTH] requireActionContext getUser (network): ${(performance.now() - t0).toFixed(1)}ms`,
  );
  if (authError || !user) throw new Error("Not authenticated.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) throw new Error("No workspace found.");

  return { supabase, userId: user.id, workspaceId: profile.workspace_id };
}
