/**
 * The minimal authenticated-user shape the app needs server-side: the id (for
 * scoping queries / the profiles lookup) and the email (shown in the header).
 * Populated from `supabase.auth.getUser()` in `lib/supabase/auth.ts`.
 */
export type SessionUser = { id: string; email: string | null };
