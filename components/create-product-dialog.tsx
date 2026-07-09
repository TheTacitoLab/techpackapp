"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { FilePlus2, LayoutTemplate, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  createProduct,
  createProductFromSpecTemplate,
} from "@/app/(app)/dashboard/actions";
import { createFromTemplate } from "@/app/(app)/products/template-actions";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "@/components/spec/spec-template-picker";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orderCollectionsForPicker } from "@/lib/collection-hierarchy";
import type { SpecTemplateSummary } from "@/lib/spec-library";
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";
import type { Brand, Collection } from "@/types";

const schema = z.object({
  name: z.string().min(1, "Enter a product name."),
  style_number: z.string().optional(),
  collection_id: z.string().optional(),
  brand_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Mode = "choose" | "blank" | "template";

type TemplateSource = "custom" | "garspec";

/**
 * "+ New product" — two paths: A) Create New Tech Pack (the blank flow) or
 * B) Use A Template. The template step has two sources: "My Templates"
 * (workspace product templates — full deep copies) and "GarSpec Templates"
 * (the seeded garment library — a fresh product whose Size Specifications
 * sheet starts from the chosen garment's measurement points). With neither
 * source available the chooser is skipped and the dialog IS the blank flow.
 */
export function CreateProductDialog({
  collections = [],
  brands = [],
  templates = [],
  specTemplates = [],
  defaultCollectionId,
}: {
  collections?: Collection[];
  /** For the optional brand picker shown when no collection is chosen. */
  brands?: Brand[];
  templates?: TemplateSummary[];
  /** The seeded GarSpec garment library (global spec templates). */
  specTemplates?: SpecTemplateSummary[];
  /** Pre-selects a collection (e.g. "New Product" on a collection's page). */
  defaultCollectionId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [isPending, startTransition] = useTransition();

  // ---- template path state ----
  const [templateSource, setTemplateSource] = useState<TemplateSource>(
    templates.length > 0 ? "custom" : "garspec",
  );
  const [templateId, setTemplateId] = useState("");
  const [specTemplateId, setSpecTemplateId] = useState("");
  const [templateProductName, setTemplateProductName] = useState("");
  const [templateCollectionId, setTemplateCollectionId] = useState(
    defaultCollectionId ?? "",
  );
  const [templateBrandId, setTemplateBrandId] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      style_number: "",
      collection_id: defaultCollectionId ?? "",
      brand_id: "",
    },
  });

  const hasTemplateSources =
    templates.length > 0 || specTemplates.length > 0;
  const effectiveMode: Mode = hasTemplateSources ? mode : "blank";

  // Sub-collections indented under their parents, in one flat picker list.
  const collectionOptions = useMemo(
    () => orderCollectionsForPicker(collections),
    [collections],
  );

  // The seeded garment library, grouped in the spec picker's category order.
  const garspecGroups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: specTemplates.filter((t) => t.category === category),
      })).filter((group) => group.items.length > 0),
    [specTemplates],
  );

  // A product in a collection adopts the collection's brand server-side;
  // only a collection-less product needs its own (optional) brand pick.
  const watchedCollectionId = useWatch({
    control: form.control,
    name: "collection_id",
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setMode("choose");
      setTemplateSource(templates.length > 0 ? "custom" : "garspec");
      setTemplateId("");
      setSpecTemplateId("");
      setTemplateProductName("");
      setTemplateCollectionId(defaultCollectionId ?? "");
      setTemplateBrandId("");
      form.reset();
    }
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        // The product's brand derives from the chosen collection
        // server-side; the picked brand only applies without a collection.
        const result = await createProduct({
          name: values.name,
          style_number: values.style_number,
          collection_id: values.collection_id || undefined,
          brand_id: values.collection_id
            ? undefined
            : values.brand_id || undefined,
        });
        if (result.error || !result.id) {
          toast.error(result.error ?? "Could not create product.");
          return;
        }
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

  function handleCreateFromGarspec() {
    const trimmed = templateProductName.trim();
    if (!trimmed || !specTemplateId) return;
    startTransition(async () => {
      try {
        const result = await createProductFromSpecTemplate({
          name: trimmed,
          spec_template_id: specTemplateId,
          collection_id: templateCollectionId || undefined,
          brand_id: templateCollectionId
            ? undefined
            : templateBrandId || undefined,
        });
        if (result.error || !result.id) {
          toast.error(result.error ?? "Could not create product.");
          return;
        }
        toast.success("Product created from the GarSpec template.");
        setOpen(false);
        router.push(`/products/${result.id}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not create product.",
        );
      }
    });
  }

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const selectedSpecTemplate =
    specTemplates.find((t) => t.id === specTemplateId) ?? null;
  const activeSelection =
    templateSource === "custom" ? selectedTemplate : selectedSpecTemplate;

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
              ? "Start a new tech pack from scratch, or from a template."
              : effectiveMode === "template"
                ? templateSource === "custom"
                  ? "Everything the template contains carries over as a fresh, independent copy."
                  : "A standard garment from the GarSpec library — your product starts with its Size Specifications sheet ready to size."
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
                A GarSpec garment or one of your saved templates.
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
              {collectionOptions.length > 0 && (
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
                          {collectionOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className={c.depth === 1 ? "pl-4" : undefined}>
                                {c.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {!watchedCollectionId && brands.length > 0 && (
                <FormField
                  control={form.control}
                  name="brand_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand (optional)</FormLabel>
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
                          {brands.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
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
                  hasTemplateSources && "flex items-center sm:justify-between",
                )}
              >
                {hasTemplateSources && (
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
            <Tabs
              value={templateSource}
              onValueChange={(v) => setTemplateSource(v as TemplateSource)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="custom">My Templates</TabsTrigger>
                <TabsTrigger value="garspec">GarSpec Templates</TabsTrigger>
              </TabsList>
            </Tabs>

            {templateSource === "custom" ? (
              templates.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No custom templates yet. Save any product as a template from
                  its page header, and it will appear here.
                </p>
              ) : (
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
              )
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {garspecGroups.map((group) => (
                  <div key={group.category} className="space-y-2">
                    <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                      {CATEGORY_LABEL[group.category]}
                    </p>
                    {group.items.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSpecTemplateId(template.id)}
                        className={cn(
                          "bg-card flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition-shadow",
                          specTemplateId === template.id
                            ? "border-brand ring-brand ring-2"
                            : "hover:ring-brand/40 hover:ring-2",
                        )}
                        aria-pressed={specTemplateId === template.id}
                      >
                        <span className="text-sm font-medium">
                          {template.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {template.pomCount}{" "}
                          {template.pomCount === 1
                            ? "measurement point"
                            : "measurement points"}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {activeSelection && (
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
                {collectionOptions.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Collection (optional)</Label>
                    <Select
                      value={templateCollectionId}
                      onValueChange={setTemplateCollectionId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {collectionOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className={c.depth === 1 ? "pl-4" : undefined}>
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* A GarSpec garment has no source brand to carry over (a
                    custom template does), so offer one when no collection
                    will supply it. */}
                {templateSource === "garspec" &&
                  !templateCollectionId &&
                  brands.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Brand (optional)</Label>
                      <Select
                        value={templateBrandId}
                        onValueChange={setTemplateBrandId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          {brands.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
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
                onClick={
                  templateSource === "custom"
                    ? handleCreateFromTemplate
                    : handleCreateFromGarspec
                }
                disabled={
                  isPending ||
                  !activeSelection ||
                  !templateProductName.trim()
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
