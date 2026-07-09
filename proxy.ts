import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// /update-password is deliberately NOT listed: the recovery flow arrives there
// with an authenticated session (set by /auth/callback), and listing it would
// bounce that session to /dashboard before the user can set a new password.
const AUTH_ROUTES = ["/login", "/signup", "/reset-password"];

/**
 * Next.js 16 proxy (renamed from middleware). Refreshes the auth session on
 * every request and enforces route protection:
 *  - unauthenticated users hitting app routes  -> /login
 *  - authenticated users hitting auth routes    -> /dashboard
 */
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // The auth callback (email confirmation / recovery) must always run so it can
  // exchange the code for a session — never gate or redirect it.
  if (pathname.startsWith("/auth/")) {
    return supabaseResponse;
  }

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and image files so the session
     * refresh doesn't fire for every asset request.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
