import { createClient } from "@/lib/supabase/server";
import { decodeSessionUser } from "@/lib/supabase/session-user";

/**
 * Lean identity/workspace preamble for server actions that only need to know
 * WHO is calling and WHICH workspace scopes their queries — not the full
 * workspace row (name, etc.). One network round-trip: the `profiles` lookup.
 *
 * The user is read LOCALLY via `getSession()` rather than a network
 * `getUser()`: the proxy (`lib/supabase/proxy.ts`) already validated +
 * refreshed this request's token with a single authoritative `getUser()`
 * round-trip before this action ran (server actions are POSTs routed through
 * the proxy), so a second network auth call here would be redundant.
 * `getSession()` only hits the network if the token needs refreshing. See
 * `decodeSessionUser` for why decoding the validated token is safe.
 *
 * Deliberately separate from `getCurrentUser()` (`lib/supabase/auth.ts`),
 * which also fetches the full workspace object pages need for rendering.
 */
export async function requireActionContext() {
  const supabase = await createClient();

  const t0 = performance.now();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log(
    `[AUTH] requireActionContext getSession (local): ${(performance.now() - t0).toFixed(1)}ms`,
  );

  const user = session ? decodeSessionUser(session.access_token) : null;
  if (!user) throw new Error("Not authenticated.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) throw new Error("No workspace found.");

  return { supabase, userId: user.id, workspaceId: profile.workspace_id };
}
