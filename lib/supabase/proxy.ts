import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database.types";

/**
 * Refreshes the Supabase auth session inside the Next.js 16 proxy (the
 * successor to middleware). Returns the response carrying any refreshed auth
 * cookies plus the validated user. Always return `supabaseResponse` from the
 * proxy on pass-through, or the refreshed cookies are dropped and the user is
 * silently signed out.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates the JWT with the Auth server — never trust
  // getSession() for access decisions in server code. This is the SINGLE
  // authoritative auth round-trip per request: it validates the token, drives
  // the @supabase/ssr cookie refresh (rotating expired tokens), and gates
  // access. Downstream page/action handlers therefore read the session locally
  // (getSession) instead of repeating this network call.
  const t0 = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log(
    `[AUTH] proxy getUser (network): ${(performance.now() - t0).toFixed(1)}ms`,
  );

  return { supabaseResponse, user };
}
