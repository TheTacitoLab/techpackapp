"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, Plus, Ruler, Sparkles } from "lucide-react";
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
import { GradingProfilePicker } from "@/components/spec/grading-profile-picker";
import { SpecRowEditor, type SpecRowDraft } from "@/components/spec/spec-row-editor";
import { SpecSampleStep } from "@/components/spec/spec-sample-step";
import { SpecSheetTable } from "@/components/spec/spec-sheet-table";
import { SpecSizeRunStep } from "@/components/spec/spec-size-run-step";
import { SpecTemplatePicker } from "@/components/spec/spec-template-picker";
import {
  formatSpecValue,
  gradableRow,
  gradingRulesFromProfile,
  storedValuesByRow,
  toleranceSetForFabric,
} from "@/components/spec/spec-data";
import { demographicLabel, seededProfileNameFor } from "@/components/spec/spec-demographics";
import {
  GradingProfileDialog,
  type GradingProfileDraft,
  type GradingProfilePayload,
} from "@/components/spec/grading-profile-dialog";
import {
  detectGrade,
  findSizeIndex,
  gradeSheet,
  normalizeSizeLabel,
  toleranceForRow,
} from "@/lib/spec-grading";
import {
  addSpecRow,
  changeSpecTemplate,
  createGradingProfile,
  deleteGradingProfile,
  deleteSpecRow,
  duplicateGradingProfile,
  reorderSpecRows,
  saveSpecValue,
  setSpecComplete,
  setSpecFabricType,
  setSpecGradingProfile,
  switchSpecSheetMode,
  updateGradingProfile,
  updateSpecRow,
} from "@/app/(app)/products/[id]/spec-actions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type {
  ProductSpecRow,
  ResolvedGradingProfile,
  ResolvedSpecSheet,
  ResolvedSpecTemplate,
  SpecFabricType,
} from "@/types";

/**
 * The stepped Spec Sheet flow — one sheet, one decision at a time, mirroring
 * Product Setup's stepper feel:
 *
 *   1 Template → 2 Size range → 3 Sample size(s) → 4 Measurements →
 *   5 Grading → (done)
 *
 * Steps 1–3 are compact guided forms (template picker, demographic + ticked
 * run, 1–2 sample sizes). Step 4 shows the live sheet with the sample column(s)
 * editable. Step 5 chooses grading (Manual / new profile / pick a profile /
 * Route B: auto-detect the increments from two+ entered sizes, reviewed in the
 * profile builder before anything is created or applied).
 * Once grading is set the sheet computes and this lands on the done view, where
 * every non-sample column fills live from the profile (never persisted — the
 * stored sample column(s) + profile are the single source of truth). Completed
 * sheets re-open here and any step stays changeable.
 *
 * Per-sheet optimistic state (cells, rows, settings, profile list) lives here;
 * the section above owns only the LIST of sheets. Hot paths patch local state
 * and run the action in the background; structural changes await inside a
 * transition.
 */

type Settings = {
  sampleSizes: string[];
  profileId: string | null;
  fabricType: SpecFabricType;
  mode: "auto" | "manual";
};

const STEP_LABELS = ["Template", "Size range", "Sample", "Measurements", "Grading"];

