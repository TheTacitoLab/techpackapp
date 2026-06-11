/**
 * Suspense fallback for the `(app)` segment. The sidebar/header layout is
 * preserved across client-side navigation, so this skeleton paints into the
 * main content area the instant a link is clicked — the page no longer "hangs"
 * on the old view while the server render (auth + data queries) completes.
 */
export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-64 rounded-md" />
        <div className="bg-muted h-4 w-96 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card space-y-3 rounded-xl border p-4">
            <div className="bg-muted h-32 w-full rounded-lg" />
            <div className="bg-muted h-4 w-3/4 rounded-md" />
            <div className="bg-muted h-3 w-1/2 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
