/**
 * The minimal authenticated-user shape the app needs server-side: the id (for
 * scoping queries / the profiles lookup) and the email (shown in the header).
 */
export type SessionUser = { id: string; email: string | null };

/**
 * Decode the `sub` (user id) and `email` claims from a Supabase access token
 * WITHOUT verifying its signature.
 *
 * Why this is safe: it is only ever called on a token the proxy has already
 * authenticated this SAME request via a live `supabase.auth.getUser()`
 * round-trip to the Auth server (see `lib/supabase/proxy.ts`). Unauthenticated
 * or invalid tokens are redirected to /login by the proxy before any handler
 * runs, so a handler that reaches this code is working with a token that was
 * validated upstream moments ago. RLS remains the real data guard regardless —
 * every query still carries the JWT and PostgREST re-validates it at the DB.
 *
 * Why decode instead of reading `session.user`: `@supabase/ssr` wraps the
 * session's `user` object in a Proxy that emits an "insecure!" `console.warn`
 * on any property access server-side. Reading the id/email from the raw
 * `access_token` (a plain, unwrapped session field) avoids that noise while
 * staying entirely local (no second network round-trip).
 */
export function decodeSessionUser(accessToken: string): SessionUser | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { sub?: unknown }).sub !== "string"
    ) {
      return null;
    }
    const claims = payload as { sub: string; email?: unknown };
    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
    };
  } catch {
    return null;
  }
}
