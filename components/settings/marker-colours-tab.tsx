import { MapPin } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { LayerColoursEditor } from "@/components/settings/layer-colours-editor";

/**
 * The Marker Colours tab: workspace-wide annotation marker colours, one per
 * layer. Same editor the canvas toolbar's settings cog opens.
 */
export function MarkerColoursTab() {
  return (
    <SectionCard title="Marker Colours" icon={<MapPin />}>
      <LayerColoursEditor />
    </SectionCard>
  );
}
