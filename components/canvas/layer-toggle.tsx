"use client";

import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** A single annotation layer's display metadata. */
export type LayerOption = { type: string; label: string; color: string };

/**
 * Compact chip group of annotation layer types with per-chip visibility. Fully
 * generic — it renders whatever `availableLayers` is passed, so Phase 5 can add
 * more layers without touching this component. Active chips fill with the
 * layer's colour at low opacity; inactive chips are muted.
 */
export function LayerToggle({
  availableLayers,
  visibleLayers,
  onToggle,
}: {
  availableLayers: LayerOption[];
  visibleLayers: Set<string>;
  onToggle: (type: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {availableLayers.map((layer) => {
        const active = visibleLayers.has(layer.type);
        return (
          <button
            key={layer.type}
            type="button"
            onClick={() => onToggle(layer.type)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "text-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            style={
              active
                ? { backgroundColor: `${layer.color}33` }
                : undefined
            }
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: layer.color }}
            />
            {layer.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Annotating as:" selector — chooses which layer new pins are placed on.
 * Separate from visibility so you can hide a layer while still drawing on it.
 * Also generic over `availableLayers`.
 */
export function ActiveLayerSelector({
  availableLayers,
  activeLayer,
  onChange,
}: {
  availableLayers: LayerOption[];
  activeLayer: string;
  onChange: (type: string) => void;
}) {
  const active = availableLayers.find((l) => l.type === activeLayer);

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Annotating as:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="border-border bg-card hover:bg-accent flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
          >
            {active && (
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: active.color }}
              />
            )}
            {active?.label ?? "Select layer"}
            <ChevronDown className="text-muted-foreground size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>New pins go on…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableLayers.map((layer) => (
            <DropdownMenuItem
              key={layer.type}
              onSelect={() => onChange(layer.type)}
              className="gap-2"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              {layer.label}
              {layer.type === activeLayer && (
                <Check className="text-muted-foreground ml-auto size-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
