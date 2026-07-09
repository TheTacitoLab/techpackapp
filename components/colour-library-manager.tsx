"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createWorkspaceColour,
  deleteWorkspaceColour,
  reorderWorkspaceColours,
  updateWorkspaceColour,
} from "@/app/(app)/settings/colour-actions";
import { ColourChipCard } from "@/components/colour-chip-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { WORKSPACE_COLOUR_HEX, normaliseHex } from "@/lib/workspace-colours";
import type { WorkspaceColour } from "@/types";

/**
 * The three colour fields shared by the add and edit dialogs: name, hex (native
 * colour input + text, same row the pin editors use), optional Pantone.
 */
function ColourFields({
  name,
  setName,
  hex,
  setHex,
  pantone,
  setPantone,
  onEnter,
}: {
  name: string;
  setName: (v: string) => void;
  hex: string;
  setHex: (v: string) => void;
  pantone: string;
  setPantone: (v: string) => void;
  onEnter: () => void;
}) {
  function submitOnEnter(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FieldLabel htmlFor="colour-name">Name</FieldLabel>
        <Input
          id="colour-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bering Sea"
          maxLength={60}
          onKeyDown={submitOnEnter}
        />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="colour-hex">Hex</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={WORKSPACE_COLOUR_HEX.test(hex) ? hex : "#000000"}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            aria-label="Pick colour"
            className="size-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
          />
          <Input
            id="colour-hex"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#C8F000"
            className="w-32 font-mono uppercase"
            maxLength={7}
            onKeyDown={submitOnEnter}
          />
        </div>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="colour-pantone">Pantone reference</FieldLabel>
        <Input
          id="colour-pantone"
          value={pantone}
          onChange={(e) => setPantone(e.target.value)}
          placeholder="e.g. 19-4025 TCX"
          maxLength={40}
          onKeyDown={submitOnEnter}
        />
        <p className="text-muted-foreground text-xs">
          Optional — from your supplier or swatch book.
        </p>
      </div>
    </div>
  );
}

/**
 * "Add colour" dialog for the Settings grid. (The canvas pin editors' "Save
 * to library" flow uses its own inline panel — SaveColourToLibraryPanel in
 * components/canvas/colour-library-picker.tsx.)
 */
function AddColourDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [hex, setHex] = useState("");
  const [pantone, setPantone] = useState("");

  function onSave() {
    // Guards the Enter-key path: a held Enter must not insert twice.
    if (isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a colour name.");
      return;
    }
    const cleanHex = normaliseHex(hex);
    if (!cleanHex) {
      toast.error("Enter a valid hex colour.");
      return;
    }
    startTransition(async () => {
      try {
        await createWorkspaceColour(trimmed, cleanHex, pantone.trim() || null);
        toast.success("Colour added to your library.");
        setName("");
        setHex("");
        setPantone("");
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Could not save the colour.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add colour</DialogTitle>
        </DialogHeader>
        <ColourFields
          name={name}
          setName={setName}
          hex={hex}
          setHex={setHex}
          pantone={pantone}
          setPantone={setPantone}
          onEnter={onSave}
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditColourDialog({
  colour,
  open,
  onOpenChange,
}: {
  colour: WorkspaceColour;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(colour.name);
  const [hex, setHex] = useState(colour.hex);
  const [pantone, setPantone] = useState(colour.pantone ?? "");

  // Reseed from the (possibly refreshed) row on each closed→open transition —
  // NOT via a key on the dialog: a drag-reorder bumps every row's updated_at,
  // and a key on that would remount this dialog mid-edit and wipe typed input.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(colour.name);
      setHex(colour.hex);
      setPantone(colour.pantone ?? "");
    }
  }

  function onSave() {
    // Guards the Enter-key path: a held Enter must not submit twice.
    if (isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a colour name.");
      return;
    }
    const cleanHex = normaliseHex(hex);
    if (!cleanHex) {
      toast.error("Enter a valid hex colour.");
      return;
    }
    startTransition(async () => {
      try {
        await updateWorkspaceColour(
          colour.id,
          trimmed,
          cleanHex,
          pantone.trim() || null,
        );
        toast.success("Colour updated.");
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Could not update the colour.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit colour</DialogTitle>
        </DialogHeader>
        <ColourFields
          name={name}
          setName={setName}
          hex={hex}
          setHex={setHex}
          pantone={pantone}
          setPantone={setPantone}
          onEnter={onSave}
        />
        <DialogFooter>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColourCard({
  colour,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  colour: WorkspaceColour;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteWorkspaceColour(colour.id);
        toast.success("Colour deleted.");
        router.refresh();
      } catch {
        toast.error("Could not delete the colour.");
      }
    });
  }

  return (
    <li
      className={dragging ? "opacity-50" : undefined}
      draggable
      onDragStart={(e) => {
        // Firefox refuses to begin an HTML5 drag unless dragstart sets data.
        e.dataTransfer.setData("text/plain", colour.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <ColourChipCard
        colour={colour}
        className="cursor-grab active:cursor-grabbing"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-0.5 -mr-1 size-7 shrink-0"
                aria-label={`${colour.name} options`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{colour.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pins already filled from this colour keep their name, hex and
              Pantone — only the library entry is removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditColourDialog
        colour={colour}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </li>
  );
}

/**
 * The Settings → Colours manager: the workspace colour library as a grid of
 * Pantone-style chip cards. Add/edit/delete via dialogs; drag a card onto
 * another to reorder (same HTML5 drag idiom as the canvas page overview).
 */
export function ColourLibraryManager({
  colours,
}: {
  colours: WorkspaceColour[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startReorder] = useTransition();

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ids = colours.map((c) => c.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    setDraggingId(null);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    startReorder(async () => {
      try {
        await reorderWorkspaceColours(ids);
        router.refresh();
      } catch {
        toast.error("Could not reorder colours.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Reusable colours for the whole workspace — pick them from any
          colourway pin&apos;s &ldquo;From library&rdquo;. Drag cards to
          reorder.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          Add Colour
        </Button>
      </div>

      {colours.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No colours yet. Add one here, or sample a colour on the canvas and
          save it to the library from the pin.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
          {colours.map((colour) => (
            <ColourCard
              key={colour.id}
              colour={colour}
              dragging={draggingId === colour.id}
              onDragStart={() => setDraggingId(colour.id)}
              onDragEnd={() => setDraggingId(null)}
              onDrop={() => handleDrop(colour.id)}
            />
          ))}
        </ul>
      )}

      <AddColourDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
