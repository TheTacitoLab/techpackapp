"use client";

import { Hammer, Layers, Palette, Ruler, type LucideIcon } from "lucide-react";

import { useLayerColours } from "@/components/canvas/layer-colours-context";
import type { AnnotationLayer, LayerIconName } from "@/components/canvas/layers";
import { cn } from "@/lib/utils";

/** Lucide component per layer icon name — shared with the colour editor rows. */
export const LAYER_ICONS: Record<LayerIconName, LucideIcon> = {
  Palette,
  Layers,
  Ruler,
  Hammer,
};

/**
 * One of the four layer buttons across the top of the Page Editor. Large pill
 * (min-h 44px) with the layer's icon, label, and a global annotation count
 * badge. Active state reads the layer's LIVE workspace colour (inline style —
 * dynamic, never a Tailwind token). Only styling lives here; the parent owns
 * which layer is active.
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
      style={
        active
          ? { backgroundColor: `${color}22`, borderColor: color }
          : undefined
      }
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors",
        active
          ? "text-foreground font-semibold"
          : "bg-muted text-muted-foreground hover:bg-accent border-transparent",
      )}
    >
      <Icon className="size-4 shrink-0" style={{ color }} />
      <span className="whitespace-nowrap">{layer.label}</span>
      <span
        className={cn(
          "ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        style={{ backgroundColor: `${color}22` }}
      >
        {count}
      </span>
    </button>
  );
}
