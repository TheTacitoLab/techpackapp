import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { decodeSessionUser, type SessionUser } from "@/lib/supabase/session-user";
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
 * Reads the session LOCALLY (`getSession()`), not via a network `getUser()`.
 * The proxy (`lib/supabase/proxy.ts`) already validated + refreshed this
 * request's token with a single authoritative `getUser()` round-trip before
 * this handler ran, so re-validating here would be a redundant second
 * round-trip. `getSession()` only touches the network if the token still needs
 * a refresh; in the normal case it's a pure cookie read. See
 * `decodeSessionUser` for the safety argument.
 *
 * Wrapped in React `cache()` so the layout and the page (which both need the
 * user) share a single session read + profile/workspace query pair per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const t0 = performance.now();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log(
    `[AUTH] getCurrentUser getSession (local): ${(performance.now() - t0).toFixed(1)}ms`,
  );

  const user = session ? decodeSessionUser(session.access_token) : null;
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

  return { user, profile, workspace: workspace ?? null };
});
