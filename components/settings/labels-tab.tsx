import { Tag } from "lucide-react";

import { LabelsManager } from "@/components/labels-manager";
import { SectionCard } from "@/components/section-card";
import type { Label } from "@/types";

/** The Labels tab: the colour-coded labels manager, functionality unchanged. */
export function LabelsTab({
  labels,
}: {
  labels: (Label & { usageCount: number })[];
}) {
  return (
    <SectionCard title="Labels" icon={<Tag />}>
      <LabelsManager labels={labels} />
    </SectionCard>
  );
}
