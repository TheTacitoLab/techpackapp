"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORY_CHOICES,
  categoryChoiceValue,
  findCategoryChoice,
  parseSpecValueInput,
} from "@/components/spec/spec-data";
import type { ProductSpecRow, SpecGradeCategory, SpecPomSubKind } from "@/types";

export interface SpecRowDraft {
  name: string;
  howToMeasure: string | null;
  gradeCategory: SpecGradeCategory;
  subKind: SpecPomSubKind | null;
  toleranceOverride: number | null;
}

/**
 * Popover form for a Spec Sheet row — "Add measurement" (create mode) and the
 * per-row edit pencil share it. Every new/edited row picks a plain-language
 * "How it grades" choice (the flattened category+sub-kind list), which is
 * what makes fully custom rows gradeable. Deleting uses the inline two-step
 * confirm (the tight-popover house pattern).
 */
export function SpecRowEditor({
  mode,
  row,
  defaultToleranceLabel,
  onSave,
  onDelete,
  trigger,
}: {
  mode: "create" | "edit";
  row?: ProductSpecRow;
  /** e.g. "±1.2 from profile" — shown as the override field's placeholder. */
  defaultToleranceLabel?: string;
  onSave: (draft: SpecRowDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [choice, setChoice] = useState<string>(CATEGORY_CHOICES[0].value);
  const [tolerance, setTolerance] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  function seedDrafts() {
    setName(row?.name ?? "");
    setHint(row?.how_to_measure ?? "");
    setChoice(
      row
        ? categoryChoiceValue(row.grade_category, row.sub_kind)
        : CATEGORY_CHOICES[0].value,
    );
    setTolerance(
      row?.tolerance_override !== null && row?.tolerance_override !== undefined
        ? String(row.tolerance_override)
        : "",
    );
    setConfirmingDelete(false);
  }

  function handleOpenChange(next: boolean) {
    if (next) seedDrafts();
    setOpen(next);
  }

  async function handleSave() {
    const picked = findCategoryChoice(choice);
    if (!picked || name.trim().length === 0) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        howToMeasure: hint.trim() === "" ? null : hint.trim(),
        gradeCategory: picked.gradeCategory,
        subKind: picked.subKind,
        toleranceOverride: parseSpecValueInput(tolerance),
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="spec-row-name">
            Measurement name
          </Label>
          <Input
            id="spec-row-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chest width"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">How it grades</Label>
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_CHOICES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="spec-row-hint">
            How to measure (shown as a hint)
          </Label>
          <Textarea
            id="spec-row-hint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. 1&quot; below the armhole, edge to edge."
            maxLength={300}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="spec-row-tolerance">
            Tolerance override (± cm)
          </Label>
          <Input
            id="spec-row-tolerance"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
            placeholder={defaultToleranceLabel ?? "Profile default"}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {mode === "edit" && onDelete ? (
            confirmingDelete ? (
              <span className="flex items-center gap-1.5">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={handleDelete}
                >
                  {busy ? "Deleting…" : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={busy || name.trim().length === 0}
          >
            {busy
              ? "Saving…"
              : mode === "create"
                ? "Add measurement"
                : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
