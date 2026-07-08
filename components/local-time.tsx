"use client";

/**
 * A timestamp rendered in the VIEWER's timezone — the server-rendered string
 * uses the server's TZ (UTC in production), so the client re-formats after
 * hydration; suppressHydrationWarning absorbs the expected mismatch. Locale
 * is pinned so only the timezone varies, e.g. "8 Jul 2026, 14:32".
 */
export function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))}
    </time>
  );
}
