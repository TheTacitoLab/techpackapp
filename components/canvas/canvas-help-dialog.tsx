"use client";

import {
  Copy,
  FileText,
  Layers,
  Layers3,
  ListOrdered,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "How pages work" — a short, static explainer for the one-page = one-PDF-page
 * export model. Opened from the "?" button in the canvas toolbar; no docs
 * system, no links, just the six things a user needs to know. Styled like the
 * app's other dialogs.
 */
const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileText,
    title: "One page = one PDF page",
    body: "Each page you build here becomes one page in your exported PDF tech pack.",
  },
  {
    icon: Layers,
    title: "Layers organise your annotations",
    body: "The factory sees them grouped by layer in the page's callout column, colourways, fabrics, measurements, construction, branding.",
  },
  {
    icon: ListOrdered,
    title: "Up to 12 annotations per page",
    body: "A page holds 12 annotations across all layers, so it stays clear and readable for the factory.",
  },
  {
    icon: Copy,
    title: "Need more on the same image? Duplicate the page",
    body: "The images and framing carry over to a fresh page, ready for new annotations.",
  },
  {
    icon: Layers3,
    title: "Preview with “All layers”",
    body: "Switch to All layers to see every pin on the page at once, exactly what the PDF will show.",
  },
  {
    icon: StickyNote,
    title: "Page notes print with the page",
    body: "Notes appear on the exported page, with ruled space for handwritten factory notes when printed.",
  },
];

export function CanvasHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How pages work</DialogTitle>
          <DialogDescription>
            A quick guide to building and exporting your tech pack pages.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={i} className="flex gap-3">
                <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
