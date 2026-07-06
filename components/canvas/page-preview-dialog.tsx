"use client";

import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Read-only, true-WYSIWYG page preview: an inline render of the EXACT PDF this
 * page exports, via the `/products/{id}/pdf` route (same layout module, same
 * renderer — not a lookalike). A canvas page exports as ONE composed page (all
 * layers together), so the preview shows that composed page — matching the
 * on-screen "All layers" view and the export byte-for-byte.
 */
export function PagePreviewDialog({
  open,
  onOpenChange,
  productId,
  pageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  pageId: string;
}) {
  const src = `/products/${productId}/pdf?pageId=${pageId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Preview page</DialogTitle>
          <DialogDescription>
            Exactly what this page exports to PDF — all layers composed,
            read-only. Framing, pins and spacing match the export because both
            use the same layout.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1.5 text-xs font-medium"
          >
            Open in new tab
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Key on src so switching page reloads the exact PDF. */}
        <iframe
          key={src}
          src={src}
          title="Page PDF preview"
          className="h-[70vh] w-full rounded-md border bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
