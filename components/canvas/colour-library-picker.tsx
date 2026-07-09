"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createWorkspaceColour } from "@/app/(app)/settings/colour-actions";
import { ColourChipCard } from "@/components/colour-chip-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceColour } from "@/types";

/**
 * The workspace colour library as threaded down the canvas prop chain
 * (page → TechnicalDetailsSection → PageEditor → PageCanvas → pin editors),
 * exactly the way `libraryItems` travels. `onSaved` merges a colour created
 * inline (a pin's "Save to library") into the caller's local list so every
 * other pin form sees it before `router.refresh()` catches up — the same
 * optimistic idiom as `useInlineAddedLibraryItems`.
 */
export type WorkspaceColourLibrary = {
  colours: WorkspaceColour[];
  onSaved: (colour: WorkspaceColour) => void;
};

/**
 * Inline "pick from library" sub-view for the pin editors — swaps the editor's
 * RENDER only (the component and its draft state stay mounted), the same
 * detour pattern as `LibraryQuickAddForm`. Compact Pantone-style chip cards
 * in a grid; picking one hands the full colour back and returns to the form.
 */
export function ColourLibraryPickPanel({
  colours,
  onPick,
  onCancel,
}: {
  colours: WorkspaceColour[];
  onPick: (colour: WorkspaceColour) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        From colour library
      </div>

      {colours.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No colours in your library yet. Save one from a colourway pin, or add
          them in Settings → Colours.
        </p>
      ) : (
        <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
          {colours.map((colour) => (
            <button
              key={colour.id}
              type="button"
              onClick={() => onPick(colour)}
              title={[colour.hex, colour.pantone].filter(Boolean).join(" · ")}
              className="hover:ring-brand/40 focus-visible:ring-brand rounded-md text-left outline-none hover:ring-2 focus-visible:ring-2"
            >
              <ColourChipCard colour={colour} size="compact" />
            </button>
          ))}
        </div>
      )}

      <div className="pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline "save to library" sub-view for the colourway pin editor — the
 * sample-then-save flow's landing spot. The hex is fixed (it IS the pin's
 * colour); name and Pantone are editable, pre-filled from the pin's fields.
 * On success the created row is handed back so the caller can merge it into
 * the live library list.
 */
export function SaveColourToLibraryPanel({
  initialName,
  hex,
  initialPantone,
  onSaved,
  onCancel,
}: {
  initialName: string;
  /** Already validated + uppercased by the caller. */
  hex: string;
  initialPantone: string;
  onSaved: (colour: WorkspaceColour) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pantone, setPantone] = useState(initialPantone);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    // Guards the Enter-key path: a held Enter must not insert twice.
    if (isSaving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a colour name.");
      return;
    }
    setIsSaving(true);
    try {
      const colour = await createWorkspaceColour(
        trimmed,
        hex,
        pantone.trim() || null,
      );
      toast.success("Colour added to your library.");
      onSaved(colour);
      router.refresh();
    } catch {
      toast.error("Could not save the colour.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Save to colour library
      </div>

      <div className="flex items-center gap-2">
        <span
          className="size-9 shrink-0 rounded border"
          style={{ backgroundColor: hex }}
        />
        <span className="font-mono text-xs uppercase">{hex}</span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scl-name" className="text-xs">
          Name
        </Label>
        <Input
          id="scl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bering Sea"
          maxLength={60}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scl-pantone" className="text-xs">
          Pantone reference
        </Label>
        <Input
          id="scl-pantone"
          value={pantone}
          onChange={(e) => setPantone(e.target.value)}
          placeholder="e.g. 19-4025 TCX"
          maxLength={40}
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={onCancel}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving}
          onClick={handleSave}
        >
          {isSaving ? "Saving…" : "Save to library"}
        </Button>
      </div>
    </div>
  );
}