export function SpecSheetFlow({
  sheet,
  productId,
  templates,
  profiles,
  onClose,
}: {
  sheet: ResolvedSpecSheet;
  productId: string;
  templates: ResolvedSpecTemplate[];
  profiles: ResolvedGradingProfile[];
  onClose: () => void;
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

  const [localRows, setLocalRows] = useState<ProductSpecRow[]>(sheet.rows);
  const [localValues, setLocalValues] = useState<Record<string, Record<string, number>>>(
    () => storedValuesByRow(sheet.values ?? []),
  );
  const [localSettings, setLocalSettings] = useState<Settings>(() => settingsOf(sheet));
  const [syncedSheet, setSyncedSheet] = useState(sheet);
  const [pendingValueSaves, setPendingValueSaves] = useState(0);
  const [step, setStep] = useState<number>(() => initialStep(sheet));
  if (sheet !== syncedSheet) {
    setSyncedSheet(sheet);
    setLocalRows(sheet.rows);
    if (pendingValueSaves === 0) setLocalValues(storedValuesByRow(sheet.values ?? []));
    setLocalSettings(settingsOf(sheet));
  }

  const [changeTemplateOpen, setChangeTemplateOpen] = useState(false);
  // A pending "switch to auto-grade" action, held while we confirm that manual
  // edits to the non-sample columns will be discarded (finding: no confirm
  // before the lossy manual→auto prune).
  const [pendingAuto, setPendingAuto] = useState<(() => void) | null>(null);
  // Route B: the detected-profile draft under review. Present = dialog open;
  // the seq number keys the dialog so a re-detect remounts it with the fresh
  // draft (its form seeds once per mount).
  const [routeBDraft, setRouteBDraft] = useState<{
    draft: GradingProfileDraft;
    seq: number;
  } | null>(null);
  const routeBSeq = useRef(0);

  // ---- Derived --------------------------------------------------------------

  const sizeRun = useMemo(() => sheet.size_run ?? [], [sheet.size_run]);
  const sampleSizes = localSettings.sampleSizes;
  const anchor = sampleSizes[0] ?? null;

  const selectedProfile =
    localProfiles.find((p) => p.id === localSettings.profileId) ?? null;

  const anchorInRun = anchor !== null && findSizeIndex(sizeRun, anchor) !== -1;

  const computedValues = useMemo(() => {
    if (
      localSettings.mode !== "auto" ||
      !selectedProfile ||
      !anchor ||
      !anchorInRun
    ) {
      return null;
    }
    const anchorKey = normalizeSizeLabel(anchor);
    const sampleValues: Record<string, number | null> = {};
    for (const r of localRows) {
      sampleValues[r.id] = localValues[r.id]?.[anchorKey] ?? null;
    }
    return gradeSheet(
      localRows.map(gradableRow),
      anchor,
      sampleValues,
      gradingRulesFromProfile(selectedProfile),
      sizeRun,
    );
  }, [localSettings.mode, selectedProfile, anchor, anchorInRun, localRows, localValues, sizeRun]);

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
  const anchorHasValues =
    anchor !== null &&
    localRows.some(
      (r) => localValues[r.id]?.[normalizeSizeLabel(anchor)] !== undefined,
    );
  const gradingReady =
    localSettings.mode === "manual" || (!!anchor && !!localSettings.profileId);
  const canComplete = gradingReady && (localSettings.mode === "manual" ? hasAnyValue : anchorHasValues);

  // In manual mode the non-sample columns may hold hand-entered values that a
  // switch to auto-grade would prune — used to gate the confirm below.
  const sampleKeySet = new Set(sampleSizes.map((s) => normalizeSizeLabel(s)));
  const hasNonSampleValues = Object.values(localValues).some((byLabel) =>
    Object.keys(byLabel).some((k) => !sampleKeySet.has(k)),
  );

  // Route B needs two+ sizes with entered values — the run labels (in run
  // order) that hold a value for at least one row.
  const enteredSizeLabels = useMemo(
    () =>
      sizeRun.filter((label) => {
        const key = normalizeSizeLabel(label);
        return localRows.some((r) => localValues[r.id]?.[key] !== undefined);
      }),
    [sizeRun, localRows, localValues],
  );
  const canDetect = enteredSizeLabels.length >= 2;

  /**
   * Run an action that switches the sheet to auto-grade. If manual edits to the
   * non-sample columns would be discarded, confirm first; otherwise run it now.
   */
  function guardAuto(run: () => void) {
    if (localSettings.mode === "manual" && hasNonSampleValues) {
      setPendingAuto(() => run);
    } else {
      run();
    }
  }

  // Which steps the user may jump to (prerequisites met).
  const reachable = (n: number): boolean => {
    if (n <= 2) return true;
    if (n === 3) return sizeRun.length > 0;
    if (n === 4) return sampleSizes.length > 0;
    if (n === 5) return sampleSizes.length > 0 && localRows.length > 0;
    return false;
  };

  // ---- Cell + row handlers (ported; sample column(s) are the editable set) ----

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
      .finally(() => setPendingValueSaves((n) => n - 1));
  }

  function changeFabric(fabricType: SpecFabricType) {
    const previous = localSettings.fabricType;
    if (previous === fabricType) return;
    setLocalSettings((s) => ({ ...s, fabricType }));
    void setSpecFabricType(sheet.id, fabricType)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not change the fabric type.");
        setLocalSettings((s) => ({ ...s, fabricType: previous }));
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
      const row = await addSpecRow(sheet.id, {
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
    void reorderSpecRows(sheet.id, rowIds)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not reorder the measurements.");
        setLocalRows(previous);
      });
  }

  // ---- Grading choices (step 5) ---------------------------------------------

  function chooseManual() {
    startWorking(async () => {
      try {
        if (localSettings.mode !== "manual") {
          // Snapshot what's on screen (computed grid, or the sample columns if
          // nothing's graded yet) into editable stored cells.
          const entries: { rowId: string; sizeLabel: string; value: number }[] = [];
          for (const r of localRows) {
            for (const label of sizeRun) {
              const value =
                localValues[r.id]?.[normalizeSizeLabel(label)] ??
                computedValues?.[r.id]?.[label] ??
                null;
              if (value !== null) entries.push({ rowId: r.id, sizeLabel: label, value });
            }
          }
          await switchSpecSheetMode(sheet.id, "manual", entries);
        }
        setLocalSettings((s) => ({ ...s, mode: "manual" }));
        setStep(6);
        router.refresh();
      } catch {
        toast.error("Could not switch to manual editing.");
      }
    });
  }

  function chooseProfile(profileId: string) {
    startWorking(async () => {
      try {
        if (localSettings.mode === "manual") {
          await switchSpecSheetMode(sheet.id, "auto");
        }
        await setSpecGradingProfile(sheet.id, profileId);
        setLocalSettings((s) => ({ ...s, mode: "auto", profileId }));
        setStep(6);
        router.refresh();
      } catch {
        toast.error("Could not apply the grading profile.");
      }
    });
  }

  /**
   * Route B — detect the grade from the entered sizes and open the profile
   * builder pre-filled with the result. Nothing is created or applied until
   * the user reviews and saves there (the save path is the normal
   * handleCreateProfile: create the custom profile, then apply it).
   */
  function handleDetectGrade() {
    const detected = detectGrade(
      localRows.map((r) => ({
        ...gradableRow(r),
        values: localValues[r.id] ?? {},
      })),
      enteredSizeLabels,
      sizeRun,
    );
    if (!detected) {
      toast.error(
        "Couldn't detect a grade — a graded measurement needs values in at least two sizes.",
      );
      return;
    }
    const sheetName =
      sheet.name ?? sheet.template_name ?? demographicLabel(sheet.demographic);
    routeBSeq.current += 1;
    setRouteBDraft({
      seq: routeBSeq.current,
      draft: {
        name: `${sheetName} detected grade`.slice(0, 80),
        description: [
          `Auto-detected from entered sizes ${enteredSizeLabels.join(", ")}.`,
          ...detected.notes,
        ]
          .join(" ")
          .slice(0, 400),
        breakSizeLabel: detected.breakSizeLabel,
        baseIncrements: detected.baseIncrements,
        extendedIncrements: detected.extendedIncrements,
        flaggedKeys: detected.flaggedKeys,
      },
    });
  }

  // Profile CRUD — this flow owns the optimistic profile list.
  async function handleCreateProfile(payload: GradingProfilePayload) {
    try {
      const created = await createGradingProfile(productId, payload);
      setLocalProfiles((list) => [...list, { ...created, isGlobal: false }]);
      guardAuto(() => chooseProfile(created.id));
    } catch {
      toast.error("Could not create the grading profile.");
      throw new Error("create failed");
    }
  }

  async function handleUpdateProfile(profileId: string, payload: GradingProfilePayload) {
    try {
      await updateGradingProfile(productId, profileId, payload);
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
    router.refresh();
    return copy;
  }

  function markComplete(next: boolean) {
    startWorking(async () => {
      try {
        await setSpecComplete(sheet.id, next);
        router.refresh();
        if (next) toast.success("Spec Sheet marked complete.");
      } catch (error) {
        toast.error(
          error instanceof Error && error.message.includes("Finish")
            ? "Finish the sheet before marking it complete."
            : "Could not update the sheet.",
        );
      }
    });
  }

  // ---- Tolerance helpers -----------------------------------------------------

  const toleranceFor = (row: ProductSpecRow) =>
    toleranceForRow(row.grade_category, row.sub_kind, row.tolerance_override, toleranceSet);
  const defaultToleranceLabelFor = (row: ProductSpecRow) => {
    const fromProfile = toleranceForRow(row.grade_category, row.sub_kind, null, toleranceSet);
    return fromProfile !== null
      ? `±${formatSpecValue(fromProfile)} (profile default)`
      : "e.g. 1.0";
  };

  // ---- Render ----------------------------------------------------------------

  const displayName = sheet.name ?? sheet.template_name ?? "Untitled sheet";
  const recommendedProfile = seededProfileNameFor(sheet.demographic);

  return (
    <div className="space-y-5">
      {/* Header: back to list + name + stepper */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={onClose}>
            <ChevronLeft className="size-4" />
            All Spec Sheets
          </Button>
          <span className="text-sm font-medium">{displayName}</span>
          {sheet.is_complete && (
            <Badge variant="secondary" className="text-[10px]">
              Complete
            </Badge>
          )}
        </div>
        <StepNav
          step={step}
          onStep={setStep}
          reachable={reachable}
          done={sheet.is_complete}
        />
      </div>

      {/* Step body */}
      {step === 1 && (
        <StepShell
          title="Choose or create the template"
          hint="Start from a garment template, or build your own measurement list."
        >
          <div className="space-y-4">
            <div className="bg-muted flex flex-wrap items-center gap-3 rounded-lg p-3">
              <span className="text-sm">
                Current: <span className="font-medium">{sheet.template_name ?? "Blank sheet"}</span>
                <span className="text-muted-foreground"> · {localRows.length} measurements</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setChangeTemplateOpen(true)}
              >
                Choose a different template
              </Button>
            </div>
            <StepFooter
              onBack={onClose}
              backLabel="Cancel"
              onNext={() => setStep(2)}
              nextDisabled={false}
            />
          </div>
        </StepShell>
      )}

      {step === 2 && (
        <StepShell
          title="Choose the size range"
          hint="Pick who it's for, then tick which sizes are in this spec."
        >
          <SpecSizeRunStep sheet={sheet} onBack={() => setStep(1)} onSaved={() => setStep(3)} />
        </StepShell>
      )}

      {step === 3 && (
        <StepShell
          title="Select the sample size(s)"
          hint="The size(s) you physically measured — distinct from the full run."
        >
          <SpecSampleStep sheet={sheet} onBack={() => setStep(2)} onSaved={() => setStep(4)} />
        </StepShell>
      )}

      {(step === 4 || step === 6) && (
        <StepShell
          title={step === 4 ? "Enter your sample measurements" : "Your Spec Sheet"}
          hint={
            step === 4
              ? `Type the measurements you took off your ${sampleSizes.join(" & ")} sample${sampleSizes.length > 1 ? "s" : ""} into the highlighted column${sampleSizes.length > 1 ? "s" : ""}. Hover each ⓘ for how to measure.`
              : localSettings.mode === "manual"
                ? "Every cell is editable — fill in the whole sheet."
                : "Every other size fills in live from your profile. Adjust the sample or profile and it re-grades instantly."
          }
        >
          <div className="space-y-4">
            {step === 6 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <SummaryChip label="For">{demographicLabel(sheet.demographic)}</SummaryChip>
                <SummaryChip label="Run">{sizeRun.join(", ") || "—"}</SummaryChip>
                <SummaryChip label="Sample">{sampleSizes.join(", ") || "—"}</SummaryChip>
                <SummaryChip label="Grading">
                  {localSettings.mode === "manual"
                    ? "Manual"
                    : (selectedProfile?.name ?? "—")}
                </SummaryChip>
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
              </div>
            )}

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
              <div className="overflow-x-auto">
                <SpecSheetTable
                  rows={localRows}
                  sizeRun={sizeRun}
                  sampleSizes={sampleSizes}
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
              </div>
            )}

            {localRows.length > 0 && (
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
            )}

            {step === 4 ? (
              <StepFooter
                onBack={() => setStep(3)}
                onNext={() => setStep(5)}
                nextLabel="Continue to grading"
                nextDisabled={localRows.length === 0}
              />
            ) : (
              <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <Button variant="ghost" onClick={() => setStep(5)} disabled={isWorking}>
                  Change grading
                </Button>
                <span className="flex items-center gap-2">
                  <Button variant="outline" onClick={onClose} disabled={isWorking}>
                    Add another Size Spec
                  </Button>
                  {sheet.is_complete ? (
                    <Button
                      variant="secondary"
                      onClick={() => markComplete(false)}
                      disabled={isWorking}
                    >
                      Re-open
                    </Button>
                  ) : (
                    <Button
                      onClick={() => markComplete(true)}
                      disabled={isWorking || !canComplete}
                      title={canComplete ? undefined : "Enter your sample measurements first."}
                    >
                      Mark complete
                    </Button>
                  )}
                </span>
              </div>
            )}
          </div>
        </StepShell>
      )}

      {step === 5 && (
        <StepShell
          title="Choose grading"
          hint="How should the other sizes be filled in?"
        >
          <div className="space-y-3">
            {/* A — manual */}
            <GradingOption
              title="Complete it manually"
              body="You fill in every size yourself. Best for one-offs or unusual grading."
            >
              <Button variant="outline" size="sm" onClick={chooseManual} disabled={isWorking}>
                Fill in manually
              </Button>
            </GradingOption>

            {/* B/C — auto-grade from a profile */}
            <GradingOption
              title="Auto-grade from a Grading Profile"
              body={
                recommendedProfile
                  ? `Every other size grades from your sample. Recommended for ${demographicLabel(sheet.demographic)}: the “${recommendedProfile}” standard.`
                  : "Every other size grades from your sample using the profile's per-size increments."
              }
            >
              <div className="space-y-3">
                <GradingProfilePicker
                  profiles={localProfiles}
                  value={localSettings.profileId}
                  disabled={isWorking}
                  onSelect={(id) => guardAuto(() => chooseProfile(id))}
                  onCreate={handleCreateProfile}
                  onUpdate={handleUpdateProfile}
                  onDelete={handleDeleteProfile}
                  onDuplicate={handleDuplicateProfile}
                />
                {/* Route B — detect the increments from the entered sizes,
                    then review them in the profile builder before anything
                    is created or applied. */}
                <div className="border-border/60 flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2">
                  <Sparkles className="text-muted-foreground size-4 shrink-0" />
                  <span className="text-muted-foreground text-xs">
                    Auto-calculate the grade from my sample sizes
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={!canDetect || isWorking}
                    onClick={handleDetectGrade}
                  >
                    Detect grade
                  </Button>
                </div>
                {!canDetect && (
                  <p className="text-muted-foreground text-xs">
                    Enter measurements in a second size to auto-detect the
                    grade.
                  </p>
                )}
              </div>
            </GradingOption>

            <StepFooter onBack={() => setStep(4)} backLabel="Back" />
          </div>
        </StepShell>
      )}

      {/* Change template dialog */}
      <Dialog open={changeTemplateOpen} onOpenChange={setChangeTemplateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose spec template</DialogTitle>
            <DialogDescription>
              Replaces every measurement row with the new template&rsquo;s — entered
              values reset. Your size range, samples and grading are kept.
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

      {/* Route B review — the detected increments in the normal profile
          builder. Saving runs handleCreateProfile: the custom profile is
          created and applied (through the same manual→auto guard) only after
          the user has seen and tuned the numbers. Keyed by seq so a re-detect
          reseeds the form. */}
      {routeBDraft && (
        <GradingProfileDialog
          key={routeBDraft.seq}
          open
          onOpenChange={(open) => {
            if (!open) setRouteBDraft(null);
          }}
          mode="create"
          profile={null}
          draft={routeBDraft.draft}
          onSave={handleCreateProfile}
        />
      )}

      {/* Confirm the lossy manual → auto-grade switch */}
      <AlertDialog
        open={pendingAuto !== null}
        onOpenChange={(open) => !open && setPendingAuto(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to auto-grading?</AlertDialogTitle>
            <AlertDialogDescription>
              Auto-grading fills every size from your sample and the profile — your
              manual edits to the other size columns will be discarded. The sample
              column(s) are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Keep manual</AlertDialogCancel>
            <AlertDialogAction
              disabled={isWorking}
              onClick={(e) => {
                e.preventDefault();
                const run = pendingAuto;
                setPendingAuto(null);
                run?.();
              }}
            >
              Switch and auto-grade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Small pieces -------------------------------------------------------------

function StepNav({
  step,
  onStep,
  reachable,
  done,
}: {
  step: number;
  onStep: (n: number) => void;
  reachable: (n: number) => boolean;
  done: boolean;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const active = step === n || (step === 6 && n === 5);
        const complete = done || step > n || (step === 6 && n <= 5);
        const canGo = reachable(n);
        return (
          <li key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!canGo}
              onClick={() => canGo && onStep(n)}
              className={cn(
                "flex items-center gap-2 rounded-full px-2 py-1 text-[13px] transition-colors",
                canGo ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-50",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full border text-xs font-semibold",
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : complete
                      ? "border-brand text-brand"
                      : "border-border text-muted-foreground",
                )}
              >
                {n}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
            {n < STEP_LABELS.length && (
              <span aria-hidden className="bg-border h-px w-4 shrink-0" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function StepFooter({
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: {
  onBack: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <Button variant="ghost" onClick={onBack}>
        {backLabel}
      </Button>
      {onNext && (
        <Button onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      )}
    </div>
  );
}

function GradingOption({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="space-y-0.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-muted-foreground text-xs">{body}</p>
      </div>
      {children}
    </div>
  );
}

function SummaryChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-label text-[13px] font-medium">{label}</span>
      <span className="text-foreground text-sm">{children}</span>
    </span>
  );
}

// ---- Sheet → local state helpers ---------------------------------------------

function settingsOf(sheet: ResolvedSpecSheet): Settings {
  return {
    sampleSizes: sheet.sample_sizes ?? [],
    profileId: sheet.grading_profile_id ?? null,
    fabricType: (sheet.fabric_type ?? "knit") as SpecFabricType,
    mode: (sheet.mode ?? "auto") as "auto" | "manual",
  };
}

/** Where to drop the user when a sheet opens — the first unfinished step. */
function initialStep(sheet: ResolvedSpecSheet): number {
  if (sheet.is_complete) return 6;
  if ((sheet.size_run ?? []).length === 0) return 2;
  if ((sheet.sample_sizes ?? []).length === 0) return 3;
  // Manual sheets fill any column, so ANY stored value means they're past the
  // "enter your sample" step — the sample column itself may legitimately be
  // blank. (Auto sheets need a value in the sample column to grade from.)
  if (sheet.mode === "manual") {
    return (sheet.values ?? []).length > 0 ? 6 : 4;
  }
  const sampleKeys = new Set((sheet.sample_sizes ?? []).map((s) => normalizeSizeLabel(s)));
  const hasSample = (sheet.values ?? []).some((v) =>
    sampleKeys.has(normalizeSizeLabel(v.size_label)),
  );
  if (!hasSample) return 4;
  const gradingSet = !!sheet.sample_size_label && !!sheet.grading_profile_id;
  if (!gradingSet) return 5;
  return 6;
}
