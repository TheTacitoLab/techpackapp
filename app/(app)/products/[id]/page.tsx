import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { CollapsibleSection } from "@/components/collapsible-section";
import { ProductStatusControl } from "@/components/product-status-control";
import { ProgressTracker } from "@/components/progress-tracker";
import { SectionIcon } from "@/components/section-icon";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { ResolvedSection, SectionStatus } from "@/types";

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
  ]);

  const brand = brandResult.data;
  const collection = collectionResult.data;

  const templateByKey = new Map((templates ?? []).map((t) => [t.key, t]));
  const resolved: ResolvedSection[] = (sections ?? []).map((section) => {
    const tmpl = templateByKey.get(section.section_key);
    return { ...section, label: tmpl?.label ?? section.section_key, icon: tmpl?.icon ?? "Component" };
  });
  const statuses: SectionStatus[] = resolved.map((s) => s.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <nav className="text-muted-foreground flex items-center gap-1 text-sm">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Products
        </Link>
        {brand && (
          <>
            <ChevronRight className="size-3.5" />
            <Link
              href={`/dashboard?brand=${brand.id}`}
              className="hover:text-foreground transition-colors"
            >
              {brand.name}
            </Link>
          </>
        )}
        {collection && (
          <>
            <ChevronRight className="size-3.5" />
            <Link
              href={`/dashboard?collection=${collection.id}`}
              className="hover:text-foreground transition-colors"
            >
              {collection.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{product.name}</span>
      </nav>

      {/* Product header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-muted-foreground text-sm">
            {product.style_number ? `Style #${product.style_number}` : "No style number"}
          </p>
        </div>
        <ProductStatusControl productId={product.id} currentStatus={product.status} />
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
            <p className="text-muted-foreground text-sm">
              This section will be built in a later phase.
            </p>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
