/**
 * Bill of Materials row derivation — the ONE place BOM rows are built from
 * the product's Fabrics & Trim canvas annotations, shared by the on-screen
 * table's twin exports: the PDF BOM page (`lib/pdf/render-bom-page.tsx`) and
 * the Excel workbook (`lib/excel-techpack.ts`). Framework-free so the Excel
 * path doesn't drag the PDF renderer into its module graph.
 */

import {
  isFabricFamilyType,
  readFabricTrimData,
} from "@/components/canvas/fabric-trim-data";
import type { CanvasAnnotation, FabricTrimAnnotationData } from "@/types";

export type BomRow = {
  group: "fabric" | "trim";
  ref: string;
  data: FabricTrimAnnotationData;
};

export const BOM_GROUP_LABEL: Record<BomRow["group"], string> = {
  fabric: "Fabrics",
  trim: "Trims",
};

/** The rows exactly as the on-screen BOM shows them: fabric/trim annotations
 *  only, grouped Fabrics then Trims, reference-code order within each group. */
export function buildBomRows(annotations: CanvasAnnotation[]): BomRow[] {
  const groups: BomRow["group"][] = ["fabric", "trim"];
  return groups.flatMap((group) =>
    annotations
      .filter((a) => a.layer_type === group && isFabricFamilyType(a.layer_type))
      .sort((a, b) =>
        a.reference_code.localeCompare(b.reference_code, undefined, {
          numeric: true,
        }),
      )
      .map((a) => ({
        group,
        ref: a.reference_code,
        data: readFabricTrimData(a.data),
      })),
  );
}

/** Total = qty × unit cost, only when BOTH are present. */
export function rowTotal(d: FabricTrimAnnotationData): number | null {
  return d.quantity !== null && d.unit_cost !== null
    ? d.quantity * d.unit_cost
    : null;
}
