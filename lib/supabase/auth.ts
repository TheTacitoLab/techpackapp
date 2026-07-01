import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/supabase/session-user";
import type { Profile, Workspace } from "@/types";

export type CurrentUser = {
  user: SessionUser;
  profile: Profile;
  workspace: Workspace | null;
};

/**
 * Server-side helper returning the authenticated user along with their profile
 * and workspace. Returns null when there is no valid session (or no profile,
 * which would indicate the sign-up trigger has not run). Use in the `(app)`
 * layout guard and to feed `AppShell`.
 *
 * Uses `getUser()` — an authoritative round-trip to the Supabase Auth server —
 * rather than a local `getSession()` read. `getSession()` on the server is a
 * documented anti-pattern (Supabase: "getSession is insecure on the server"),
 * and an earlier attempt to swap in `getSession()` + manual JWT decode here to
 * shave a round-trip coincided with app-wide server-action failures, so we are
 * back on the known-good `getUser()` path. That optimization made no
 * measurable difference to felt latency, so nothing is lost by reverting.
 *
 * Wrapped in React `cache()` so the layout and the page (which both need the
 * user) share a single round-trip + profile/workspace query pair per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const t0 = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log(
    `[AUTH] getCurrentUser getUser (network): ${(performance.now() - t0).toFixed(1)}ms`,
  );
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", profile.workspace_id)
    .single();

  return {
    user: { id: user.id, email: user.email ?? null },
    profile,
    workspace: workspace ?? null,
  };
});
