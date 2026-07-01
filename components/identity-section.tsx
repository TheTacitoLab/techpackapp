"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { saveIdentitySection } from "@/app/(app)/products/[id]/actions";
import {
  CATEGORY_OPTIONS,
  END_USE_OPTIONS,
  FIT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  identityFormSchema,
  type IdentityFormValues,
} from "@/app/(app)/products/[id]/identity-schema";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  Collection,
  IdentitySectionData,
  Product,
  Season,
  SectionStatus,
} from "@/types";

const NONE = "__none__";

function toDefaults(
  product: Product,
  sectionData: IdentitySectionData | null,
): IdentityFormValues {
  return {
    name: product.name ?? "",
    style_number: product.style_number ?? "",
    category: product.category ?? "",
    gender: product.gender ?? "",
    size_range: product.size_range ?? "",
    season_id: product.season_id ?? "",
    product_description: sectionData?.product_description ?? "",
    key_features: sectionData?.key_features ?? "",
    fit_description: sectionData?.fit_description ?? "",
    designer_name: product.designer_name ?? "",
    designer_email: product.designer_email ?? "",
    factory_name: product.factory_name ?? "",
    factory_country: product.factory_country ?? "",
    sample_due_date: product.sample_due_date ?? "",
    delivery_date: product.delivery_date ?? "",
    wholesale_price:
      product.wholesale_price != null ? String(product.wholesale_price) : "",
    retail_price:
      product.retail_price != null ? String(product.retail_price) : "",
    end_use: sectionData?.end_use ?? "",
    fit_type: sectionData?.fit_type ?? "",
    internal_notes: sectionData?.internal_notes ?? "",
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Per-group completion helpers
// ---------------------------------------------------------------------------

function filled(...values: (string | null | undefined)[]): number {
  return values.filter((v) => v && String(v).trim()).length;
}

function computeCoreStatus(v: IdentityFormValues): SectionStatus {
  const n = filled(v.name, v.style_number, v.category, v.gender, v.size_range);
  if (n === 5) return "complete";
  if (n > 0) return "in_progress";
  return "not_started";
}

function computeOwnershipStatus(v: IdentityFormValues): SectionStatus {
  const n = filled(v.designer_name, v.designer_email);
  if (n === 2) return "complete";
  if (n > 0) return "in_progress";
  return "not_started";
}

function computeProductionStatus(v: IdentityFormValues): SectionStatus {
  const n = filled(
    v.factory_name,
    v.factory_country,
    v.sample_due_date,
    v.delivery_date,
    v.wholesale_price,
    v.retail_price,
  );
  if (n === 6) return "complete";
  if (n > 0) return "in_progress";
  return "not_started";
}

function computeFitStatus(v: IdentityFormValues): SectionStatus {
  const n = filled(v.end_use, v.fit_type);
  if (n === 2) return "complete";
  if (n > 0) return "in_progress";
  return "not_started";
}

function computeAdminStatus(v: IdentityFormValues): SectionStatus {
  return filled(v.internal_notes) > 0 ? "complete" : "not_started";
}

// ---------------------------------------------------------------------------
// Sub-section components
// ---------------------------------------------------------------------------

/** Small completion ring shown in each sub-section header. */
function SubStatusIndicator({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <span className="bg-brand text-brand-foreground flex size-4 shrink-0 items-center justify-center rounded-full">
        <Check className="size-2.5" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="border-input flex size-4 shrink-0 items-center justify-center rounded-full border">
        <span className="bg-brand size-1.5 rounded-full" />
      </span>
    );
  }
  return (
    <span className="border-input flex size-4 shrink-0 items-center justify-center rounded-full border opacity-40" />
  );
}

/** Collapsible sub-section within the Product Setup form. */
function SubSection({
  title,
  status,
  defaultOpen = true,
  children,
}: {
  title: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-1">
      <CollapsibleTrigger className="group hover:bg-accent/40 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 py-2.5 text-left outline-none transition-colors">
        <SubStatusIndicator status={status} />
        <span className="flex-1 text-[13px] font-semibold">{title}</span>
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
        <div className="px-1 pb-4 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Read-only / generated content (version, brand, collection, dates). Presented
 * as a flat muted strip with no input styling.
 */
function ReadOnlyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-label text-[13px] font-medium">{label}</span>
      <div className="text-foreground bg-muted/60 flex min-h-9 items-center rounded-md px-3 py-2 text-sm">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function IdentitySection({
  product,
  sectionData,
  seasons,
  collections,
  brandName,
}: {
  product: Product;
  sectionData: IdentitySectionData | null;
  seasons: Season[];
  collections: Collection[];
  brandName: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<IdentityFormValues>({
    resolver: zodResolver(identityFormSchema),
    defaultValues: toDefaults(product, sectionData),
  });

  const collectionName = useMemo(
    () =>
      collections.find((c) => c.id === product.collection_id)?.name ?? "—",
    [collections, product.collection_id],
  );

  const lastSaved = formatRelative(sectionData?.last_saved ?? null);

  // Subscribe to all field changes so status indicators update live.
  const values = form.watch();
  const coreStatus = computeCoreStatus(values);
  const ownershipStatus = computeOwnershipStatus(values);
  const productionStatus = computeProductionStatus(values);
  const fitStatus = computeFitStatus(values);
  const adminStatus = computeAdminStatus(values);

  function onSubmit(vals: IdentityFormValues) {
    startTransition(async () => {
      try {
        await saveIdentitySection(product.id, vals);
        toast.success("Identity section saved.");
        router.refresh();
      } catch {
        toast.error("Could not save the Identity section.");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="divide-border divide-y">

          {/* ---- Sub-section 1 — Core Identity -------------------------------- */}
          <SubSection title="Core Identity" status={coreStatus} defaultOpen={true}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Style Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Aero Training Tee" {...field} />
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
                      <FormLabel>
                        Style Number / SKU{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. SS26-TEE-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Category <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Gender / Age Group{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GENDER_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="size_range"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Size Range <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. XS–XL or UK 6–18" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="season_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Season</FormLabel>
                      <Select
                        value={field.value ? field.value : undefined}
                        onValueChange={(v) =>
                          field.onChange(v === NONE ? "" : v)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a season" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>No season</SelectItem>
                          {seasons.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} {s.year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* About this product — guided description block */}
              <div className="bg-muted space-y-4 rounded-lg p-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
                    About this product
                  </p>
                  <p className="text-muted-foreground text-xs">
                    A quick plain-language overview. Optional, but it helps
                    everyone picture what you&apos;re making.
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="product_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What is this product?</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-card"
                          placeholder="e.g. A relaxed hybrid hoodie for training and travel"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="key_features"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key features</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-card"
                          placeholder="e.g. Hood, kangaroo pocket, contrast panels, rib cuff and hem"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fit_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fit description</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-card"
                          placeholder="e.g. Relaxed athletic fit"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <ReadOnlyField label="Tech Pack Version">
                <span className="flex items-center gap-2">
                  <StatusPill status="draft" />
                  <span className="text-xs">
                    Versioning begins once the tech pack is approved.
                  </span>
                </span>
              </ReadOnlyField>
            </div>
          </SubSection>

          {/* ---- Sub-section 2 — Brand & Ownership ---------------------------- */}
          <SubSection
            title="Brand & Ownership"
            status={ownershipStatus}
            defaultOpen={true}
          >
            <div className="grid grid-cols-2 gap-4">
              <ReadOnlyField label="Brand Name">{brandName ?? "—"}</ReadOnlyField>
              <ReadOnlyField label="Collection">{collectionName}</ReadOnlyField>
              <FormField
                control={form.control}
                name="designer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Jordan Blake" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="designer_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designer Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="designer@brand.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SubSection>

          {/* ---- Sub-section 3 — Production Tracking -------------------------- */}
          <SubSection
            title="Production Tracking"
            status={productionStatus}
            defaultOpen={false}
          >
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Optional — fill in once you&apos;re working with a factory.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="factory_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Factory / Vendor Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Apex Garments Ltd" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="factory_country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Factory Country</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Portugal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sample_due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sample Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delivery_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bulk Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="wholesale_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Wholesale Price</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                            £
                          </span>
                          <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            className="pl-7"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="retail_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Retail Price</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                            £
                          </span>
                          <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            className="pl-7"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </SubSection>

          {/* ---- Sub-section 4 — Use & Fit ------------------------------------ */}
          <SubSection
            title="Use & Fit"
            status={fitStatus}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="end_use"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Use / Activity</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an end use" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {END_USE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fit_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fit Type</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a fit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FIT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SubSection>

          {/* ---- Sub-section 5 — Admin & Metadata ----------------------------- */}
          <SubSection
            title="Admin & Metadata"
            status={adminStatus}
            defaultOpen={false}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <ReadOnlyField label="Status">
                  <StatusPill status={product.status} />
                </ReadOnlyField>
                <ReadOnlyField label="Tech Pack Version">
                  <StatusPill status="draft" />
                </ReadOnlyField>
                <ReadOnlyField label="Date Created">
                  {formatDate(product.created_at)}
                </ReadOnlyField>
                <ReadOnlyField label="Last Modified">
                  {formatDate(product.updated_at)}
                </ReadOnlyField>
              </div>
              <FormField
                control={form.control}
                name="internal_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Internal Notes{" "}
                      <span className="text-muted-foreground font-normal">
                        — Internal only, not included in export
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Notes for your team. Never printed on the tech pack."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SubSection>

        </div>

        {/* ---- Section footer: save action, right-aligned ------------------- */}
        <div
          className={cn(
            "border-border flex items-center justify-end gap-4 border-t pt-5 mt-2",
          )}
        >
          {lastSaved && (
            <span className="text-muted-foreground text-xs">
              Last saved {lastSaved}
            </span>
          )}
          <Button type="submit" disabled={isPending} className="min-w-48">
            {isPending ? "Saving…" : "Save Product Setup"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
