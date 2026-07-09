"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "@/components/spec/spec-template-picker";
import { saveSheetAsTemplate } from "@/app/(app)/products/[id]/spec-actions";
import type {
  ResolvedSpecSheet,
  ResolvedSpecTemplate,
  SpecTemplateCategory,
} from "@/types";

/**
 * "Save as template" — capture an open (or listed) Spec Sheet's row structure
 * as a new workspace spec template. Name seeds from the sheet, category from
 * the template the sheet started from (when known). Values never copy; the
 * action owns that rule — this dialog is just name + category.
 *
 * Same open-signal idiom as the section's RenameDialog: `sheet` non-null means
 * open, and the fields reseed whenever a different sheet's dialog opens.
 */
export function SaveSheetAsTemplateDialog({
  sheet,
  productId,
  templates,
  onOpenChange,
}: {
  sheet: ResolvedSpecSheet | null;
  productId: string;
  templates: ResolvedSpecTemplate[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SpecTemplateCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Reseed the fields each time a different sheet's dialog opens.
  const key = sheet?.id ?? null;
  if (key !== seededFor) {
    setSeededFor(key);
    setName(sheet?.name ?? sheet?.template_name ?? "");
    setCategory(
      templates.find((t) => t.id === sheet?.template_id)?.category ?? null,
    );
  }

  const hasRows = (sheet?.rows.length ?? 0) > 0;

  async function handleSave() {
    // `busy` guards the Enter-key path too — saveSheetAsTemplate is a
    // non-idempotent insert, so a held Enter must not fire it twice.
    if (busy || !sheet || !hasRows || !category || name.trim().length === 0) {
      return;
    }
    setBusy(true);
    try {
      await saveSheetAsTemplate(productId, sheet.id, name.trim(), category);
      toast.success("Template saved — it's now in the Spec Template picker.");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not save the template.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={sheet !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as Spec Template</DialogTitle>
          <DialogDescription>
            The sheet&apos;s measurements (codes, names, how-to-measure) become
            a reusable workspace template. Entered values don&apos;t copy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sat-name" className="text-xs">
              Template name
            </Label>
            <Input
              id="sat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Our men's tee block"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select
              value={category ?? undefined}
              onValueChange={(v) => setCategory(v as SpecTemplateCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category…" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!hasRows && (
            <p className="text-muted-foreground text-xs">
              This sheet has no measurement rows yet — add rows before saving
              it as a template.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              busy || !hasRows || !category || name.trim().length === 0
            }
          >
            {busy ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
