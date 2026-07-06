"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

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
 * Export trigger for one canvas page: pick a page and open its composed PDF in
 * a new tab. A page exports as ONE page with ALL its annotation layers together
 * (the composed view) — there is no per-layer export anymore. Full-document
 * assembly (cover, every page, BOM, one "Export Tech Pack" action) is a later
 * session; page selection stays until then.
 */
export function PdfExportSpike({
  productId,
  pages,
}: {
  productId: string;
  pages: ResolvedCanvasPage[];
}) {
  // Keep each page's index in the FULL page list so fallback labels match the
  // "Page X of Y" numbering the PDF itself prints.
  const lockedPages = pages
    .map((p, index) => ({ page: p, index }))
    .filter(({ page }) => page.slots.some((s) => s.is_locked));
  const [pageId, setPageId] = useState<string>(lockedPages[0]?.page.id ?? "");

  if (lockedPages.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Select value={pageId} onValueChange={setPageId}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="Page" />
        </SelectTrigger>
        <SelectContent>
          {lockedPages.map(({ page, index }) => (
            <SelectItem key={page.id} value={page.id}>
              {page.label ?? `Page ${index + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!pageId}
        onClick={() =>
          window.open(`/products/${productId}/pdf?pageId=${pageId}`, "_blank")
        }
      >
        <FileDown className="size-4" />
        Export page
      </Button>
    </div>
  );
}
