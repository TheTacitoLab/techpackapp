import { CreditCard, Download, Users } from "lucide-react";

import { SectionCard } from "@/components/section-card";

/**
 * The Workspace tab: the three existing "coming in Phase 3" cards from the old
 * single-scroll page (Team Members, Billing, Export Preferences), preserved
 * as-is under one tab. When Export Preferences (or Grading profiles) actually
 * lands, it gets its OWN tab via the `SETTINGS_TABS` config — these cards are
 * kept because they already existed, not as new placeholders.
 */
export function WorkspaceTab() {
  return (
    <>
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
    </>
  );
}
