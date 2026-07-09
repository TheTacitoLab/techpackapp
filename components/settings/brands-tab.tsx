import { Palette } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { SettingsBrandsClient } from "@/components/settings-brands-client";
import type { Brand, Season } from "@/types";

/**
 * The Brands tab: brand management, incl. each brand's logo. The old
 * "Switch Active Brand" card is gone — brands stopped being a navigation
 * filter when Collections became the grouping surface; they remain the
 * entity that puts logos on PDFs.
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
    <SectionCard title="Your Brands" icon={<Palette />}>
      <SettingsBrandsClient
        brands={brands}
        seasons={seasons}
        workspaceId={workspaceId}
      />
    </SectionCard>
  );
}
