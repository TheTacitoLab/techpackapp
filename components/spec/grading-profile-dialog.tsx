"use client";

import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  INCREMENT_FIELDS,
  TOLERANCE_FIELDS,
  readIncrementSet,
  readToleranceSet,
} from "@/components/spec/spec-data";
import type { GradingProfile } from "@/types";

/** The payload shape `createGradingProfile` / `updateGradingProfile` accept. */
export interface GradingProfilePayload {
  name: string;
  description: string | null;
  sizeRunLabels: string[];
  breakSizeLabel: string | null;
  baseIncrements: Record<string, number>;
  extendedIncrements: Record<string, number> | null;
  tolerancesKnit: Record<string, number>;
  tolerancesWoven: Record<string, number>;
}

/** Men's starter values — the form's create-mode defaults, per the reference. */
const DEFAULT_BASE: Record<string, string> = {
  primary_girth: "2.5",
  secondary_girth: "1.2",
  body_length: "1.5",
  limb_length: "1.2",
  small_shoulder: "1.2",
  small_neck: "0.6",
  small_cuff_opening: "0.6",
  small_rise: "1.0",
  small_strap: "0",
  inseam: "0",
};
const DEFAULT_EXTENDED: Record<string, string> = {
  ...DEFAULT_BASE,
  primary_girth: "3.5",
  secondary_girth: "1.8",
};
const DEFAULT_KNIT: Record<string, string> = {
  primary_girth: "1.2",
  secondary_girth: "1.0",
  body_length: "1.0",
  limb_length: "1.0",
  small: "0.5",
  fixed: "0.5",
};
const DEFAULT_WOVEN: Record<string, string> = {
  primary_girth: "0.6",
  secondary_girth: "0.6",
  body_length: "1.0",
  limb_length: "1.0",
  small: "0.5",
  fixed: "0.5",
};

function stringsFromJson(
  json: GradingProfile["base_increments"] | null,
  reader: (j: GradingProfile["base_increments"] | null) => Record<string, number | undefined>,
  fallback: Record<string, string>,
): Record<string, string> {
  if (json === null) return { ...fallback };
  const set = reader(json);
  const result: Record<string, string> = {};
  for (const key of Object.keys(fallback)) {
    const value = set[key];
    result[key] = value !== undefined ? String(value) : "";
  }
  return result;
}

