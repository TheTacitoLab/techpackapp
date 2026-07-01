"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { getAnnotationSummary } from "@/components/canvas/annotation-summary";
import {
  colourForLayerType,
  layerByKey,
  readableTextOn,
  type LayerKey,
} from "@/components/canvas/layers";
import { cn } from "@/lib/utils";
import type { CanvasAnnotation } from "@/types";

/**
 * Collapsible right-hand list of the active layer's annotations, generic
 * across layers: it renders whatever it's given uniformly via the shared
 * `getAnnotationSummary` helper (`annotation-summary.ts`), which is where
 * per-layer formatting lives — adding a later layer (Colourways, Construction,
 * Measurements) to this panel means extending that summary function, not
 * rebuilding this component.
 */
export function AnnotationListPanel({
  annotations,
  activeLayerKey,
  selectedId,
  onSelect,
  isCollapsed,
  onToggleCollapse,
}: {
  annotations: CanvasAnnotation[];
  activeLayerKey: LayerKey;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const layer = layerByKey(activeLayerKey);

  if (isCollapsed) {
    return (
      <div className="border-border bg-card flex w-10 shrink-0 flex-col items-center border-l py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand annotation list"
          className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-border bg-card flex w-72 shrink-0 flex-col overflow-hidden rounded-r-xl border-l">
      <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-sm font-semibold">{layer.label}</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse annotation list"
          className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {annotations.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            No {layer.label.toLowerCase()} annotations yet — click the drawing
            to add one.
          </p>
        ) : (
          <ul className="space-y-1">
            {annotations.map((annotation) => {
              const summary = getAnnotationSummary(annotation);
              const color = colourForLayerType(annotation.layer_type);
              const isSelected = annotation.id === selectedId;
              return (
                <li key={annotation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(annotation.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: color, color: readableTextOn(color) }}
                    >
                      {annotation.reference_code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {summary.title}
                      </span>
                      {summary.detail && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {summary.detail}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="text-muted-foreground mt-1 size-3.5 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
