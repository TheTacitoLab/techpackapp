"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FilePlus2, LayoutTemplate, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { createProduct } from "@/app/(app)/dashboard/actions";
import { createFromTemplate } from "@/app/(app)/products/template-actions";
import {
  TemplateContentIndicators,
  templateMetaLine,
} from "@/components/templates/template-card-info";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { Collection } from "@/types";

const schema = z.object({
  name: z.string().min(1, "Enter a product name."),
  style_number: z.string().optional(),
  collection_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Mode = "choose" | "blank" | "template";

/**
 * "+ New product" — two paths: A) Create New Tech Pack (the blank flow,
 * unchanged) or B) Use A Template (picker → name + collection → a full deep
 * copy lands on the new product page). With no templates in the workspace
 * the chooser is skipped and the dialog IS the blank flow, exactly as before
 * the feature existed.
 */
export function CreateProductDialog({
  collections = [],
  templates = [],
}: {
  collections?: Collection[];
  templates?: TemplateSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [isPending, startTransition] = useTransition();
  const activeBrandId = useUiStore((s) => s.activeBrandId);

  // ---- template path state ----
  const [templateId, setTemplateId] = useState("");
  const [templateProductName, setTemplateProductName] = useState("");
  const [templateCollectionId, setTemplateCollectionId] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      style_number: "",
      collection_id: "",
    },
  });

  const hasTemplates = templates.length > 0;
  const effectiveMode: Mode = hasTemplates ? mode : "blank";

  const activeCollections = activeBrandId
    ? collections.filter((c) => c.brand_id === activeBrandId)
    : collections;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMode("choose");
      setTemplateId("");
      setTemplateProductName("");
      setTemplateCollectionId("");
      form.reset();
    }
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const result = await createProduct({
          name: values.name,
          style_number: values.style_number,
          brand_id: activeBrandId ?? undefined,
          collection_id: values.collection_id || undefined,
        });
        toast.success("Product created.");
        setOpen(false);
        form.reset();
        router.push(`/products/${result.id}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not create product.",
        );
      }
    });
  }

  function handleCreateFromTemplate() {
    const trimmed = templateProductName.trim();
    if (!trimmed || !templateId) return;
    startTransition(async () => {
      try {
        const { id, warnings } = await createFromTemplate(templateId, {
          name: trimmed,
          collectionId: templateCollectionId || undefined,
        });
        for (const warning of warnings) toast.warning(warning);
        toast.success("Product created from template.");
        setOpen(false);
        router.push(`/products/${id}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not create product.",
        );
      }
    });
  }

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New product
        </Button>
      </DialogTrigger>
      <DialogContent className={cn(effectiveMode === "template" && "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>
            {effectiveMode === "template"
              ? "Use a template"
              : "Create a product"}
          </DialogTitle>
          <DialogDescription>
            {effectiveMode === "choose"
              ? "Start a new tech pack from scratch, or from one of your templates."
              : effectiveMode === "template"
                ? "Everything the template contains carries over as a fresh, independent copy."
                : "Start a new tech pack. Its sections are created automatically."}
          </DialogDescription>
        </DialogHeader>

        {effectiveMode === "choose" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Same option-card look as the Spec Sheet fork — bg-card, icon
                circle, brand ring on hover — so choosers read identically
                across the app. */}
            <button
              type="button"
              onClick={() => setMode("blank")}
              className="bg-card hover:ring-brand/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow hover:ring-2"
            >
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <FilePlus2 className="size-5" />
              </span>
              <span className="text-sm font-semibold">Create New Tech Pack</span>
              <span className="text-muted-foreground text-xs">
                A blank product with empty sections.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("template")}
              className="bg-card hover:ring-brand/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow hover:ring-2"
            >
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <LayoutTemplate className="size-5" />
              </span>
              <span className="text-sm font-semibold">Use A Template</span>
              <span className="text-muted-foreground text-xs">
                Start from a reusable base garment.
              </span>
            </button>
          </div>
        )}

        {effectiveMode === "blank" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Performance Hoodie" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="style_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Style number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. SS26-001 (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {activeCollections.length > 0 && (
                <FormField
                  control={form.control}
                  name="collection_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Collection (optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeCollections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <DialogFooter
                className={cn(
                  hasTemplates && "flex items-center sm:justify-between",
                )}
              >
                {hasTemplates && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMode("choose")}
                    disabled={isPending}
                  >
                    Back
                  </Button>
                )}
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating…" : "Create product"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {effectiveMode === "template" && (
          <div className="space-y-4">
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  className={cn(
                    "bg-card flex w-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-shadow",
                    templateId === template.id
                      ? "border-brand ring-brand ring-2"
                      : "hover:ring-brand/40 hover:ring-2",
                  )}
                  aria-pressed={templateId === template.id}
                >
                  <span className="text-sm font-medium">{template.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {templateMetaLine(template)}
                  </span>
                  <TemplateContentIndicators template={template} />
                </button>
              ))}
            </div>

            {selectedTemplate && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="template-product-name">Product name</Label>
                  <Input
                    id="template-product-name"
                    value={templateProductName}
                    onChange={(e) => setTemplateProductName(e.target.value)}
                    placeholder="e.g. Performance Hoodie SS26"
                    maxLength={120}
                  />
                </div>
                {collections.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Collection (optional)</Label>
                    {/* Deliberately ALL collections, not just the active
                        brand's — templates are workspace-wide for use. */}
                    <Select
                      value={templateCollectionId}
                      onValueChange={setTemplateCollectionId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {collections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <DialogFooter className="flex items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("choose")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleCreateFromTemplate}
                disabled={
                  isPending || !templateId || !templateProductName.trim()
                }
              >
                {isPending ? "Creating…" : "Create product"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
