import { SwatchBook } from "lucide-react";

import { ColourLibraryManager } from "@/components/colour-library-manager";
import { SectionCard } from "@/components/section-card";
import type { WorkspaceColour } from "@/types";

export function ColoursTab({ colours }: { colours: WorkspaceColour[] }) {
  return (
    <SectionCard title="Colours" icon={<SwatchBook />}>
      <ColourLibraryManager colours={colours} />
    </SectionCard>
  );
}
