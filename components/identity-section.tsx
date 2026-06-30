"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  Collection,
  IdentitySectionData,
  Product,
  ProductStatus,
  Season,
} from "@/types";

const NONE = "__none__";

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  sent_to_factory: "Sent to factory",
  sample_received: "Sample received",
  approved: "Approved",
  in_production: "In production",
};

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

/** A subtle group heading with a divider, mirroring the PDF page sections. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-foreground text-sm font-semibold tracking-tight">
        {children}
      </h3>
      <Separator />
    </div>
  );
}

function ReadOnlyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-muted-foreground border-input flex h-9 items-center rounded-md border border-dashed px-3 text-sm">
        {children}
      </div>
    </div>
  );
}

/**
 * The Product Setup section form — page one of the exported tech pack, a lean
 * "what are we making?" overview. Five grouped field sets backed by a single
 * RHF + Zod form: Core Identity (with a guided "about this product" block),
 * Brand & Ownership, Production Tracking, Use & Fit, and Admin & Metadata.
 * Product-level fields persist to `products`; the rest to the section JSON.
 */
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
  const [factoryOpen, setFactoryOpen] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);

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

  function onSubmit(values: IdentityFormValues) {
    startTransition(async () => {
      try {
        await saveIdentitySection(product.id, values);
        toast.success("Identity section saved.");
        router.refresh();
      } catch {
        toast.error("Could not save the Identity section.");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* ---- Group 1 — Core Identity ------------------------------------ */}
        <section className="space-y-4">
          <GroupHeading>Core Identity</GroupHeading>
          <div className="grid grid-cols-2 gap-6">
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

          {/* About this product — guided, optional description prompts. */}
          <div className="space-y-4 rounded-md border border-dashed p-4">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">About this product</h4>
              <p className="text-muted-foreground text-xs">
                A quick plain-language overview. Optional, but it helps everyone
                picture what you&apos;re making.
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
                    <Input placeholder="e.g. Relaxed athletic fit" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <ReadOnlyField label="Tech Pack Version">
            <span className="flex items-center gap-2">
              <Badge variant="secondary">Draft</Badge>
              <span className="text-xs">
                Versioning begins once the tech pack is approved.
              </span>
            </span>
          </ReadOnlyField>
        </section>

        {/* ---- Group 2 — Brand & Ownership -------------------------------- */}
        <section className="space-y-4">
          <GroupHeading>Brand &amp; Ownership</GroupHeading>
          <div className="grid grid-cols-2 gap-6">
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
        </section>

        {/* ---- Group 3 — Production Tracking (collapsed) ------------------ */}
        <Collapsible
          open={factoryOpen}
          onOpenChange={setFactoryOpen}
          className="space-y-4"
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
            <div className="flex-1">
              <h3 className="text-foreground text-sm font-semibold tracking-tight">
                Production Tracking
              </h3>
              <p className="text-muted-foreground text-xs font-normal">
                Optional — fill in once you&apos;re working with a factory
              </p>
            </div>
            <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <Separator />
          <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
            <div className="grid grid-cols-2 gap-6 pt-1">
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
          </CollapsibleContent>
        </Collapsible>

        {/* ---- Group 4 — Use & Fit (collapsed) ---------------------------- */}
        <Collapsible
          open={classificationOpen}
          onOpenChange={setClassificationOpen}
          className="space-y-4"
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
            <h3 className="text-foreground flex-1 text-sm font-semibold tracking-tight">
              Use &amp; Fit
            </h3>
            <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <Separator />
          <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
            <div className="grid grid-cols-2 gap-6 pt-1">
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
          </CollapsibleContent>
        </Collapsible>

        {/* ---- Group 5 — Admin & Metadata (read-only) --------------------- */}
        <section className="space-y-4">
          <GroupHeading>Admin &amp; Metadata</GroupHeading>
          <div className="grid grid-cols-2 gap-6">
            <ReadOnlyField label="Status">
              <Badge variant="outline">{STATUS_LABELS[product.status]}</Badge>
            </ReadOnlyField>
            <ReadOnlyField label="Tech Pack Version">
              <Badge variant="secondary">Draft</Badge>
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
        </section>

        {/* ---- Save row --------------------------------------------------- */}
        <div className="flex items-center justify-end gap-4 border-t pt-5">
          {lastSaved && (
            <span className="text-muted-foreground text-sm">
              Last saved {lastSaved}
            </span>
          )}
          <Button type="submit" disabled={isPending} className={cn("min-w-48")}>
            {isPending ? "Saving…" : "Save Identity Section"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
