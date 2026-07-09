"use client";

import { ClipboardList, PencilRuler, Ruler } from "lucide-react";

import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";

/**
 * The "what does this template contain" indicator row — shared by the
 * Settings cards and the Use-A-Template picker so the two read identically.
 */
export function TemplateContentIndicators({
  template,
}: {
  template: TemplateSummary;
}) {
  const parts = [
    { label: "Setup", present: template.hasSetup, icon: ClipboardList },
    { label: "Drawings", present: template.hasDrawings, icon: PencilRuler },
    { label: "Specs", present: template.hasSpecs, icon: Ruler },
  ];
  return (
    <div className="flex items-center gap-2.5">
      {parts.map((part) => (
        <span
          key={part.label}
          className={cn(
            "flex items-center gap-1 text-xs",
            part.present ? "text-foreground" : "text-muted-foreground/50",
          )}
          title={
            part.present
              ? `Includes ${part.label.toLowerCase()}`
              : `No ${part.label.toLowerCase()}`
          }
        >
          <part.icon className="size-3.5" />
          {part.label}
        </span>
      ))}
    </div>
  );
}

export function templateMetaLine(template: TemplateSummary): string {
  const parts = [
    template.brandName ?? "No brand",
    template.category ?? null,
    new Date(template.createdAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  ].filter(Boolean);
  return parts.join(" · ");
}
