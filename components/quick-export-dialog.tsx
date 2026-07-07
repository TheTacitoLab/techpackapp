"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, FileDown } from "lucide-react";

import {
  ANNOTATION_LAYERS,
  type LayerKey,
} from "@/components/canvas/layers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ALL_KEYS: readonly LayerKey[] = ANNOTATION_LAYERS.map((l) => l.key);

/**
 * The product header's "Quick Export" — the one-click full tech pack PDF.
 * Opens a small pop-up with the five annotation layers (ALL ticked by
 * default), exporting `/products/{id}/techpack.pdf` filtered to the
 * selection: cover always included, canvas pages composed from the selected
 * layers only, and the Bill of Materials only when Fabrics & Trim is in (it
 * is derived from that layer's pins). All-selected is the full document.
 * "More options" goes to the Export Hub (a later session — placeholder route
 * for now).
 */
export function QuickExportDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<LayerKey>>(
    () => new Set(ALL_KEYS),
  );

  function toggle(key: LayerKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleExport() {
    // All layers selected is the canonical full document — no filter param.
    const url =
      selected.size === ALL_KEYS.length
        ? `/products/${productId}/techpack.pdf`
        : `/products/${productId}/techpack.pdf?layers=${[...selected].join(",")}`;
    // The route answers with Content-Disposition: attachment, so navigating
    // an anchor downloads without leaving the page.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.click();
    setOpen(false);
  }

  const bomIncluded = selected.has("fabric");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Fresh dialog = everything ticked again (the quick path's default).
        if (next) setSelected(new Set(ALL_KEYS));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
          <FileDown className="size-3.5" />
          Quick Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick Export</DialogTitle>
          <DialogDescription>
            One PDF: cover page, every canvas page with the layers you pick,
            and the Bill of Materials.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {ANNOTATION_LAYERS.map((layer) => {
            const checked = selected.has(layer.key);
            return (
              <button
                key={layer.key}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(layer.key)}
                className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                    checked
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-input bg-background",
                  )}
                >
                  {checked && <Check className="size-3" />}
                </span>
                {layer.label}
              </button>
            );
          })}
        </div>

        <p className="text-muted-foreground text-xs">
          {selected.size === 0
            ? "Select at least one layer to export."
            : bomIncluded
              ? "Includes the Bill of Materials (from Fabrics & Trim)."
              : "Bill of Materials is omitted without Fabrics & Trim."}
        </p>

        <div className="flex items-center justify-between gap-2">
          {/* Export Hub (per-page selection, rename, Excel) is a later
              session — TODO: replace this placeholder destination with the
              real hub when it ships. */}
          <Link
            href={`/products/${productId}/export`}
            className="text-muted-foreground hover:text-foreground text-xs font-medium underline underline-offset-2"
            onClick={() => setOpen(false)}
          >
            More options
          </Link>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={handleExport}
          >
            <FileDown className="size-4" />
            Export
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
