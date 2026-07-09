"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Plus,
  Ruler,
} from "lucide-react";
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
import { SaveSheetAsTemplateDialog } from "@/components/spec/save-sheet-as-template-dialog";
import { SpecSheetFlow } from "@/components/spec/spec-sheet-flow";
import { SpecTemplatePicker } from "@/components/spec/spec-template-picker";
import { demographicLabel } from "@/components/spec/spec-demographics";
import {
  createSpecSheet,
  deleteSpecSheet,
  renameSpecSheet,
} from "@/app/(app)/products/[id]/spec-actions";
import type {
  ResolvedGradingProfile,
  ResolvedSpecSheet,
  ResolvedSpecTemplate,
} from "@/types";

/**
 * Size Specifications — a LIST of Spec Sheets for the product (0037). A tech
 * pack can hold a Youth, a Men's and a Women's sheet side by side; each is
 * self-contained (its own demographic, size run, sample sizes and grading) and
 * opens into the stepped flow. This component owns only the list + the create
 * entry; SpecSheetFlow owns everything inside one sheet.
 */
export function SizeSpecificationsSection({
  productId,
  sheets,
  templates,
  profiles,
}: {
  productId: string;
  sheets: ResolvedSpecSheet[];
  templates: ResolvedSpecTemplate[];
  profiles: ResolvedGradingProfile[];
}) {
  const router = useRouter();
  const [isWorking, startWorking] = useTransition();
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);
  // The create flow's first step (Tweak 1): "fork" shows the two explicit
  // choices; "template" opens the grouped template list. null = not creating.
  const [creating, setCreating] = useState<"fork" | "template" | null>(null);
  const [renameTarget, setRenameTarget] = useState<ResolvedSpecSheet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResolvedSpecSheet | null>(null);
  const [templateTarget, setTemplateTarget] = useState<ResolvedSpecSheet | null>(
    null,
  );

  /** Create a sheet (from a template, or blank when templateId is null) and open it. */
  function createSheet(templateId: string | null) {
    startWorking(async () => {
      try {
        const { id } = await createSpecSheet(productId, templateId);
        setCreating(null);
        setOpenSheetId(id);
        router.refresh();
      } catch {
        toast.error("Could not create the spec sheet.");
      }
    });
  }

  const openSheet = openSheetId
    ? sheets.find((s) => s.id === openSheetId) ?? null
    : null;

  // ---- Open sheet → the stepped flow ----------------------------------------

  if (openSheetId) {
    if (!openSheet) {
      // The sheet was just created (or removed) and the refreshed list hasn't
      // landed yet — a brief placeholder rather than snapping back to the list.
      return (
        <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
      );
    }
    return (
      <SpecSheetFlow
        key={openSheet.id}
        sheet={openSheet}
        productId={productId}
        templates={templates}
        profiles={profiles}
        onClose={() => setOpenSheetId(null)}
      />
    );
  }

  // ---- Creating a new sheet → the two-choice fork (Tweak 1) ------------------

  if (creating === "fork") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold">Create a Spec Sheet</h3>
            <p className="text-muted-foreground text-sm">
              Start from a ready-made template, or build your own from scratch.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCreating(null)} disabled={isWorking}>
            Cancel
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={isWorking}
            onClick={() => setCreating("template")}
            className="bg-card hover:ring-brand/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow hover:ring-2 disabled:opacity-60"
          >
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
              <FileText className="size-5" />
            </span>
            <span className="text-sm font-semibold">Choose a Spec Template</span>
            <span className="text-muted-foreground text-xs">
              Pick from ready-made garment templates with the measurements built in.
            </span>
          </button>
          <button
            type="button"
            disabled={isWorking}
            onClick={() => createSheet(null)}
            className="bg-card hover:ring-brand/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow hover:ring-2 disabled:opacity-60"
          >
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
              <FilePlus2 className="size-5" />
            </span>
            <span className="text-sm font-semibold">Build Your Own (Start Blank)</span>
            <span className="text-muted-foreground text-xs">
              Start from an empty sheet and add your own measurements one by one.
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (creating === "template") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold">Choose a Spec Template</h3>
            <p className="text-muted-foreground text-sm">
              Pick a garment template to start from.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCreating("fork")} disabled={isWorking}>
            Back
          </Button>
        </div>
        <SpecTemplatePicker
          templates={templates}
          disabled={isWorking}
          showBlankOption={false}
          onPick={(templateId) => createSheet(templateId)}
        />
      </div>
    );
  }

  // ---- Empty state ----------------------------------------------------------

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Ruler className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">No Spec Sheets yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            A Spec Sheet holds the graded measurements for one size run, add a
            Youth, Men&rsquo;s and Women&rsquo;s version if you need them.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating("fork")}>
          <Plus className="size-3.5" />
          Create your first Spec Sheet
        </Button>
      </div>
    );
  }

  // ---- The list -------------------------------------------------------------

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sheets.map((sheet) => (
          <SheetCard
            key={sheet.id}
            sheet={sheet}
            profiles={profiles}
            onOpen={() => setOpenSheetId(sheet.id)}
            onRename={() => setRenameTarget(sheet)}
            onSaveAsTemplate={() => setTemplateTarget(sheet)}
            onDelete={() => setDeleteTarget(sheet)}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating("fork")}>
        <Plus className="size-3.5" />
        Add Another Size Spec
      </Button>

      {/* Rename */}
      <RenameDialog
        sheet={renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onDone={() => {
          setRenameTarget(null);
          router.refresh();
        }}
      />

      {/* Save as template */}
      <SaveSheetAsTemplateDialog
        sheet={templateTarget}
        productId={productId}
        templates={templates}
        onOpenChange={(open) => !open && setTemplateTarget(null)}
      />

      {/* Delete */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this Spec Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              All measurements and entered values for{" "}
              <span className="font-medium">
                {deleteTarget?.name ?? deleteTarget?.template_name ?? "this sheet"}
              </span>{" "}
              are deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isWorking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const target = deleteTarget;
                if (!target) return;
                startWorking(async () => {
                  try {
                    await deleteSpecSheet(target.id);
                    setDeleteTarget(null);
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
    </div>
  );
}

// ---- Sheet card ---------------------------------------------------------------

function SheetCard({
  sheet,
  profiles,
  onOpen,
  onRename,
  onSaveAsTemplate,
  onDelete,
}: {
  sheet: ResolvedSpecSheet;
  profiles: ResolvedGradingProfile[];
  onOpen: () => void;
  onRename: () => void;
  onSaveAsTemplate: () => void;
  onDelete: () => void;
}) {
  const name = sheet.name ?? sheet.template_name ?? "Untitled sheet";
  const run = sheet.size_run ?? [];
  const samples = sheet.sample_sizes ?? [];
  const grading =
    sheet.mode === "manual"
      ? "Manual"
      : (profiles.find((p) => p.id === sheet.grading_profile_id)?.name ??
        "No profile yet");

  const parts = [
    demographicLabel(sheet.demographic),
    run.length > 0 ? run.join(", ") : "No sizes yet",
    samples.length > 0 ? `Sample ${samples.join(", ")}` : "No sample yet",
    grading,
  ];

  return (
    <div className="bg-card hover:border-brand/40 group flex items-center gap-3 rounded-lg border p-3 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
      >
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
          <Ruler className="size-4" />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            {sheet.is_complete ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Check className="size-2.5" />
                Complete
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                In progress
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {parts.join(" · ")}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Sheet options">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>Rename…</DropdownMenuItem>
          <DropdownMenuItem onSelect={onSaveAsTemplate}>
            Save as template…
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />
    </div>
  );
}

// ---- Rename dialog ------------------------------------------------------------

function RenameDialog({
  sheet,
  onOpenChange,
  onDone,
}: {
  sheet: ResolvedSpecSheet | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Reseed the field each time a different sheet's dialog opens.
  const key = sheet?.id ?? null;
  if (key !== seededFor) {
    setSeededFor(key);
    setName(sheet?.name ?? sheet?.template_name ?? "");
  }

  async function handleSave() {
    if (!sheet || name.trim().length === 0) return;
    setBusy(true);
    try {
      await renameSpecSheet(sheet.id, name.trim());
      onDone();
    } catch {
      toast.error("Could not rename the sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={sheet !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename Spec Sheet</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Men's Tee"
          maxLength={80}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
          }}
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || name.trim().length === 0}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
