"use client";

import { Award, Hammer, Layers, Palette, Ruler, type LucideIcon } from "lucide-react";

import { useLayerColours } from "@/components/canvas/layer-colours-context";
import type { AnnotationLayer, LayerIconName } from "@/components/canvas/layers";
import { cn } from "@/lib/utils";

/** Lucide component per layer icon name — shared with the colour editor rows. */
export const LAYER_ICONS: Record<LayerIconName, LucideIcon> = {
  Palette,
  Layers,
  Ruler,
  Hammer,
  Award,
};

/**
 * One of the five layer buttons across the top of the Page Editor. A compact
 * pill (32px) with the layer's icon, label, and a global annotation count
 * badge — sized so all five plus "All layers" fit one line at typical
 * fullscreen widths. Below 50rem of layer-bar width (@container query, set by
 * the parent's wrapper) the label condenses away and only icon + count
 * remain; `title` always carries the full name. Active state reads the
 * layer's LIVE workspace colour (inline style — dynamic, never a Tailwind
 * token). Only styling lives here; the parent owns which layer is active.
 */
export function LayerButton({
  layer,
  active,
  count,
  onClick,
}: {
  layer: AnnotationLayer;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = LAYER_ICONS[layer.icon];
  const { colourFor } = useLayerColours();
  const color = colourFor(layer.key);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={layer.label}
      style={
        active
          ? { backgroundColor: `${color}22`, borderColor: color }
          : undefined
      }
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 px-2 text-xs transition-colors",
        active
          ? "text-foreground font-semibold"
          : "bg-muted text-muted-foreground hover:bg-accent border-transparent",
      )}
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      <span className="hidden whitespace-nowrap @[50rem]:inline">
        {layer.label}
      </span>
      <span
        className={cn(
          "inline-flex min-w-4 items-center justify-center rounded-full px-1 py-px text-[10px] font-semibold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        style={{ backgroundColor: `${color}22` }}
      >
        {count}
      </span>
    </button>
  );
}
