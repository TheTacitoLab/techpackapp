"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createTemplate } from "@/app/(app)/products/template-actions";
import {
  SectionChecklist,
  anySectionSelected,
} from "@/components/templates/section-checklist";
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
import { FULL_SECTION_MASK, type CopySectionMask } from "@/lib/product-copy";

/**
 * "Save as template" — reached from the product header's overflow menu (users
 * decide something is template-worthy while looking at it) and from Settings'
 * "From Existing Product" path. Section-masked deep copy: the user ticks
 * which parts the template keeps.
 */
export function SaveAsTemplateDialog({
  productId,
  productName,
  open,
  onOpenChange,
}: {
  productId: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(`${productName} template`);
  const [mask, setMask] = useState<CopySectionMask>(FULL_SECTION_MASK);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setName(`${productName} template`);
      setMask(FULL_SECTION_MASK);
    }
  }

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const { warnings } = await createTemplate({
          name: trimmed,
          sourceProductId: productId,
          sections: mask,
        });
        for (const warning of warnings) toast.warning(warning);
        toast.success("Template created. Find it in Settings → Templates.");
        onOpenChange(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not create template.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            A deep copy of &lsquo;{productName}&rsquo; — the original and the
            template stay fully independent.
          </DialogDescription>
        </DialogHeader>

        <SectionChecklist value={mask} onChange={setMask} />

        <div className="space-y-1.5">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>

        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={
              isPending || !name.trim() || !anySectionSelected(mask)
            }
          >
            {isPending ? "Creating…" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
