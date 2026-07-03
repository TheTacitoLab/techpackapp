"use client";

import { Plus, X } from "lucide-react";

import { HEX, type Colour } from "@/components/library-item-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";

/**
 * Repeatable {name, pantone, hex} colour-variant rows for library items —
 * shared by the Settings Master Library form and the inline quick-add form
 * (one editor, one `properties.colours` shape everywhere).
 */
export function ColourEditor({
  colours,
  onChange,
}: {
  colours: Colour[];
  onChange: (next: Colour[]) => void;
}) {
  function update(i: number, patch: Partial<Colour>) {
    onChange(colours.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function add() {
    onChange([...colours, { name: "", pantone_tcx: "", hex: "#000000" }]);
  }
  function remove(i: number) {
    onChange(colours.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <FieldLabel>Colourways</FieldLabel>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      {colours.length === 0 ? (
        <p className="text-muted-foreground text-xs">No colourways added.</p>
      ) : (
        <div className="space-y-2">
          {colours.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={HEX.test(c.hex) ? c.hex : "#000000"}
                onChange={(e) => update(i, { hex: e.target.value.toUpperCase() })}
                aria-label="Colour swatch"
                className="size-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
              />
              <Input
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Name"
                className="flex-1"
              />
              <Input
                value={c.pantone_tcx}
                onChange={(e) => update(i, { pantone_tcx: e.target.value })}
                placeholder="Pantone TCX"
                className="w-32"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove colourway"
                className="text-muted-foreground hover:text-destructive flex size-7 shrink-0 cursor-pointer items-center justify-center rounded transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
