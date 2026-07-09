import type * as React from "react";

import { cn } from "@/lib/utils";
import type { WorkspaceColour } from "@/types";

/**
 * Pantone-style chip card for a workspace library colour — the web twin of
 * the PDF cover's palette swatch cards (`lib/pdf/palette-blocks.tsx`): a
 * colour block over a pale info band, hairline border, rounded corners, and a
 * restrained shadow so the card lifts off the page without floating.
 *
 * `size="full"` is the Settings grid card — colour block filling roughly the
 * top two-thirds, info band carrying name / pantone / hex, with an optional
 * `action` slot (dropdown trigger) at the band's right edge.
 * `size="compact"` is the pin editors' picker variant — short block, single
 * info line.
 *
 * Presentational only; callers own interactivity (the picker wraps it in a
 * button, the Settings grid overlays a menu via `action`).
 */
export function ColourChipCard({
  colour,
  size = "full",
  action,
  className,
}: {
  colour: Pick<WorkspaceColour, "name" | "hex" | "pantone">;
  size?: "full" | "compact";
  action?: React.ReactNode;
  className?: string;
}) {
  if (size === "compact") {
    return (
      <div
        className={cn(
          "bg-card overflow-hidden rounded-md border shadow-sm",
          className,
        )}
      >
        <div
          className="h-10 border-b"
          style={{ backgroundColor: colour.hex }}
        />
        <p className="truncate px-2 py-1 text-left text-xs font-medium">
          {colour.name}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="h-24 border-b" style={{ backgroundColor: colour.hex }} />
      <div className="flex items-start justify-between gap-1 px-2.5 py-2">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{colour.name}</p>
          {colour.pantone && (
            <p className="text-muted-foreground truncate text-xs">
              {colour.pantone}
            </p>
          )}
          <p className="text-muted-foreground font-mono text-xs uppercase">
            {colour.hex}
          </p>
        </div>
        {action}
      </div>
    </div>
  );
}
