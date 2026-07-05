"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { ANNOTATION_LAYERS, type LayerKey } from "@/components/canvas/layers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PreviewLayer = LayerKey | "all";

/**
 * Read-only, true-WYSIWYG page preview: an inline render of the EXACT PDF this
 * page exports, via the existing `/products/{id}/pdf` route (same layout module,
 * same renderer — not a lookalike). A layer selector switches between the
 * all-layers composite and each single layer; the iframe reloads on change.
 *
 * Defaults to whatever the canvas is currently showing (the all-layers
 * composite, or the active layer) each time it opens, so "Preview page" shows
 * the view the user was working in.
 */
export function PagePreviewDialog({
  open,
  onOpenChange,
  productId,
  pageId,
  activeLayer,
  defaultAllLayers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  pageId: string;
  activeLayer: LayerKey;
  defaultAllLayers: boolean;
}) {
  const [layer, setLayer] = useState<PreviewLayer>(
    defaultAllLayers ? "all" : activeLayer,
  );

  // Re-seed the selector to the current canvas view each time the dialog opens.
  useEffect(() => {
    if (open) setLayer(defaultAllLayers ? "all" : activeLayer);
  }, [open, defaultAllLayers, activeLayer]);

  const src = `/products/${productId}/pdf?pageId=${pageId}&layer=${layer}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Preview page</DialogTitle>
          <DialogDescription>
            Exactly what this page exports to PDF — read-only. Framing, pins and
            spacing match the export because both use the same layout.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={layer} onValueChange={(v) => setLayer(v as PreviewLayer)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Layer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All layers</SelectItem>
              {ANNOTATION_LAYERS.map((l) => (
                <SelectItem key={l.key} value={l.key}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {/* Key on src so switching layer/page reloads the exact PDF. */}
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
