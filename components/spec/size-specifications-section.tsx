"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Ruler } from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradingProfilePicker } from "@/components/spec/grading-profile-picker";
import { SpecRowEditor, type SpecRowDraft } from "@/components/spec/spec-row-editor";
import { SpecSheetTable } from "@/components/spec/spec-sheet-table";
import { SpecTemplatePicker } from "@/components/spec/spec-template-picker";
import {
  formatSpecValue,
  gradableRow,
  gradingRulesFromProfile,
  toleranceSetForFabric,
} from "@/components/spec/spec-data";
import type { GradingProfilePayload } from "@/components/spec/grading-profile-dialog";
import {
  findSizeIndex,
  gradeSheet,
  normalizeSizeLabel,
  parseSizeRun,
  toleranceForRow,
} from "@/lib/spec-grading";
import {
  addSpecRow,
  changeSpecTemplate,
  createGradingProfile,
  createSpecSheet,
  deleteGradingProfile,
  deleteSpecRow,
  deleteSpecSheet,
  duplicateGradingProfile,
  reorderSpecRows,
  saveSpecValue,
  setSpecFabricType,
  setSpecGradingProfile,
  setSpecSampleSize,
  switchSpecSheetMode,
  updateGradingProfile,
  updateSpecRow,
} from "@/app/(app)/products/[id]/spec-actions";
import { cn } from "@/lib/utils";
import type {
  ProductSpecRow,
  ResolvedGradingProfile,
  ResolvedSpecSheet,
  ResolvedSpecTemplate,
  SpecFabricType,
} from "@/types";

/**
 * The Size Specifications section body — the three-step journey:
 *
 *   1. Choose Spec Template  → creates the product's Spec Sheet
 *   2. Enter your sample     → type measurements into the highlighted column
 *   3. Apply grading         → pick a Grading Profile; every size fills live
 *
 * Once set up the stepper collapses to a settings bar (template · sample ·
 * profile · knit/woven · mode) and the sheet is just *there*: sample edits
 * and profile switches re-grade instantly because non-sample columns are
 * computed in-render from the stored sample + profile (never persisted).
 *
 * Hot paths (cell typing, profile/fabric switches, row edits) patch local
 * state optimistically and run the server action in the background with
 * revert/refresh-on-error; structural changes (create sheet, change
 * template, mode switch) await the action inside a transition.
 */
