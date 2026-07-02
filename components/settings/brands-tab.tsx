import { Palette, RefreshCw } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { SettingsBrandsClient } from "@/components/settings-brands-client";
import { SettingsBrandSwitcher } from "@/components/settings-brand-switcher";
import type { Brand, Season } from "@/types";

/**
 * The Brands tab: brand management (incl. each brand's logo) and the active-
 * brand switcher — the two brand-related cards from the old single-scroll
 * Settings page, functionality unchanged.
 */
export function BrandsTab({
  brands,
  seasons,
  workspaceId,
}: {
  brands: (Brand & { productCount: number })[];
  seasons: Season[];
  workspaceId: string;
}) {
  return (
    <>
      <SectionCard title="Your Brands" icon={<Palette />}>
        <SettingsBrandsClient
          brands={brands}
          seasons={seasons}
          workspaceId={workspaceId}
        />
      </SectionCard>

      <SectionCard title="Switch Active Brand" icon={<RefreshCw />}>
        <SettingsBrandSwitcher brands={brands} />
      </SectionCard>
    </>
  );
}
