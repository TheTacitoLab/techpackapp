"use client";

import { ImageIcon } from "lucide-react";

import { GRID_CLASS } from "@/components/canvas/canvas-templates";
import { normaliseFitMode, slotImageObjectFit } from "@/lib/cover-geometry";
import { cn } from "@/lib/utils";
import type { ResolvedCanvasPage } from "@/types";

/**
 * A small, non-interactive render of a page's template layout — filled slots
 * show their asset thumbnail (`object-cover`), empty slots a muted image-icon
 * fill. Instantly recognisable ("that's my front view"). Shared by the Page
 * Overview cards and the Edit-mode thumbnail strip; height comes from the parent.
 */
export function MiniTemplate({
  page,
  className,
  iconClassName,
}: {
  page: ResolvedCanvasPage;
  className?: string;
  iconClassName?: string;
}) {
  const slots = [...page.slots].sort((a, b) => a.slot_index - b.slot_index);

  return (
    <div
      className={cn(
        "bg-muted grid gap-0.5 overflow-hidden",
        GRID_CLASS[page.template],
        className,
      )}
    >
      {slots.map((slot) => (
        <div
          key={slot.id}
          className="bg-muted-foreground/10 relative flex items-center justify-center overflow-hidden"
        >
          {slot.asset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.asset.file_url}
              alt={slot.asset.name}
              className="size-full"
              style={{
                // Mirror the slot's fit mode so a letterboxed ('fit') slot is
                // recognisable in the thumbnail. Deliberately NO crop/zoom
                // transform here: crop_x/crop_y are SLOT-local pixels, which
                // are meaningless in a ~90px thumb (a deep pan used to shove
                // the image right out of the thumbnail, leaving it blank).
                // The mini identifies WHICH image is placed, not its framing.
                objectFit: slotImageObjectFit(normaliseFitMode(slot.fit_mode)),
              }}
              draggable={false}
            />
          ) : (
            <ImageIcon
              className={cn("text-muted-foreground/50 size-4", iconClassName)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
