import { Library } from "lucide-react";

import { LibraryManager } from "@/components/library-manager";
import { SectionCard } from "@/components/section-card";
import type { ResolvedLibraryItem } from "@/types";

/**
 * The Master Library tab — the largest Settings area, now reachable directly
 * (deep-linkable as /settings?tab=library) instead of scrolling past
 * everything else. The manager itself is unchanged.
 */
export function LibraryTab({ items }: { items: ResolvedLibraryItem[] }) {
  return (
    <SectionCard title="Master Library" icon={<Library />}>
      <LibraryManager items={items} />
    </SectionCard>
  );
}
