"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutTemplate, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createTemplate,
  deleteTemplate,
  renameTemplate,
} from "@/app/(app)/products/template-actions";
import {
  SectionChecklist,
  anySectionSelected,
} from "@/components/templates/section-checklist";
import {
  TemplateContentIndicators,
  templateMetaLine,
} from "@/components/templates/template-card-info";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FULL_SECTION_MASK, type CopySectionMask } from "@/lib/product-copy";
import type { TemplateSummary } from "@/lib/templates";

type PickerProduct = { id: string; name: string };

/**
 * Settings → Templates: the management home. Template cards (name, brand,
 * contents, created date) with Open / Rename / Delete, and the "New Template"
 * flow — Start Blank (name → straight into the full product editor) or From
 * Existing Product (picker → section checklist → name).
 */
export function TemplatesTab({
  templates,
  products,
}: {
  templates: TemplateSummary[];
  products: PickerProduct[];
}) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState<TemplateSummary | null>(null);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Templates</CardTitle>
            <CardDescription>
              Reusable starting points for new tech packs. A template opens in
              the full product editor; products created from it are complete,
              independent copies.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus />
            New Template
          </Button>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
              <LayoutTemplate className="size-8 opacity-40" />
              <p>
                No templates yet. Start blank, clone an existing product here,
                or use &lsquo;Save as template&rsquo; on any product page.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onRename={() => setRenaming(template)}
                  onDelete={() => setDeleting(template)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NewTemplateDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        products={products}
      />

      {renaming && (
        <RenameTemplateDialog
          template={renaming}
          onOpenChange={(open) => !open && setRenaming(null)}
        />
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &lsquo;{deleting?.name}&rsquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Products created from this template are complete copies and are
              NOT affected — only the template itself is deleted. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const target = deleting;
                if (!target) return;
                deleteTemplate(target.id)
                  .then(() => {
                    toast.success("Template deleted.");
                    router.refresh();
                  })
                  .catch(() => toast.error("Could not delete the template."));
              }}
            >
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateCard({
  template,
  onRename,
  onDelete,
}: {
  template: TemplateSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-card shadow-card group flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/products/${template.id}`}
            className="hover:text-primary line-clamp-1 font-medium transition-colors"
          >
            {template.name}
          </Link>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {templateMetaLine(template)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Template actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/products/${template.id}`}>Open</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TemplateContentIndicators template={template} />
    </div>
  );
}

function RenameTemplateDialog({
  template,
  onOpenChange,
}: {
  template: TemplateSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [isPending, startTransition] = useTransition();

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await renameTemplate(template.id, trimmed);
        toast.success("Template renamed.");
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Could not rename the template.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
        />
        <DialogFooter>
          <Button onClick={handleRename} disabled={isPending || !name.trim()}>
            {isPending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: PickerProduct[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "blank" | "clone">("choose");
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [mask, setMask] = useState<CopySectionMask>(FULL_SECTION_MASK);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setMode("choose");
      setName("");
      setSourceId("");
      setMask(FULL_SECTION_MASK);
    }
  }

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const { id, warnings } = await createTemplate({
          name: trimmed,
          sourceProductId: mode === "clone" ? sourceId : undefined,
          sections: mode === "clone" ? mask : undefined,
        });
        for (const warning of warnings) toast.warning(warning);
        toast.success("Template created.");
        onOpenChange(false);
        if (mode === "blank") {
          // Straight into the full product editor to build it up.
          router.push(`/products/${id}`);
        } else {
          router.refresh();
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not create template.",
        );
      }
    });
  }

  const createDisabled =
    isPending ||
    !name.trim() ||
    (mode === "clone" && (!sourceId || !anySectionSelected(mask)));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Template</DialogTitle>
          <DialogDescription>
            {mode === "choose"
              ? "Start from nothing, or clone an existing product."
              : mode === "blank"
                ? "Name it — it opens in the full product editor to build up."
                : "Pick a product and tick which parts the template keeps."}
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode("blank")}
              className="hover:border-primary hover:bg-accent flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors"
            >
              <span className="text-sm font-medium">Start Blank</span>
              <span className="text-muted-foreground text-xs">
                An empty template you build in the editor.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("clone")}
              disabled={products.length === 0}
              className="hover:border-primary hover:bg-accent flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-sm font-medium">From Existing Product</span>
              <span className="text-muted-foreground text-xs">
                {products.length === 0
                  ? "No products to clone yet."
                  : "A deep copy of a product you pick."}
              </span>
            </button>
          </div>
        )}

        {mode === "clone" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Source product</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "clone" && (
          <SectionChecklist value={mask} onChange={setMask} />
        )}

        {mode !== "choose" && (
          <div className="space-y-1.5">
            <Label htmlFor="new-template-name" className="text-xs">
              Template name
            </Label>
            <Input
              id="new-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team Jersey base"
              maxLength={120}
            />
          </div>
        )}

        {mode !== "choose" && (
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode("choose")}
              disabled={isPending}
            >
              Back
            </Button>
            <Button onClick={handleCreate} disabled={createDisabled}>
              {isPending ? "Creating…" : "Create template"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