export function SizeSpecificationsSection({
  productId,
  sizeRangeText,
  sheet,
  templates,
  profiles,
}: {
  productId: string;
  sizeRangeText: string | null;
  sheet: ResolvedSpecSheet | null;
  templates: ResolvedSpecTemplate[];
  profiles: ResolvedGradingProfile[];
}) {
  const router = useRouter();
  const [isWorking, startWorking] = useTransition();

  // ---- Optimistic local state (render-time resync idiom) ---------------------

  const [localProfiles, setLocalProfiles] = useState(profiles);
  const [syncedProfiles, setSyncedProfiles] = useState(profiles);
  if (profiles !== syncedProfiles) {
    setSyncedProfiles(profiles);
    setLocalProfiles(profiles);
  }

  const [localRows, setLocalRows] = useState<ProductSpecRow[]>(sheet?.rows ?? []);
  // localValues is keyed rowId → NORMALIZED size label → value, so casing
  // variants of the same label can never split a cell.
  const [localValues, setLocalValues] = useState<Record<string, Record<string, number>>>(
    () => valuesByRow(sheet),
  );
  const [localSettings, setLocalSettings] = useState(() => settingsOf(sheet));
  const [syncedSheet, setSyncedSheet] = useState(sheet);
  // While a cell save is in flight, a router.refresh() from an EARLIER save
  // must not clobber the just-typed value with the pre-save server snapshot
  // — skip the value resync until the queue drains (the next refresh after
  // the last save settles resyncs for real). State, not a ref: this is read
  // during render.
  const [pendingValueSaves, setPendingValueSaves] = useState(0);
  if (sheet !== syncedSheet) {
    setSyncedSheet(sheet);
    setLocalRows(sheet?.rows ?? []);
    if (pendingValueSaves === 0) setLocalValues(valuesByRow(sheet));
    setLocalSettings(settingsOf(sheet));
  }

  const [changeTemplateOpen, setChangeTemplateOpen] = useState(false);
  const [removeSheetOpen, setRemoveSheetOpen] = useState(false);
  const [modeConfirm, setModeConfirm] = useState<"auto" | "manual" | null>(null);

  // ---- Derived --------------------------------------------------------------

  const sizeRun = useMemo(() => parseSizeRun(sizeRangeText), [sizeRangeText]);

  const selectedProfile =
    localProfiles.find((p) => p.id === localSettings.profileId) ?? null;

  const sampleInRun =
    localSettings.sampleSize !== null &&
    findSizeIndex(sizeRun, localSettings.sampleSize) !== -1;

  const computedValues = useMemo(() => {
    if (
      !sheet ||
      localSettings.mode !== "auto" ||
      !selectedProfile ||
      !localSettings.sampleSize ||
      !sampleInRun
    ) {
      return null;
    }
    const sampleKey = normalizeSizeLabel(localSettings.sampleSize);
    const sampleValues: Record<string, number | null> = {};
    for (const r of localRows) {
      sampleValues[r.id] = localValues[r.id]?.[sampleKey] ?? null;
    }
    return gradeSheet(
      localRows.map(gradableRow),
      localSettings.sampleSize,
      sampleValues,
      gradingRulesFromProfile(selectedProfile),
      sizeRun,
    );
  }, [sheet, localSettings, selectedProfile, sampleInRun, localRows, localValues, sizeRun]);

  const toleranceSet = useMemo(
    () =>
      selectedProfile
        ? toleranceSetForFabric(selectedProfile, localSettings.fabricType)
        : {},
    [selectedProfile, localSettings.fabricType],
  );

  const hasAnyValue = Object.values(localValues).some(
    (byLabel) => Object.keys(byLabel).length > 0,
  );

  // ---- Empty states -----------------------------------------------------------

  if (sizeRun.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Ruler className="size-6" />
        </span>
        <p className="text-muted-foreground max-w-sm text-sm">
          Set your size range first — add it in{" "}
          <Link
            href="#section-identity"
            className="text-foreground font-medium underline underline-offset-2"
          >
            Product Setup
          </Link>{" "}
          (e.g. &ldquo;S–2XL&rdquo; or &ldquo;6, 8, 10, 12&rdquo;) and your
          Spec Sheet columns will come from it.
        </p>
      </div>
    );
  }

  // ---- Step 1: no sheet yet -----------------------------------------------------

  if (!sheet) {
    return (
      <div className="space-y-5">
        <ol className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <li className="text-foreground flex items-center gap-2 font-medium">
            <StepChip n={1} active />
            Choose Spec Template
          </li>
          <li className="flex items-center gap-2">
            <StepChip n={2} />
            Enter your sample
          </li>
          <li className="flex items-center gap-2">
            <StepChip n={3} />
            Apply grading
          </li>
        </ol>
        <SpecTemplatePicker
          templates={templates}
          disabled={isWorking}
          onPick={(templateId) => {
            startWorking(async () => {
              try {
                await createSpecSheet(productId, templateId);
                router.refresh();
              } catch {
                toast.error("Could not create the spec sheet.");
              }
            });
          }}
        />
      </div>
    );
  }

  // ---- Handlers (sheet exists from here on) --------------------------------------

  // Const alias so the notFound-style narrowing above survives inside the
  // nested handlers' closures (same trick as page.tsx's activeProduct).
  const activeSheet = sheet;

  function saveCell(rowId: string, sizeLabel: string, value: number | null) {
    const key = normalizeSizeLabel(sizeLabel);
    const previous = localValues[rowId]?.[key] ?? null;
    if (previous === value) return;
    setLocalValues((prev) => {
      const byLabel = { ...(prev[rowId] ?? {}) };
      if (value === null) delete byLabel[key];
      else byLabel[key] = value;
      return { ...prev, [rowId]: byLabel };
    });
    setPendingValueSaves((n) => n + 1);
    void saveSpecValue(rowId, sizeLabel, value)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not save the measurement.");
        setLocalValues((prev) => {
          const byLabel = { ...(prev[rowId] ?? {}) };
          if (previous === null) delete byLabel[key];
          else byLabel[key] = previous;
          return { ...prev, [rowId]: byLabel };
        });
      })
      .finally(() => {
        setPendingValueSaves((n) => n - 1);
      });
  }

  function changeSampleSize(nextLabel: string) {
    const previous = localSettings.sampleSize;
    if (previous === nextLabel) return;
    // Mirror the server: the sample column's values move to the new label.
    setLocalSettings((s) => ({ ...s, sampleSize: nextLabel }));
    if (localSettings.mode === "auto" && previous) {
      const previousKey = normalizeSizeLabel(previous);
      const nextKey = normalizeSizeLabel(nextLabel);
      setLocalValues((prev) => {
        const next: typeof prev = {};
        for (const [rowId, byLabel] of Object.entries(prev)) {
          const moved = { ...byLabel };
          if (previousKey in moved) {
            moved[nextKey] = moved[previousKey];
            if (previousKey !== nextKey) delete moved[previousKey];
          }
          next[rowId] = moved;
        }
        return next;
      });
    }
    void setSpecSampleSize(activeSheet.id, nextLabel)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not change the sample size.");
        router.refresh();
      });
  }

  function selectProfile(profileId: string) {
    const previous = localSettings.profileId;
    if (previous === profileId) return;
    setLocalSettings((s) => ({ ...s, profileId }));
    void setSpecGradingProfile(activeSheet.id, profileId)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not apply the grading profile.");
        setLocalSettings((s) => ({ ...s, profileId: previous }));
      });
  }

  function changeFabric(fabricType: SpecFabricType) {
    const previous = localSettings.fabricType;
    if (previous === fabricType) return;
    setLocalSettings((s) => ({ ...s, fabricType }));
    void setSpecFabricType(activeSheet.id, fabricType)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not change the fabric type.");
        setLocalSettings((s) => ({ ...s, fabricType: previous }));
      });
  }

  function confirmModeSwitch(target: "auto" | "manual") {
    setModeConfirm(null);
    startWorking(async () => {
      try {
        if (target === "manual") {
          // Snapshot what's on screen into editable stored cells.
          const entries: { rowId: string; sizeLabel: string; value: number }[] = [];
          for (const r of localRows) {
            for (const label of sizeRun) {
              const value =
                computedValues?.[r.id]?.[label] ??
                localValues[r.id]?.[normalizeSizeLabel(label)] ??
                null;
              if (value !== null) entries.push({ rowId: r.id, sizeLabel: label, value });
            }
          }
          await switchSpecSheetMode(activeSheet.id, "manual", entries);
        } else {
          await switchSpecSheetMode(activeSheet.id, "auto");
        }
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error && error.message === "Pick a sample size first."
            ? "Pick a sample size first."
            : "Could not switch the sheet mode.",
        );
      }
    });
  }

  async function handleUpdateRow(rowId: string, draft: SpecRowDraft) {
    const previous = localRows;
    setLocalRows((rows) =>
      rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              name: draft.name,
              how_to_measure: draft.howToMeasure,
              grade_category: draft.gradeCategory,
              sub_kind: draft.subKind,
              tolerance_override: draft.toleranceOverride,
            }
          : r,
      ),
    );
    try {
      await updateSpecRow(rowId, {
        name: draft.name,
        howToMeasure: draft.howToMeasure,
        gradeCategory: draft.gradeCategory,
        subKind: draft.subKind,
        toleranceOverride: draft.toleranceOverride,
      });
      router.refresh();
    } catch {
      toast.error("Could not save the measurement row.");
      setLocalRows(previous);
      throw new Error("save failed");
    }
  }

  async function handleDeleteRow(rowId: string) {
    const previous = localRows;
    setLocalRows((rows) => rows.filter((r) => r.id !== rowId));
    try {
      await deleteSpecRow(rowId);
      router.refresh();
    } catch {
      toast.error("Could not delete the measurement row.");
      setLocalRows(previous);
      throw new Error("delete failed");
    }
  }

  async function handleAddRow(draft: SpecRowDraft) {
    try {
      const row = await addSpecRow(activeSheet.id, {
        name: draft.name,
        howToMeasure: draft.howToMeasure,
        gradeCategory: draft.gradeCategory,
        subKind: draft.subKind,
        toleranceOverride: draft.toleranceOverride,
      });
      setLocalRows((rows) => [...rows, row]);
      router.refresh();
    } catch {
      toast.error("Could not add the measurement.");
      throw new Error("add failed");
    }
  }

  function handleReorder(rowIds: string[]) {
    const previous = localRows;
    const byId = new Map(localRows.map((r) => [r.id, r]));
    const next = rowIds
      .map((id) => byId.get(id))
      .filter((r): r is ProductSpecRow => r !== undefined);
    setLocalRows(next);
    void reorderSpecRows(activeSheet.id, rowIds)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not reorder the measurements.");
        setLocalRows(previous);
      });
  }

  // Profile CRUD — parent owns the optimistic profile list.
  async function handleCreateProfile(payload: GradingProfilePayload) {
    try {
      const created = await createGradingProfile(productId, payload);
      setLocalProfiles((list) => [...list, { ...created, isGlobal: false }]);
      selectProfile(created.id);
      router.refresh();
    } catch {
      toast.error("Could not create the grading profile.");
      throw new Error("create failed");
    }
  }

  async function handleUpdateProfile(
    profileId: string,
    payload: GradingProfilePayload,
  ) {
    try {
      await updateGradingProfile(productId, profileId, payload);
      // Patch the optimistic list too — the sheet must re-grade with the new
      // increments (and a re-opened Edit must show them) before the refresh
      // lands.
      setLocalProfiles((list) =>
        list.map((p) =>
          p.id === profileId
            ? {
                ...p,
                name: payload.name,
                description: payload.description,
                size_run_labels: payload.sizeRunLabels,
                break_size_label: payload.breakSizeLabel,
                base_increments: payload.baseIncrements,
                extended_increments: payload.extendedIncrements,
                tolerances_knit: payload.tolerancesKnit,
                tolerances_woven: payload.tolerancesWoven,
                updated_at: new Date().toISOString(),
              }
            : p,
        ),
      );
      router.refresh();
    } catch {
      toast.error("Could not save the grading profile.");
      throw new Error("update failed");
    }
  }

  async function handleDeleteProfile(profileId: string) {
    try {
      await deleteGradingProfile(productId, profileId);
      setLocalProfiles((list) => list.filter((p) => p.id !== profileId));
      if (localSettings.profileId === profileId) {
        setLocalSettings((s) => ({ ...s, profileId: null }));
      }
      router.refresh();
    } catch {
      toast.error("Could not delete the grading profile.");
      throw new Error("delete failed");
    }
  }

  async function handleDuplicateProfile(profileId: string) {
    const copy = await duplicateGradingProfile(productId, profileId).catch(() => {
      toast.error("Could not duplicate the grading profile.");
      throw new Error("duplicate failed");
    });
    setLocalProfiles((list) => [...list, { ...copy, isGlobal: false }]);
    selectProfile(copy.id);
    router.refresh();
    return copy;
  }

  const toleranceFor = (row: ProductSpecRow) =>
    toleranceForRow(
      row.grade_category,
      row.sub_kind,
      row.tolerance_override,
      toleranceSet,
    );

  const defaultToleranceLabelFor = (row: ProductSpecRow) => {
    const fromProfile =
      toleranceForRow(row.grade_category, row.sub_kind, null, toleranceSet);
    return fromProfile !== null
      ? `±${formatSpecValue(fromProfile)} (profile default)`
      : "e.g. 1.0";
  };

  const sampleHasValues =
    localSettings.mode === "manual"
      ? hasAnyValue
      : localSettings.sampleSize !== null &&
        localRows.some(
          (r) =>
            localValues[r.id]?.[
              normalizeSizeLabel(localSettings.sampleSize ?? "")
            ] !== undefined,
        );

  // ---- Render: settings bar + sheet ------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Settings bar — the collapsed stepper: template · sample · profile · fabric · mode */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium">
          {sheet.template_name ?? "Blank sheet"}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {sheet.unit}
        </Badge>

        {localSettings.mode === "auto" && (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="text-label text-[13px] font-medium">Sample size</span>
            <Select
              value={sampleInRun ? (localSettings.sampleSize ?? undefined) : undefined}
              onValueChange={changeSampleSize}
            >
              <SelectTrigger className="h-8 w-24" aria-label="Sample size">
                <SelectValue placeholder="Pick…" />
              </SelectTrigger>
              <SelectContent>
                {sizeRun.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        )}

        {localSettings.mode === "auto" && (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="text-label text-[13px] font-medium">Profile</span>
            <GradingProfilePicker
              profiles={localProfiles}
              value={localSettings.profileId}
              onSelect={selectProfile}
              onCreate={handleCreateProfile}
              onUpdate={handleUpdateProfile}
              onDelete={handleDeleteProfile}
              onDuplicate={handleDuplicateProfile}
            />
          </span>
        )}

        <span className="flex items-center gap-1">
          <span className="text-label text-[13px] font-medium">Fabric</span>
          {(["knit", "woven"] as const).map((fabric) => (
            <Button
              key={fabric}
              variant={localSettings.fabricType === fabric ? "secondary" : "ghost"}
              size="sm"
              onClick={() => changeFabric(fabric)}
            >
              {fabric === "knit" ? "Knit" : "Woven"}
            </Button>
          ))}
        </span>

        <span className="flex items-center gap-1">
          {(["auto", "manual"] as const).map((m) => (
            <Button
              key={m}
              variant={localSettings.mode === m ? "secondary" : "ghost"}
              size="sm"
              disabled={isWorking}
              onClick={() => {
                if (localSettings.mode !== m) setModeConfirm(m);
              }}
            >
              {m === "auto" ? "Auto-grade" : "Manual"}
            </Button>
          ))}
        </span>

        <span className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Sheet options">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setChangeTemplateOpen(true)}>
                Change template…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setRemoveSheetOpen(true)}
              >
                Remove spec sheet…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      {/* Step guidance until the journey is complete */}
      {localSettings.mode === "auto" && !sampleHasValues && localRows.length > 0 && (
        <p className="text-muted-foreground text-sm">
          <StepChip n={2} active /> Enter your sample&rsquo;s measurements in
          the highlighted <span className="font-medium">{localSettings.sampleSize}</span>{" "}
          column — hover each <span className="font-medium">ⓘ</span> for how to
          measure.
        </p>
      )}
      {localSettings.mode === "auto" && sampleHasValues && !selectedProfile && (
        <p className="text-muted-foreground text-sm">
          <StepChip n={3} active /> Now apply a grading profile — every other
          size fills in instantly and stays live.
        </p>
      )}
      {localSettings.mode === "auto" && !sampleInRun && (
        <p className="text-destructive text-sm">
          Pick which size your sample is — the size range changed and the old
          sample column is gone.
        </p>
      )}

      {/* The Spec Sheet */}
      {localRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <Ruler className="size-6" />
          </span>
          <p className="text-muted-foreground max-w-sm text-sm">
            A blank sheet — add your first measurement to get started.
          </p>
          <SpecRowEditor
            mode="create"
            onSave={handleAddRow}
            trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-3.5" />
                Add measurement
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <SpecSheetTable
            rows={localRows}
            sizeRun={sizeRun}
            sampleSize={localSettings.sampleSize}
            mode={localSettings.mode}
            storedValues={localValues}
            computedValues={computedValues}
            toleranceFor={toleranceFor}
            defaultToleranceLabelFor={defaultToleranceLabelFor}
            onSaveCell={saveCell}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onReorderRows={handleReorder}
          />
          <SpecRowEditor
            mode="create"
            onSave={handleAddRow}
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-3.5" />
                Add measurement
              </Button>
            }
          />
        </>
      )}

      {/* Change template */}
      <Dialog open={changeTemplateOpen} onOpenChange={setChangeTemplateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Change spec template</DialogTitle>
            <DialogDescription>
              Replaces every measurement row with the new template&rsquo;s —
              entered values reset. Your sample size, profile and mode are kept.
            </DialogDescription>
          </DialogHeader>
          <SpecTemplatePicker
            templates={templates}
            disabled={isWorking}
            onPick={(templateId) => {
              startWorking(async () => {
                try {
                  await changeSpecTemplate(sheet.id, templateId);
                  setChangeTemplateOpen(false);
                  router.refresh();
                } catch {
                  toast.error("Could not change the template.");
                }
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Remove sheet */}
      <AlertDialog open={removeSheetOpen} onOpenChange={setRemoveSheetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this spec sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              All measurements and entered values are deleted. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isWorking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                startWorking(async () => {
                  try {
                    await deleteSpecSheet(sheet.id);
                    setRemoveSheetOpen(false);
                    router.refresh();
                  } catch {
                    toast.error("Could not remove the spec sheet.");
                  }
                });
              }}
            >
              {isWorking ? "Removing…" : "Remove sheet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mode switch confirms */}
      <AlertDialog
        open={modeConfirm !== null}
        onOpenChange={(open) => !open && setModeConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {modeConfirm === "manual"
                ? "Switch to manual editing?"
                : "Switch back to auto-grading?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {modeConfirm === "manual"
                ? "The computed values are copied into editable cells so you can adjust any size directly. Auto-grading stops until you switch back."
                : "The sheet recomputes from the sample column and your profile. Manual edits to the other size columns are discarded."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isWorking}
              onClick={(e) => {
                e.preventDefault();
                if (modeConfirm) confirmModeSwitch(modeConfirm);
              }}
            >
              {modeConfirm === "manual" ? "Switch to manual" : "Recompute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Small pieces -------------------------------------------------------------------

function StepChip({ n, active = false }: { n: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-full border text-xs font-semibold",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}

/**
 * Stored values → rowId → NORMALIZED size label → value. On the rare
 * collision (two stored rows whose labels normalize the same, e.g. after a
 * casing-only size-range edit), the most recently updated row wins.
 */
function valuesByRow(
  sheet: ResolvedSpecSheet | null,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const newest: Record<string, Record<string, string>> = {};
  for (const value of sheet?.values ?? []) {
    const key = normalizeSizeLabel(value.size_label);
    const seenAt = newest[value.row_id]?.[key];
    if (seenAt !== undefined && seenAt >= value.updated_at) continue;
    (newest[value.row_id] ??= {})[key] = value.updated_at;
    (result[value.row_id] ??= {})[key] = value.value;
  }
  return result;
}

function settingsOf(sheet: ResolvedSpecSheet | null) {
  return {
    sampleSize: sheet?.sample_size_label ?? null,
    profileId: sheet?.grading_profile_id ?? null,
    fabricType: (sheet?.fabric_type ?? "knit") as SpecFabricType,
    mode: (sheet?.mode ?? "auto") as "auto" | "manual",
  };
}
