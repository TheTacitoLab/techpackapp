"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { toast } from "sonner";

import { setSectionCompletion } from "@/app/(app)/products/[id]/actions";
import { cn } from "@/lib/utils";
import type { CompletableSectionKey } from "@/lib/section-status";
import type { SectionStatus } from "@/types";

/**
 * The section banner's "Mark complete" control — neutral/greyed while the
 * section is open, green with a tick once complete. Manual completion is
 * DURABLE (edits never demote it; see setSectionCompletion), so the same
 * control also un-marks. A section the AUTO rules completed (assets with
 * everything in use, grading with every sheet complete) shows the same green
 * tick but isn't clickable — it re-evaluates from content, so there is
 * nothing for a click to durably change.
 */
export function SectionCompleteToggle({
  productId,
  sectionKey,
  status,
  completedManually,
}: {
  productId: string;
  sectionKey: CompletableSectionKey;
  status: SectionStatus;
  completedManually: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const complete = status === "complete";
  const autoComplete = complete && !completedManually;

  function toggle() {
    const next = !complete;
    startTransition(async () => {
      try {
        const { status: landed } = await setSectionCompletion(
          productId,
          sectionKey,
          next,
        );
        // Un-marking a section whose auto rule still holds lands back on
        // complete — say so instead of claiming it re-opened.
        toast.success(
          next
            ? "Section marked complete."
            : landed === "complete"
              ? "Section is complete on its own — it now tracks its content."
              : "Section re-opened.",
        );
        router.refresh();
      } catch {
        toast.error(
          next
            ? "Could not mark the section complete."
            : "Could not re-open the section.",
        );
      }
    });
  }

  const base =
    "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (autoComplete) {
    return (
      <span
        title="Completed automatically — this section re-evaluates as its content changes."
        className={cn(
          base,
          "bg-brand text-brand-foreground border-transparent",
        )}
      >
        <Check className="size-3.5" />
        Complete
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={toggle}
      title={
        complete
          ? "Marked complete — click to re-open."
          : "Mark this section complete. It stays complete through edits until you un-mark it."
      }
      className={cn(
        base,
        "disabled:opacity-50",
        complete
          ? "bg-brand text-brand-foreground hover:bg-brand/90 border-transparent"
          : "border-input text-muted-foreground hover:bg-accent hover:text-foreground bg-transparent",
      )}
    >
      {complete ? (
        <Check className="size-3.5" />
      ) : (
        <Circle className="size-3" />
      )}
      {complete ? "Complete" : "Mark complete"}
    </button>
  );
}
