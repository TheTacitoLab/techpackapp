"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { ANNOTATION_LAYERS, type LayerKey } from "@/components/canvas/layers";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResolvedCanvasPage } from "@/types";

/**
 * SPIKE-quality trigger for the canvas-to-PDF proof: pick a page + layer and
 * open the generated PDF in a new tab. Defaults to the first locked page and
 * Fabrics & Trim. The real export UI (sections, preview, configuration) is a
 * later phase — this exists so the rendering path can be exercised in-app.
 */
export function PdfExportSpike({
  productId,
  pages,
}: {
  productId: string;
  pages: ResolvedCanvasPage[];
}) {
  const lockedPages = pages.filter((p) => p.slots.some((s) => s.is_locked));
  const [pageId, setPageId] = useState<string>(lockedPages[0]?.id ?? "");
  const [layer, setLayer] = useState<LayerKey>("fabric");

  if (lockedPages.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Select value={pageId} onValueChange={setPageId}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Page" />
        </SelectTrigger>
        <SelectContent>
          {lockedPages.map((p, i) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label ?? `Page ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={layer} onValueChange={(v) => setLayer(v as LayerKey)}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Layer" />
        </SelectTrigger>
        <SelectContent>
          {ANNOTATION_LAYERS.map((l) => (
            <SelectItem key={l.key} value={l.key}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!pageId}
        onClick={() =>
          window.open(
            `/products/${productId}/pdf?pageId=${pageId}&layer=${layer}`,
            "_blank",
          )
        }
      >
        <FileDown className="size-4" />
        Export PDF (spike)
      </Button>
    </div>
  );
}
