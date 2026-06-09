import { PackagePlus } from "lucide-react";

import { CollapsibleSection } from "@/components/collapsible-section";
import { CreateProductDialog } from "@/components/create-product-dialog";
import { EmptyState } from "@/components/empty-state";
import { ProgressTracker } from "@/components/progress-tracker";
import { SectionIcon } from "@/components/section-icon";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { ResolvedSection, SectionStatus } from "@/types";

export default async function DashboardPage() {
  const ctx = await getCurrentUser();
  if (!ctx) return null; // (app)/layout already guards + redirects

  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", ctx.profile.workspace_id)
    .order("created_at", { ascending: true });

  if (!products || products.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {ctx.workspace?.name ?? "Your workspace"}
          </p>
        </div>
        <EmptyState
          icon={PackagePlus}
          title="No products yet"
          description="Create your first tech pack to start building modular, factory-ready sections."
          action={<CreateProductDialog />}
        />
      </div>
    );
  }

  const product = products[0];

  // Load this product's enabled sections and the global template metadata, then
  // merge in memory. Sections are entirely data-driven — never hard-coded here.
  const [{ data: sections }, { data: templates }] = await Promise.all([
    supabase
      .from("product_sections")
      .select("*")
      .eq("product_id", product.id)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
    supabase.from("section_templates").select("*"),
  ]);

  const templateByKey = new Map((templates ?? []).map((t) => [t.key, t]));
  const resolved: ResolvedSection[] = (sections ?? []).map((section) => {
    const template = templateByKey.get(section.section_key);
    return {
      ...section,
      label: template?.label ?? section.section_key,
      icon: template?.icon ?? "Component",
    };
  });

  const statuses: SectionStatus[] = resolved.map((section) => section.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {product.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {product.style_number
              ? `Style ${product.style_number}`
              : "Tech pack"}
          </p>
        </div>
        <CreateProductDialog />
      </div>

      <ProgressTracker statuses={statuses} />

      <div className="space-y-3">
        {resolved.map((section, index) => (
          <CollapsibleSection
            key={section.id}
            sectionKey={section.section_key}
            title={section.label}
            icon={<SectionIcon name={section.icon} />}
            status={section.status}
            defaultOpen={index === 0}
          >
            <p className="text-muted-foreground text-sm">Coming soon</p>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
