"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCanvasPage } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type { CanvasTemplate } from "@/types";

/** Tailwind grid class per template — shared by the live canvas and mini renders. */
export const GRID_CLASS: Record<CanvasTemplate, string> = {
  single: "grid-cols-1",
  split: "grid-cols-2",
  quad: "grid-cols-2 grid-rows-2",
};

/** Inline 20×16 layout glyph used on the picker cards and elsewhere. */
export function TemplateIcon({
  template,
  className,
}: {
  template: CanvasTemplate;
  className?: string;
}) {
  const common = { width: 20, height: 16, className, "aria-hidden": true };
  const rect = "currentColor";
  if (template === "single") {
    return (
      <svg {...common} viewBox="0 0 20 16">
        <rect x="1" y="1" width="18" height="14" rx="2" fill={rect} />
      </svg>
    );
  }
  if (template === "split") {
    return (
      <svg {...common} viewBox="0 0 20 16">
        <rect x="1" y="1" width="8" height="14" rx="2" fill={rect} />
        <rect x="11" y="1" width="8" height="14" rx="2" fill={rect} />
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 20 16">
      <rect x="1" y="1" width="8" height="6.5" rx="1.5" fill={rect} />
      <rect x="11" y="1" width="8" height="6.5" rx="1.5" fill={rect} />
      <rect x="1" y="8.5" width="8" height="6.5" rx="1.5" fill={rect} />
      <rect x="11" y="8.5" width="8" height="6.5" rx="1.5" fill={rect} />
    </svg>
  );
}

const TEMPLATE_OPTIONS: {
  template: CanvasTemplate;
  label: string;
  description: string;
}[] = [
  {
    template: "single",
    label: "Single View",
    description: "One full-width image. Best for front/back views.",
  },
  {
    template: "split",
    label: "Split View",
    description: "Two images side by side. Good for front + back together.",
  },
  {
    template: "quad",
    label: "Quad View",
    description: "Four images. Perfect for close-up details.",
  },
];

/**
 * Template picker dialog — pick a layout, create the page, hand the new page id
 * back via `onCreated` (callers switch straight into Edit mode for it). Shared
 * by both the Page Overview and the Page Editor's thumbnail strip.
 */
export function TemplatePickerDialog({
  open,
  onOpenChange,
  productId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onCreated: (pageId: string) => void;
}) {
  const [selected, setSelected] = useState<CanvasTemplate>("single");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      try {
        const { id } = await createCanvasPage(productId, selected);
        onOpenChange(false);
        onCreated(id);
      } catch (err) {
        // TEMP diagnostic: surface the real error, not just the generic toast.
        console.error("[DIAG] createCanvasPage failed:", err);
        toast.error("Could not create the page.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isPending) {
            e.preventDefault();
            handleCreate();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Canvas Page</DialogTitle>
          <DialogDescription>Choose a layout for this page</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TEMPLATE_OPTIONS.map((option) => {
            const isSelected = selected === option.template;
            return (
              <button
                key={option.template}
                type="button"
                onClick={() => setSelected(option.template)}
                aria-pressed={isSelected}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4 text-left transition-all outline-none",
                  isSelected
                    ? "border-brand ring-brand/40 bg-brand-muted/40 ring-2"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50",
                )}
              >
                <div className="bg-muted text-muted-foreground flex h-20 items-center justify-center rounded-lg">
                  <TemplateIcon
                    template={option.template}
                    className="h-10 w-12"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={handleCreate}>
            {isPending ? "Creating…" : "Create Page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
