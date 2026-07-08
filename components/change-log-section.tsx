import { History } from "lucide-react";

import {
  CHANGE_LOG_FETCH_LIMIT,
  changeAreaLabel,
  readVersionBumpMeta,
} from "@/lib/change-log";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import type { ProductChangeLogEntry } from "@/types";

type VersionGroup = {
  version: string;
  /** The bump entry that opened this version (none for the initial v1.0). */
  bump: ProductChangeLogEntry | null;
  entries: ProductChangeLogEntry[];
};

/**
 * Group entries (already newest-first) by the version they were stamped
 * with. Versions only ever move forward, so same-version entries are
 * contiguous and encounter order IS newest-version-first. The `version`-area
 * bump entry becomes the group's header (it carries the user's "what changed
 * in this version" note) rather than a body row.
 */
function groupByVersion(entries: ProductChangeLogEntry[]): VersionGroup[] {
  const groups: VersionGroup[] = [];
  for (const entry of entries) {
    let group = groups[groups.length - 1];
    if (!group || group.version !== entry.version) {
      group = { version: entry.version, bump: null, entries: [] };
      groups.push(group);
    }
    if (entry.area === "version") group.bump = entry;
    else group.entries.push(entry);
  }
  return groups;
}

/**
 * The Change Log section body: every specification change, newest first,
 * grouped under a header per version (the bump note shown as that header's
 * description). Meta activity (notes, comments, exports, views, completion
 * marks) never reaches this table — see lib/change-log.ts. Read-only by
 * design; the section itself is not completable.
 */
export function ChangeLogSection({
  entries,
  currentVersion,
}: {
  entries: ProductChangeLogEntry[];
  currentVersion: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <History className="size-6" />
        </span>
        <p className="text-sm font-medium">No changes recorded yet</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Every change to the specification — pins, materials, measurements,
          spec sheets, pages and product setup — will appear here under the
          version it happened in.
        </p>
      </div>
    );
  }

  const groups = groupByVersion(entries);

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const meta = group.bump ? readVersionBumpMeta(group.bump.data) : null;
        return (
          // Keyed by a member row's id, not the version label: a logChange
          // racing a bump can (rarely) split one version across two groups,
          // which must degrade to two rendered groups — never duplicate keys.
          <section
            key={group.bump?.id ?? group.entries[0]?.id ?? group.version}
          >
            {/* Version header: label chip + the bump's note and date. */}
            <div className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
              <span className="text-sm font-semibold">{group.version}</span>
              {group.version === currentVersion && (
                <Badge variant="secondary" className="text-[10px]">
                  Current
                </Badge>
              )}
              {meta?.note && (
                <span className="text-muted-foreground text-sm">
                  {meta.note}
                </span>
              )}
              {group.bump && (
                <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">
                  Created <LocalTime iso={group.bump.created_at} />
                </span>
              )}
            </div>

            {group.entries.length === 0 ? (
              <p className="text-muted-foreground py-3 text-sm">
                No changes under this version yet.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground w-36 shrink-0 text-xs leading-5 whitespace-nowrap tabular-nums">
                      <LocalTime iso={entry.created_at} />
                    </span>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] whitespace-nowrap"
                    >
                      {changeAreaLabel(entry.area)}
                    </Badge>
                    <span className="min-w-0 flex-1">{entry.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {entries.length >= CHANGE_LOG_FETCH_LIMIT && (
        <p className="text-muted-foreground text-xs">
          Showing the latest {CHANGE_LOG_FETCH_LIMIT} changes.
        </p>
      )}
    </div>
  );
}
