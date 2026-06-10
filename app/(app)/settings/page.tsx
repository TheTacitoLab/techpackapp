import { CreditCard, Download, Palette, RefreshCw, Tag, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { LabelsManager } from "@/components/labels-manager";
import { SectionCard } from "@/components/section-card";
import { SettingsBrandsClient } from "@/components/settings-brands-client";
import { SettingsBrandSwitcher } from "@/components/settings-brand-switcher";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const ctx = await getCurrentUser();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const [
    { data: brands },
    { data: seasons },
    { data: products },
    { data: labels },
    { data: productLabels },
  ] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase
      .from("seasons")
      .select("*")
      .eq("workspace_id", wsId)
      .order("year", { ascending: false }),
    supabase
      .from("products")
      .select("brand_id")
      .eq("workspace_id", wsId)
      .not("brand_id", "is", null),
    supabase.from("labels").select("*").eq("workspace_id", wsId).order("name"),
    supabase.from("product_labels").select("label_id"),
  ]);

  const labelUsage = new Map<string, number>();
  for (const pl of productLabels ?? []) {
    labelUsage.set(pl.label_id, (labelUsage.get(pl.label_id) ?? 0) + 1);
  }
  const labelsWithUsage = (labels ?? []).map((l) => ({
    ...l,
    usageCount: labelUsage.get(l.id) ?? 0,
  }));

  const productCountByBrand = new Map<string, number>();
  for (const p of products ?? []) {
    if (p.brand_id) {
      productCountByBrand.set(
        p.brand_id,
        (productCountByBrand.get(p.brand_id) ?? 0) + 1,
      );
    }
  }

  const brandsWithCounts = (brands ?? []).map((b) => ({
    ...b,
    productCount: productCountByBrand.get(b.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          {ctx.workspace?.name ?? "Your workspace"}
        </p>
      </div>

      <SectionCard title="Your Brands" icon={<Palette />}>
        <SettingsBrandsClient
          brands={brandsWithCounts}
          seasons={seasons ?? []}
        />
      </SectionCard>

      <SectionCard title="Switch Active Brand" icon={<RefreshCw />}>
        <SettingsBrandSwitcher brands={brandsWithCounts} />
      </SectionCard>

      <SectionCard title="Labels" icon={<Tag />}>
        <LabelsManager labels={labelsWithUsage} />
      </SectionCard>

      <SectionCard title="Team Members" icon={<Users />}>
        <p className="text-muted-foreground text-sm">
          Team management — coming in Phase 3.
        </p>
      </SectionCard>

      <SectionCard title="Billing" icon={<CreditCard />}>
        <p className="text-muted-foreground text-sm">
          Billing and subscription — coming in Phase 3.
        </p>
      </SectionCard>

      <SectionCard title="Export Preferences" icon={<Download />}>
        <p className="text-muted-foreground text-sm">
          PDF and export configuration — coming in Phase 3.
        </p>
      </SectionCard>
    </div>
  );
}
