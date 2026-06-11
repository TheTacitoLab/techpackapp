import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Profile, Workspace } from "@/types";

export type CurrentUser = {
  user: User;
  profile: Profile;
  workspace: Workspace | null;
};

/**
 * Server-side helper returning the authenticated user along with their profile
 * and workspace. Returns null when there is no valid session (or no profile,
 * which would indicate the sign-up trigger has not run). Use in the `(app)`
 * layout guard and to feed `AppShell`.
 *
 * Wrapped in React `cache()` so the layout and the page (which both need the
 * user) share a single `getUser()` round-trip to the Supabase Auth server plus
 * one profile/workspace query pair per request — instead of repeating those
 * network calls in every server component that asks for the user.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
