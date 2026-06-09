import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { SectionStatus } from "@/types";

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
      <span className="text-muted-foreground text-sm whitespace-nowrap">
        {completed} of {total} sections complete
      </span>
    </div>
  );
}
