import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { SectionStatus } from "@/types";

/**
 * Dense card-footer variant of the progress indicator: thin brand-fill track
 * plus a "done/total" counter. Shared by product and collection cards so the
 * two grids can never drift.
 */
export function CompactProgress({
  statuses,
  className,
}: {
  statuses: SectionStatus[];
  className?: string;
}) {
  const total = statuses.length;
  const done = statuses.filter((s) => s === "complete").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {done}/{total}
      </span>
    </div>
  );
}

/**
 * Slim progress bar + "X of Y sections complete" label, driven by an array of
 * section statuses. The core "calm progression" indicator.
 */
export function ProgressTracker({
  statuses,
  className,
}: {
  statuses: SectionStatus[];
  className?: string;
}) {
  const total = statuses.length;
  const completed = statuses.filter((status) => status === "complete").length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <Progress value={percentage} className="max-w-xs" />
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {completed} of {total} sections complete
      </span>
    </div>
  );
}
