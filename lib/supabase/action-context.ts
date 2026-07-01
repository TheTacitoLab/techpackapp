import { createClient } from "@/lib/supabase/server";

/**
 * Lean identity/workspace preamble for server actions that only need to know
 * WHO is calling and WHICH workspace scopes their queries — not the full
 * workspace row (name, etc.). Two round-trips: `auth.getUser()` then a
 * single-column `profiles` lookup.
 *
 * Deliberately separate from `getCurrentUser()` (`lib/supabase/auth.ts`),
 * which pages still use when they need the full workspace object for
 * rendering. React's `cache()` on `getCurrentUser()` doesn't help server
 * actions anyway — an action invocation is its own execution context,
 * distinct from whatever request rendered the page — so there's no
 * cache-sharing to lose by not reusing it here.
 */
export async function requireActionContext() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) throw new Error("No workspace found.");

  return { supabase, userId: user.id, workspaceId: profile.workspace_id };
}
