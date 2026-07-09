import { redirect } from "next/navigation";

import { BrandsTab } from "@/components/settings/brands-tab";
import { ColoursTab } from "@/components/settings/colours-tab";
import { LabelsTab } from "@/components/settings/labels-tab";
import { LibraryTab } from "@/components/settings/library-tab";
import { MarkerColoursTab } from "@/components/settings/marker-colours-tab";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import {
  isSettingsTabKey,
  type SettingsTabKey,
} from "@/components/settings/settings-tabs-config";
import { TemplatesTab } from "@/components/settings/templates-tab";
import { WorkspaceTab } from "@/components/settings/workspace-tab";
import { getWorkspaceLibrary } from "@/lib/library";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getTemplateSummaries } from "@/lib/templates";

interface PageProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

/**
 * Settings, organised as top tabs (one per area) instead of the old single
 * scroll — the active tab rides the `?tab=` param so it's linkable and
 * refresh-stable. All data is still fetched here in one pass and handed to the
 * per-tab components; the tab shell (`SettingsTabs`) is a pure client switch
 * driven by the `SETTINGS_TABS` config array, so future areas (Grading
 * profiles, PDF/Export preferences) are an array entry + a content component.
 */
export default async function SettingsPage({ searchParams }: PageProps) {
  const ctx = await getCurrentUser();
  if (!ctx) redirect("/login");

  const { tab } = await searchParams;
  const requestedTab = typeof tab === "string" ? tab : "";
  const initialTab: SettingsTabKey = isSettingsTabKey(requestedTab)
    ? requestedTab
    : "brands";

  const supabase = await createClient();
  const wsId = ctx.profile.workspace_id;

  const [
    { data: brands },
    { data: seasons },
    { data: products },
    { data: labels },
    { data: productLabels },
    { data: colours },
    templates,
    { data: pickerProducts },
  ] = await Promise.all([
    supabase.from("brands").select("*").eq("workspace_id", wsId).order("name"),
    supabase
      .from("seasons")
      .select("*")
      .eq("workspace_id", wsId)
      .order("year", { ascending: false }),
    // Brand product counts exclude templates (they aren't live products).
    supabase
      .from("products")
      .select("brand_id")
      .eq("workspace_id", wsId)
      .eq("is_template", false)
      .not("brand_id", "is", null),
    supabase.from("labels").select("*").eq("workspace_id", wsId).order("name"),
    supabase.from("product_labels").select("label_id"),
    supabase
      .from("workspace_colours")
      .select("*")
      .eq("workspace_id", wsId)
      .order("sort_order")
      .order("created_at"),
    getTemplateSummaries(supabase, wsId),
    // The "From Existing Product" picker: live (non-template, non-archived)
    // products only.
    supabase
      .from("products")
      .select("id, name")
      .eq("workspace_id", wsId)
      .eq("is_template", false)
      .is("archived_at", null)
      .order("name"),
  ]);

  // Resolved Master Library for this workspace (incl. hidden globals so the
  // manager can offer a "Hidden" view).
  const libraryItems = await getWorkspaceLibrary(undefined, {
    includeHidden: true,
  });

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

      <SettingsTabs
        initialTab={initialTab}
        content={{
          brands: (
            <BrandsTab
              brands={brandsWithCounts}
              seasons={seasons ?? []}
              workspaceId={wsId}
            />
          ),
          templates: (
            <TemplatesTab
              templates={templates}
              products={pickerProducts ?? []}
            />
          ),
          labels: <LabelsTab labels={labelsWithUsage} />,
          colours: <ColoursTab colours={colours ?? []} />,
          markers: <MarkerColoursTab />,
          library: <LibraryTab items={libraryItems} />,
          workspace: <WorkspaceTab />,
        }}
      />
    </div>
  );
}
