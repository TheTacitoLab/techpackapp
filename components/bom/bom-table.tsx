import { Fragment } from "react";
import Link from "next/link";
import { ListTree } from "lucide-react";

import {
  TRIM_KIND_LABEL,
  readFabricTrimData,
} from "@/components/canvas/fabric-trim-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CanvasAnnotation, CanvasLayerType } from "@/types";

// Two sections since the 0023 restructure — one Fabrics run (F1, F2…) and one
// Trims run (T1, T2…). A trim row's KIND (fastener/elastic/binding/…) shows in
// its Category cell via `data.trim_kind`, never in the reference code.
const GROUP_ORDER: readonly CanvasLayerType[] = ["fabric", "trim"];
const GROUP_LABEL: Record<"fabric" | "trim", string> = {
  fabric: "Fabrics",
  trim: "Trims",
};

const UNIT_LABEL: Record<string, string> = {
  per_metre: "per metre",
  per_unit: "per unit",
  per_kg: "per kg",
};

/**
 * The Bill of Materials — a live table generated purely from the product's
 * Fabrics & Trim canvas annotations (no manual add-row in this phase; that's a
 * later follow-up for unlisted items like packaging). `annotations` is passed
 * in already scoped to this product (derived in `page.tsx` from the same
 * canvas_pages query already proven workspace/product-scoped for the Assets
 * and Technical Details sections — no separate query, so no new leakage
 * surface). Grouped by category with subtotal headers, in reference-code
 * order, resembling a real factory BOM — this is also a preview of the future
 * exported PDF's BOM page, so it's kept clean and printable rather than
 * dense with UI chrome.
 */
export function BomTable({ annotations }: { annotations: CanvasAnnotation[] }) {
  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <ListTree className="size-6" />
        </span>
        <p className="text-muted-foreground max-w-sm text-sm">
          No materials annotated yet, add Fabrics &amp; Trim pins in{" "}
          <Link
            href="#section-technical_details"
            className="text-foreground font-medium underline underline-offset-2"
          >
            Technical Details
          </Link>{" "}
          and they&apos;ll appear here automatically.
        </p>
      </div>
    );
  }

  const grouped = GROUP_ORDER.map((layerType) => ({
    layerType,
    rows: annotations
      .filter((a) => a.layer_type === layerType)
      .sort((a, b) =>
        a.reference_code.localeCompare(b.reference_code, undefined, {
          numeric: true,
        }),
      ),
  })).filter((g) => g.rows.length > 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item #</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Item Name</TableHead>
          <TableHead>Composition / Detail</TableHead>
          <TableHead>Colour</TableHead>
          <TableHead>Width (cm)</TableHead>
          <TableHead>Placement</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Unit cost</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grouped.map((group) => (
          <Fragment key={group.layerType}>
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={12}
                className="bg-muted/50 text-muted-foreground py-1.5 text-xs font-semibold tracking-wide uppercase"
              >
                {GROUP_LABEL[group.layerType as keyof typeof GROUP_LABEL]}
              </TableCell>
            </TableRow>
            {group.rows.map((annotation) => {
              const d = readFabricTrimData(annotation.data);
              const detail = d.composition
                ? d.gsm !== null
                  ? `${d.composition} · ${d.gsm} GSM`
                  : d.composition
                : (d.gsm !== null ? `${d.gsm} GSM` : null);
              // The per-row category: "Fabric" for fabrics; for trims the
              // specific KIND — so T2 reads as an Elastic and T3 as a
              // Fastener even though both codes are plain T.
              const rowCategory =
                group.layerType === "trim"
                  ? d.trim_kind
                    ? TRIM_KIND_LABEL[d.trim_kind]
                    : "Trim"
                  : "Fabric";
              return (
                <TableRow key={annotation.id}>
                  <TableCell className="font-semibold">
                    {annotation.reference_code}
                  </TableCell>
                  <TableCell>{rowCategory}</TableCell>
                  <TableCell>{d.library_item_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {detail ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.colour ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {d.width_cm ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.placement ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.quantity ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.unit ? UNIT_LABEL[d.unit] : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {d.unit_cost !== null ? d.unit_cost.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">
                    {d.quantity !== null && d.unit_cost !== null
                      ? (d.quantity * d.unit_cost).toFixed(2)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-48 truncate">
                    {d.notes ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
