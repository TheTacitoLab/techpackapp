"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, FileDown, FileSpreadsheet } from "lucide-react";

import { ANNOTATION_LAYERS, type LayerKey } from "@/components/canvas/layers";
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

/** The shared checkbox-row look for both the layer and section toggles. */
function ToggleRow({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
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
      {label}
    </button>
  );
}

/**
 * The product header's "Quick Export" — the one-click full tech pack PDF.
 * Opens a small pop-up listing EVERY includable document section as a
 * pre-ticked checkbox — the five annotation layers, then an "Also include"
 * group with the Bill of Materials and the Size Specifications — exporting
 * `/products/{id}/techpack.pdf` filtered to the selection. The cover is
 * always included (never a checkbox), and a ticked section with no content
 * is simply omitted by the route, so all-defaults means "everything the
 * product actually contains" — the full document, no params. Off-default
 * selections travel as `?layers=…` (`none` for zero layers), `?bom=0` and
 * `?specs=0`; the BOM is its OWN section, independent of the Fabrics & Trim
 * layer toggle (pins on pages and the BOM table are separate concerns).
 * "More options" goes to the Export Hub (a later session — placeholder route
 * for now).
 *
 * Beside the PDF button, "Export Excel" downloads the STRUCTURED DATA twin
 * (`/products/{id}/techpack.xlsx`): the BOM plus every Spec Sheet as a
 * spreadsheet for the factory's ERP/QC tools. Whole-product scope in V1 — the
 * layer/section toggles above shape the PDF only.
 */
export function QuickExportDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<LayerKey>>(
    () => new Set(ALL_KEYS),
  );
  const [includeBom, setIncludeBom] = useState(true);
  const [includeSpecs, setIncludeSpecs] = useState(true);

  function toggle(key: LayerKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // The routes answer with Content-Disposition: attachment, so navigating an
  // anchor downloads without leaving the page.
  function download(url: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.click();
    setOpen(false);
  }

  function handleExport() {
    // Everything at its default is the canonical full document — no params.
    const params = new URLSearchParams();
    if (selected.size !== ALL_KEYS.length) {
      // `none` = deliberately zero layers (a bare comma list would read as a
      // malformed param) — the export is then cover + the other sections.
      params.set(
        "layers",
        selected.size === 0 ? "none" : [...selected].join(","),
      );
    }
    if (!includeBom) params.set("bom", "0");
    if (!includeSpecs) params.set("specs", "0");
    const query = params.toString();
    download(`/products/${productId}/techpack.pdf${query ? `?${query}` : ""}`);
  }

  function handleExportExcel() {
    // Whole-product data scope (BOM + all Spec Sheets) — no params in V1.
    download(`/products/${productId}/techpack.xlsx`);
  }

  // Cover aside (always in), the export needs at least one ticked section —
  // a layer, the BOM or the Size Specifications all count.
  const sectionCount =
    selected.size + (includeBom ? 1 : 0) + (includeSpecs ? 1 : 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Fresh dialog = everything ticked again (the quick path's default).
        if (next) {
          setSelected(new Set(ALL_KEYS));
          setIncludeBom(true);
          setIncludeSpecs(true);
        }
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
            One PDF with the sections you tick — the cover page is always
            included. Or take the BOM and Spec Sheets as an Excel workbook.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <p className="text-muted-foreground px-2 text-[11px] font-semibold tracking-wide uppercase">
            Annotation layers
          </p>
          {ANNOTATION_LAYERS.map((layer) => (
            <ToggleRow
              key={layer.key}
              checked={selected.has(layer.key)}
              label={layer.label}
              onToggle={() => toggle(layer.key)}
            />
          ))}
        </div>

        {/* Includable document SECTIONS (not annotation layers) — the BOM is
            its own toggle, independent of the Fabrics & Trim layer above. */}
        <div className="space-y-1">
          <p className="text-muted-foreground px-2 text-[11px] font-semibold tracking-wide uppercase">
            Also include
          </p>
          <ToggleRow
            checked={includeBom}
            label="Bill of Materials"
            onToggle={() => setIncludeBom((prev) => !prev)}
          />
          <ToggleRow
            checked={includeSpecs}
            label="Size Specifications"
            onToggle={() => setIncludeSpecs((prev) => !prev)}
          />
        </div>

        <p className="text-muted-foreground text-xs">
          {sectionCount === 0
            ? "Select at least one section to export the PDF."
            : "Ticked sections with nothing in them are left out automatically."}{" "}
          Export Excel always carries the full data: BOM + all Spec Sheets.
        </p>

        <div className="flex items-center justify-between gap-2">
          {/* Export Hub (per-page selection, rename) is a later session —
              TODO: replace this placeholder destination with the real hub
              when it ships. */}
          <Link
            href={`/products/${productId}/export`}
            className="text-muted-foreground hover:text-foreground text-xs font-medium underline underline-offset-2"
            onClick={() => setOpen(false)}
          >
            More options
          </Link>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
            <Button
              size="sm"
              disabled={sectionCount === 0}
              onClick={handleExport}
            >
              <FileDown className="size-4" />
              Export PDF
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