function numbersFromStrings(record: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const value = Number(raw.trim().replace(",", "."));
    if (raw.trim() !== "" && Number.isFinite(value) && value >= 0) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Create/edit form for a custom Grading Profile: per-category increments
 * (base + from-the-break), the break size, and the knit/woven tolerance sets
 * — plain-language labels, with the reference's Men's values as defaults.
 * Controlled `open` so the picker can launch it for create, edit, or
 * duplicate-then-edit. Delete (edit mode) uses the inline two-step confirm.
 */
export function GradingProfileDialog({
  open,
  onOpenChange,
  mode,
  profile,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** Seeds the form in edit mode; ignored for create. */
  profile: GradingProfile | null;
  onSave: (payload: GradingProfilePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [runLabels, setRunLabels] = useState("");
  const [breakLabel, setBreakLabel] = useState("");
  const [base, setBase] = useState<Record<string, string>>({ ...DEFAULT_BASE });
  const [extended, setExtended] = useState<Record<string, string>>({
    ...DEFAULT_EXTENDED,
  });
  const [knit, setKnit] = useState<Record<string, string>>({ ...DEFAULT_KNIT });
  const [woven, setWoven] = useState<Record<string, string>>({
    ...DEFAULT_WOVEN,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed drafts each time the dialog opens (render-time reseed keyed on open).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = open ? `${mode}:${profile?.id ?? "new"}:${profile?.updated_at ?? ""}` : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    if (seedKey !== null) {
      const source = mode === "edit" ? profile : null;
      setName(source?.name ?? "");
      setDescription(source?.description ?? "");
      setRunLabels((source?.size_run_labels ?? []).join(", "));
      setBreakLabel(source?.break_size_label ?? (source ? "" : "2XL"));
      setBase(
        source
          ? stringsFromJson(source.base_increments, readIncrementSet, DEFAULT_BASE)
          : { ...DEFAULT_BASE },
      );
      setExtended(
        source
          ? stringsFromJson(source.extended_increments, readIncrementSet, DEFAULT_EXTENDED)
          : { ...DEFAULT_EXTENDED },
      );
      setKnit(
        source
          ? stringsFromJson(source.tolerances_knit, readToleranceSet, DEFAULT_KNIT)
          : { ...DEFAULT_KNIT },
      );
      setWoven(
        source
          ? stringsFromJson(source.tolerances_woven, readToleranceSet, DEFAULT_WOVEN)
          : { ...DEFAULT_WOVEN },
      );
      setConfirmingDelete(false);
    }
  }

  async function handleSave() {
    if (name.trim().length === 0) return;
    const breakSize = breakLabel.trim();
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
        sizeRunLabels: runLabels
          .split(/[,/]/)
          .map((label) => label.trim())
          .filter((label) => label.length > 0),
        breakSizeLabel: breakSize === "" ? null : breakSize,
        baseIncrements: numbersFromStrings(base),
        extendedIncrements:
          breakSize === "" ? null : numbersFromStrings(extended),
        tolerancesKnit: numbersFromStrings(knit),
        tolerancesWoven: numbersFromStrings(woven),
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const hasBreak = breakLabel.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create grading profile" : "Edit grading profile"}
          </DialogTitle>
          <DialogDescription>
            How much each kind of measurement changes per size step, in cm.
            The defaults are industry-typical — adjust to your fit block.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="gp-name">
                Name
              </Label>
              <Input
                id="gp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Our men's block"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="gp-run">
                Default size run (reference only)
              </Label>
              <Input
                id="gp-run"
                value={runLabels}
                onChange={(e) => setRunLabels(e.target.value)}
                placeholder="S, M, L, XL, 2XL…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="gp-description">
              Notes
            </Label>
            <Textarea
              id="gp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who this profile fits and where it came from."
              maxLength={400}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="gp-break">
              Break size (bigger jumps from this size up — leave empty for none)
            </Label>
            <Input
              id="gp-break"
              value={breakLabel}
              onChange={(e) => setBreakLabel(e.target.value)}
              placeholder="e.g. 2XL"
              maxLength={20}
              className="w-32"
            />
          </div>

          <div className="space-y-2">
            <h4 className="text-label text-[13px] font-medium">
              Increments per size step (cm)
            </h4>
            <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-2 gap-y-1.5">
              <span />
              <span className="text-muted-foreground text-xs font-semibold">
                Base
              </span>
              <span className="text-muted-foreground text-xs font-semibold">
                From break
              </span>
              {INCREMENT_FIELDS.map((field) => (
                <Fragment key={field.key}>
                  <Label
                    className="text-xs font-normal"
                    htmlFor={`gp-base-${field.key}`}
                  >
                    {field.label}
                  </Label>
                  <Input
                    id={`gp-base-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="h-8"
                    value={base[field.key] ?? ""}
                    onChange={(e) =>
                      setBase((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="h-8"
                    value={extended[field.key] ?? ""}
                    onChange={(e) =>
                      setExtended((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    disabled={!hasBreak}
                  />
                </Fragment>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-label text-[13px] font-medium">
              Tolerances (± cm)
            </h4>
            <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-2 gap-y-1.5">
              <span />
              <span className="text-muted-foreground text-xs font-semibold">
                Knits
              </span>
              <span className="text-muted-foreground text-xs font-semibold">
                Wovens
              </span>
              {TOLERANCE_FIELDS.map((field) => (
                <Fragment key={field.key}>
                  <Label
                    className="text-xs font-normal"
                    htmlFor={`gp-knit-${field.key}`}
                  >
                    {field.label}
                  </Label>
                  <Input
                    id={`gp-knit-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="h-8"
                    value={knit[field.key] ?? ""}
                    onChange={(e) =>
                      setKnit((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholderKnit}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="h-8"
                    value={woven[field.key] ?? ""}
                    onChange={(e) =>
                      setWoven((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholderWoven}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {mode === "edit" && onDelete ? (
            confirmingDelete ? (
              <span className="flex items-center gap-1.5">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={handleDelete}
                >
                  {busy ? "Deleting…" : "Confirm delete"}
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
                Delete profile
              </Button>
            )
          ) : (
            <span />
          )}
          <Button
            onClick={handleSave}
            disabled={busy || name.trim().length === 0}
          >
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
