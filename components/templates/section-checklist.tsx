"use client";

import { Check } from "lucide-react";

import type { CopySectionMask } from "@/lib/product-copy";
import { cn } from "@/lib/utils";

/**
 * The clone dialog's three choices (deliberately not six): the BOM derives
 * live from Fabrics & Trim pins so it rides with the drawings, annotations
 * sit on images so assets/pages/pins/colourways travel together, and the
 * placeholder Documents section never appears.
 */
const CHOICES: {
  key: keyof CopySectionMask;
  label: string;
  description: string;
}[] = [
  {
    key: "productSetup",
    label: "Product Setup",
    description: "Category, sizing, description and the other identity fields.",
  },
  {
    key: "technicalDrawings",
    label: "Technical Drawings (Bill of Materials comes with this)",
    description:
      "Images, canvas pages, annotations and colourways. The BOM derives from these.",
  },
  {
    key: "sizeSpecifications",
    label: "Size Specifications",
    description: "Spec sheets with their measurements and grading.",
  },
];

/** ToggleRow look shared with the Quick Export dialog (no checkbox primitive). */
export function SectionChecklist({
  value,
  onChange,
}: {
  value: CopySectionMask;
  onChange: (next: CopySectionMask) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground px-2 text-[11px] font-semibold tracking-wide uppercase">
        What to keep
      </p>
      {CHOICES.map((choice) => {
        const checked = value[choice.key];
        return (
          <button
            key={choice.key}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onChange({ ...value, [choice.key]: !checked })}
            className="hover:bg-accent focus-visible:ring-ring flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2"
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                checked
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-input bg-background",
              )}
            >
              {checked && <Check className="size-3" />}
            </span>
            <span className="min-w-0">
              <span className="block">{choice.label}</span>
              <span className="text-muted-foreground block text-xs">
                {choice.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function anySectionSelected(mask: CopySectionMask): boolean {
  return mask.productSetup || mask.technicalDrawings || mask.sizeSpecifications;
}
