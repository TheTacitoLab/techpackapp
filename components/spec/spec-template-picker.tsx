"use client";

import { useState } from "react";
import { FilePlus2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ResolvedSpecTemplate, SpecTemplateCategory } from "@/types";

/**
 * Step 1 — "Choose Spec Template": a grouped card grid of the seeded starter
 * templates (plus any workspace customs) and a "Start blank" card. Picking a
 * card calls straight through — the parent owns the create action and its
 * pending state.
 */

export const CATEGORY_ORDER: readonly SpecTemplateCategory[] = [
  "tops",
  "bottoms",
  "outerwear",
  "performance",
  "womenswear",
  "accessories",
];

export const CATEGORY_LABEL: Record<SpecTemplateCategory, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  outerwear: "Outerwear",
  performance: "Performance / Teamwear",
  womenswear: "Womenswear",
  accessories: "Accessories",
};

export function SpecTemplatePicker({
  templates,
  onPick,
  disabled = false,
  showBlankOption = true,
}: {
  templates: ResolvedSpecTemplate[];
  onPick: (templateId: string | null) => void;
  disabled?: boolean;
  // The create flow now forks "template vs blank" up front (Tweak 1), so the
  // template list there hides its own "Start blank" card. Other callers (the
  // in-flow "change template" dialog) keep it.
  showBlankOption?: boolean;
}) {
  // Which card was clicked, so only it shows the pending state.
  const [pickedId, setPickedId] = useState<string | null | undefined>(undefined);

  function pick(templateId: string | null) {
    if (disabled) return;
    setPickedId(templateId);
    onPick(templateId);
  }

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    templates: templates.filter((t) => t.category === category),
  })).filter((group) => group.templates.length > 0);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.category} className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {CATEGORY_LABEL[group.category]}
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.templates.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={disabled}
                onClick={() => pick(template.id)}
                className={cn(
                  "bg-card hover:ring-brand/40 flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-shadow hover:ring-2 disabled:opacity-60",
                  pickedId === template.id && disabled && "ring-brand ring-2",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium">
                    {template.name}
                  </span>
                  {template.isGlobal ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      GarSpec standard
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Custom
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {template.description ?? ""}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {template.poms.length} measurements
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {showBlankOption && (
        <div className="border-t pt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => pick(null)}
            className={cn(
              "bg-card hover:ring-brand/40 flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-shadow hover:ring-2 disabled:opacity-60",
              pickedId === null && disabled && "ring-brand ring-2",
            )}
          >
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
              <FilePlus2 className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Start blank</span>
              <span className="text-muted-foreground block text-xs">
                An empty Spec Sheet, add your own measurements one by one.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
