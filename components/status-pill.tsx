import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/types";

/** Human labels for each product status. */
export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  sent_to_factory: "Sent to Factory",
  sample_received: "Sample Received",
  approved: "Approved",
  in_production: "In Production",
};

/**
 * One consistent pill system for product status, each mapped to its soft
 * `--status-*` bg/fg token pair. Draft is deliberately the calmest (neutral
 * grey). 11px semibold, 6px radius, no border — never loud.
 */
const STATUS_CLASS: Record<ProductStatus, string> = {
  draft: "bg-status-draft-bg text-status-draft-fg",
  in_review: "bg-status-review-bg text-status-review-fg",
  sent_to_factory: "bg-status-factory-bg text-status-factory-fg",
  sample_received: "bg-status-sample-bg text-status-sample-fg",
  approved: "bg-status-approved-bg text-status-approved-fg",
  in_production: "bg-status-production-bg text-status-production-fg",
};

export function StatusPill({
  status,
  label,
  className,
}: {
  status: ProductStatus;
  /** Override the displayed text (defaults to the status label). */
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-sm px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        STATUS_CLASS[status],
        className,
      )}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
