"use client";

import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The app's one colour-picking control — preset swatches + native picker + hex
 * input — extracted verbatim from the Labels manager so Labels and the layer
 * Marker Colours editor share a single component instead of two copies.
 *
 * Controlled and permissive: `onChange` receives whatever the user has entered
 * (including partial hex while typing), so the OWNER decides when a value is
 * valid enough to act on (Labels validates on save; Marker Colours applies
 * live only once the hex is complete).
 */
export const PRESET_COLORS = [
  "#C8F000",
  "#FF6B6B",
  "#60B4FF",
  "#FFB347",
  "#B47FFF",
  "#4ECDC4",
  "#FF85A1",
  "#FF8C42",
  "#94A3B8",
  "#4ADE80",
  "#F87171",
  "#A855F7",
] as const;

export const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Select colour ${color}`}
            className={cn(
              "relative size-7 cursor-pointer rounded-full border transition-transform hover:scale-110",
              value.toLowerCase() === color.toLowerCase() &&
                "ring-foreground ring-offset-background ring-2 ring-offset-2",
            )}
            style={{ backgroundColor: color }}
          >
            {value.toLowerCase() === color.toLowerCase() && (
              <Check className="absolute inset-0 m-auto size-3.5 text-foreground/70" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_COLOUR.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label="Custom colour"
          className="size-9 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#C8F000"
          className="w-32 font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}
