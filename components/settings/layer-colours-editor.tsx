"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { updateLayerColours } from "@/app/(app)/settings/actions";
import { LAYER_ICONS } from "@/components/canvas/layer-button";
import { useLayerColours } from "@/components/canvas/layer-colours-context";
import {
  ANNOTATION_LAYERS,
  LAYER_COLOUR_HEX,
  type AnnotationLayer,
  type LayerColourOverrides,
  type LayerKey,
} from "@/components/canvas/layers";
import { ColorPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// One burst of edits (a picker drag emits many changes) becomes one save.
const SAVE_DEBOUNCE_MS = 600;

/**
 * The ONE editor for the workspace's layer marker colours, shared by BOTH
 * entry points — the "Marker Colours" Settings tab and the settings cog on the
 * canvas toolbar. Fully self-contained: it reads the live map from
 * `useLayerColours()` and needs no props, so both hosts render `<LayerColoursEditor />`.
 *
 * Every valid change applies optimistically through the provider FIRST — all
 * markers everywhere recolour instantly ("read live") — then persists via the
 * debounced `updateLayerColours` action, whose revalidation makes the server
 * render the same truth. On a failed save the pre-burst map is restored.
 */
export function LayerColoursEditor() {
  const { overrides, applyOverrides } = useLayerColours();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The map as it stood before the current unsaved burst — restored on failure.
  const revertTo = useRef<LayerColourOverrides | null>(null);

  function scheduleSave(next: LayerColourOverrides) {
    revertTo.current ??= overrides;
    applyOverrides(next); // live: every pin/button/dot recolours right now
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const prev = revertTo.current ?? {};
      revertTo.current = null;
      void updateLayerColours(next).catch(() => {
        toast.error("Could not save marker colours.");
        applyOverrides(prev);
      });
    }, SAVE_DEBOUNCE_MS);
  }

  function handleChange(key: LayerKey, hex: string) {
    scheduleSave({ ...overrides, [key]: hex.toUpperCase() });
  }

  function handleReset(key: LayerKey) {
    const next = { ...overrides };
    delete next[key];
    scheduleSave(next);
  }

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground pb-2 text-sm">
        Choose a marker colour for each annotation layer. Pick colours that
        contrast with your typical garment images so markers stay visible, and
        keep them consistent — these colours appear on every tech pack and in
        your PDF exports, so your factory sees the same colours throughout.
      </p>
      <div className="divide-border divide-y">
        {ANNOTATION_LAYERS.map((layer) => (
          <LayerColourRow
            key={layer.key}
            layer={layer}
            hasOverride={overrides[layer.key] !== undefined}
            onChange={handleChange}
            onReset={handleReset}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One layer's row: icon + label, the current swatch (a popover trigger opening
 * the shared `ColorPicker`), and a per-row reset back to the built-in default.
 * The picker's text field needs to hold PARTIAL hex while the user types, so
 * the row keeps a local draft and only propagates complete `#RRGGBB` values.
 */
function LayerColourRow({
  layer,
  hasOverride,
  onChange,
  onReset,
}: {
  layer: AnnotationLayer;
  hasOverride: boolean;
  onChange: (key: LayerKey, hex: string) => void;
  onReset: (key: LayerKey) => void;
}) {
  const Icon = LAYER_ICONS[layer.icon];
  const { colourFor } = useLayerColours();
  const resolved = colourFor(layer.key);

  // Draft resynced from the resolved colour whenever it changes from outside
  // (a completed pick, a reset, a server refresh) — render-time adjustment.
  const [draft, setDraft] = useState(resolved);
  const [synced, setSynced] = useState(resolved);
  if (resolved !== synced) {
    setSynced(resolved);
    setDraft(resolved);
  }

  function handlePick(next: string) {
    setDraft(next);
    if (LAYER_COLOUR_HEX.test(next)) onChange(layer.key, next);
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <Icon className="size-4 shrink-0" style={{ color: resolved }} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {layer.label}
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Change ${layer.label} marker colour`}
            className="border-border hover:bg-accent flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors"
          >
            <span
              className="size-4 shrink-0 rounded-full border"
              style={{ backgroundColor: resolved }}
            />
            {resolved.toUpperCase()}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <ColorPicker value={draft} onChange={handlePick} />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="sm"
        disabled={!hasOverride}
        onClick={() => onReset(layer.key)}
        title={`Reset to default (${layer.defaultColor})`}
      >
        <RotateCcw className="size-3.5" />
        Reset
      </Button>
    </div>
  );
}
