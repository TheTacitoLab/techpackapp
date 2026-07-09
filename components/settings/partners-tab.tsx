import { Eye, Handshake } from "lucide-react";

import { SectionCard } from "@/components/section-card";
import { PartnersManager } from "@/components/settings/partners-manager";
import type { GrantScopeOptions } from "@/components/settings/partner-scope-picker";
import { VisibilityProfilesManager } from "@/components/settings/visibility-profiles-manager";
import type { ResolvedPartner, VisibilityProfile } from "@/types";

/**
 * The Partners tab: two sub-sections under one tab — the Partner directory
 * (with per-partner contacts and access grants) and the Visibility Profiles
 * that grants reference. Both are workspace-scoped setup surfaces; nothing
 * here is partner-facing (the portal that consumes grants + profiles arrives
 * in a later phase).
 */
export function PartnersTab({
  partners,
  profiles,
  scopeOptions,
}: {
  partners: ResolvedPartner[];
  profiles: VisibilityProfile[];
  scopeOptions: GrantScopeOptions;
}) {
  return (
    <>
      <SectionCard title="Partners" icon={<Handshake />}>
        <PartnersManager
          partners={partners}
          profiles={profiles}
          scopeOptions={scopeOptions}
        />
      </SectionCard>

      <SectionCard title="Visibility Profiles" icon={<Eye />}>
        <VisibilityProfilesManager profiles={profiles} />
      </SectionCard>
    </>
  );
}
