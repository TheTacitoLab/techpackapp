import { notFound } from "next/navigation";
import Link from "next/link";

import { CollapsibleSection } from "@/components/collapsible-section";
import { ProductLabels } from "@/components/product-labels";
import { ProductStatusControl } from "@/components/product-status-control";
import { ProgressTracker } from "@/components/progress-tracker";
import { SectionIcon } from "@/components/section-icon";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Label, ResolvedSection, SectionStatus } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id)
    .single();

  if (!product) notFound();

  const [
    { data: sections },
    { data: templates },
    brandResult,
    collectionResult,
    { data: workspaceLabels },
    { data: assignedRows },
  ] = await Promise.all([
    supabase
      .from("product_sections")
      .select("*")
      .eq("product_id", product.id)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
    supabase.from("section_templates").select("*"),
    product.brand_id
      ? supabase.from("brands").select("id, name").eq("id", product.brand_id).single()
      : Promise.resolve({ data: null }),
    product.collection_id
      ? supabase
          .from("collections")
          .select("id, name")
          .eq("id", product.collection_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("labels")
      .select("*")
      .eq("workspace_id", ctx.profile.workspace_id)
      .order("name"),
    supabase
      .from("product_labels")
      .select("label_id")
      .eq("product_id", product.id),
  ]);

  const brand = brandResult.data;
  const collection = collectionResult.data;
  const labels: Label[] = workspaceLabels ?? [];
  const assignedIds = (assignedRows ?? []).map((r) => r.label_id);

  const templateByKey = new Map((templates ?? []).map((t) => [t.key, t]));
  const resolved: ResolvedSection[] = (sections ?? []).map((section) => {
    const tmpl = templateByKey.get(section.section_key);
    return { ...section, label: tmpl?.label ?? section.section_key, icon: tmpl?.icon ?? "Component" };
  });
  const statuses: SectionStatus[] = resolved.map((s) => s.status);

  return (
    <div className="flex flex-col">
      {/* Sticky workspace header: compact breadcrumb bar + slim progress row.
          Stays pinned so the product name, labels, status, and progress remain
          visible while scrolling through long tech-pack sections. */}
      <div className="bg-background sticky top-0 z-10 border-b">
        {/* Compact header bar — single line on desktop */}
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          <nav className="text-muted-foreground flex min-w-0 items-center gap-1.5 overflow-hidden text-sm whitespace-nowrap">
            <Link
              href="/products"
              className="hover:text-foreground shrink-0 transition-colors"
            >
              Products
            </Link>
            {brand && (
              <>
                <span className="shrink-0">/</span>
                <span className="shrink-0">{brand.name}</span>
              </>
            )}
            {collection && (
              <>
                <span className="shrink-0">/</span>
                <Link
                  href="/products"
                  className="hover:text-foreground shrink-0 transition-colors"
                >
                  {collection.name}
                </Link>
              </>
            )}
            <span className="shrink-0">/</span>
            <span className="text-foreground truncate font-semibold">
              {product.name}
            </span>
            <span className="text-muted-foreground shrink-0">
              {product.style_number ? `· ${product.style_number}` : "· No style #"}
            </span>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <ProductLabels
              productId={product.id}
              labels={labels}
              assignedIds={assignedIds}
            />
            <ProductStatusControl
              productId={product.id}
              currentStatus={product.status}
            />
          </div>
        </div>

        {/* Slim progress row */}
        <div className="flex h-8 items-center px-6 pb-1.5">
          <ProgressTracker statuses={statuses} className="w-full" />
        </div>
      </div>

      {/* Tech-pack sections — given the maximum remaining vertical space */}
      <div className="space-y-4 px-6 py-4">
        {resolved.map((section, index) => (
          <CollapsibleSection
            key={section.id}
            sectionKey={section.section_key}
            title={section.label}
            icon={<SectionIcon name={section.icon} />}
            status={section.status}
            defaultOpen={index === 0}
          >
            <p className="text-muted-foreground text-sm">
              This section will be built in a later phase.
            </p>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
