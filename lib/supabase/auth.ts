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
  console.time("[getCurrentUser] TOTAL");
  const supabase = await createClient();

  console.time("[getCurrentUser] auth.getUser()");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.timeEnd("[getCurrentUser] auth.getUser()");
  if (!user) {
    console.timeEnd("[getCurrentUser] TOTAL");
    return null;
  }

  console.time("[getCurrentUser] profiles query");
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  console.timeEnd("[getCurrentUser] profiles query");
  if (!profile) {
    console.timeEnd("[getCurrentUser] TOTAL");
    return null;
  }

  console.time("[getCurrentUser] workspaces query");
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", profile.workspace_id)
    .single();
  console.timeEnd("[getCurrentUser] workspaces query");

  console.timeEnd("[getCurrentUser] TOTAL");
  return { user, profile, workspace: workspace ?? null };
});
