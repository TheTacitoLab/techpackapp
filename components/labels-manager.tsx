"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createLabel,
  deleteLabel,
  updateLabel,
} from "@/app/(app)/settings/actions";
import {
  ColorPicker,
  HEX_COLOUR as HEX,
  PRESET_COLORS,
} from "@/components/color-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import type { Label } from "@/types";

type LabelWithUsage = Label & { usageCount: number };

function EditLabelDialog({
  label,
  open,
  onOpenChange,
}: {
  label: LabelWithUsage;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);

  function onSave() {
    if (!name.trim() || !HEX.test(color)) {
      toast.error("Enter a name and a valid hex colour.");
      return;
    }
    startTransition(async () => {
      try {
        await updateLabel(label.id, name.trim(), color);
        toast.success("Label updated.");
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Could not update label.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit label</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Colour</FieldLabel>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabelChip({ label }: { label: LabelWithUsage }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteLabel(label.id);
        toast.success("Label deleted.");
        router.refresh();
      } catch {
        toast.error("Could not delete label.");
      }
    });
  }

  return (
    <li className="bg-card flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-sm">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span className="max-w-[10rem] truncate">{label.name}</span>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        aria-label={`Edit ${label.name}`}
        className="text-muted-foreground hover:text-foreground flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors"
      >
        <Pencil className="size-3.5" />
      </button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            aria-label={`Delete ${label.name}`}
            className="text-muted-foreground hover:text-destructive flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors"
          >
            <Trash2 className="size-3.5" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{label.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {label.usageCount > 0
                ? `This label is used on ${label.usageCount} ${
                    label.usageCount === 1 ? "product" : "products"
                  }. It will be removed from ${
                    label.usageCount === 1 ? "it" : "them"
                  }. This cannot be undone.`
                : "This label is not used on any products yet. This cannot be undone."}
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

      <EditLabelDialog
        label={label}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </li>
  );
}

export function LabelsManager({ labels }: { labels: LabelWithUsage[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);

  function onAdd() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a label name.");
      return;
    }
    if (!HEX.test(color)) {
      toast.error("Choose a valid hex colour.");
      return;
    }
    startTransition(async () => {
      try {
        await createLabel(trimmed, color);
        toast.success("Label created.");
        setName("");
        setColor(PRESET_COLORS[0]);
        router.refresh();
      } catch {
        toast.error("Could not create label. Names must be unique.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Create form */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <FieldLabel htmlFor="new-label-name">Label name</FieldLabel>
            <div className="flex items-center gap-2">
              <span
                className="size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: HEX.test(color) ? color : undefined }}
              />
              <Input
                id="new-label-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priority"
                maxLength={30}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAdd();
                  }
                }}
              />
            </div>
          </div>
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <Button onClick={onAdd} disabled={isPending} size="sm">
          <Plus className="size-3.5" />
          {isPending ? "Adding…" : "Add Label"}
        </Button>
      </div>

      {/* Existing labels */}
      {labels.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No labels yet. Create one above to start tagging products.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </ul>
      )}
    </div>
  );
}
