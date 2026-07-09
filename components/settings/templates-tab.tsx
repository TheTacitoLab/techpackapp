"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, FilePlus2, MoreHorizontal, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  const [isDeleting, startDelete] = useTransition();

  function handleDelete() {
    const target = deleting;
    if (!target) return;
    startDelete(async () => {
      try {
        await deleteTemplate(target.id);
        toast.success("Template deleted.");
        setDeleting(null);
        router.refresh();
      } catch {
        toast.error("Could not delete the template.");
      }
    });
  }

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
            <p className="text-muted-foreground text-sm">
              No templates yet. Start blank, clone an existing product here, or
              use &lsquo;Save as template&rsquo; on any product page.
            </p>
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
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete template"}
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
  // Same card chrome as ProductCard: shadow-card (no border), hover shadow,
  // action menu revealed on hover.
  return (
    <div className="bg-card shadow-card hover:shadow-card-hover group flex flex-col gap-2 rounded-xl p-4 transition-shadow">
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
              className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
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

const renameSchema = z.object({
  name: z.string().min(1, "Enter a template name.").max(120),
});

function RenameTemplateDialog({
  template,
  onOpenChange,
}: {
  template: TemplateSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof renameSchema>>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: template.name },
  });

  function onSubmit(values: z.infer<typeof renameSchema>) {
    startTransition(async () => {
      try {
        await renameTemplate(template.id, values.name);
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template name</FormLabel>
                  <FormControl>
                    <Input maxLength={120} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Renaming…" : "Rename"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Same option-card look as the Spec Sheet fork and the New
                Product chooser — bg-card, icon circle, brand ring on hover. */}
            <button
              type="button"
              onClick={() => setMode("blank")}
              className="bg-card hover:ring-brand/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow hover:ring-2"
            >
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <FilePlus2 className="size-5" />
              </span>
              <span className="text-sm font-semibold">Start Blank</span>
              <span className="text-muted-foreground text-xs">
                An empty template you build in the editor.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("clone")}
              disabled={products.length === 0}
              className="bg-card hover:ring-brand/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow hover:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <Copy className="size-5" />
              </span>
              <span className="text-sm font-semibold">From Existing Product</span>
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
            <Label>Source product</Label>
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
            <Label htmlFor="new-template-name">Template name</Label>
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
