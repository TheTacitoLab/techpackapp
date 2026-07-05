"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

import {
  fitImageArea,
  templateCellLayout,
} from "@/lib/canvas-layout";
import { normaliseFitMode, slotImageObjectFit } from "@/lib/cover-geometry";
import { cn } from "@/lib/utils";
import type { ResolvedCanvasPage } from "@/types";

/**
 * A small, non-interactive render of a page's template layout — filled slots
 * show their asset thumbnail (`object-cover`/`contain` per fit mode), empty
 * slots a muted image-icon fill. Instantly recognisable ("that's my front
 * view"). Shared by the Page Overview cards and the Edit-mode thumbnail strip.
 *
 * Uses the SAME shared layout module (`lib/canvas-layout.ts`) as the full-size
 * canvas and the PDF, scaled down: an image-area-aspect replica, letterboxed in
 * the caller's box, subdivided into the template's cells. So a Quad thumbnail is
 * a correctly-proportioned 2×2, a Single one correctly-proportioned box, etc. —
 * never the old stretched-grid distortion. Height (and width) come from the
 * caller's `className`; the replica fits inside, preserving proportion.
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () =>
      setAvail({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const replica = fitImageArea(avail.width, avail.height);
  const cells = templateCellLayout(page.template, {
    left: 0,
    top: 0,
    width: replica.width,
    height: replica.height,
  });
  const slots = [...page.slots].sort((a, b) => a.slot_index - b.slot_index);

  return (
    <div
      ref={boxRef}
      className={cn(
        "bg-muted flex w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      {/* The proportional replica — same aspect + arrangement + gutters as the
          editor and the PDF, just scaled to the thumbnail. */}
      <div
        className="relative shrink-0"
        style={{ width: replica.width, height: replica.height }}
      >
        {slots.map((slot, i) => {
          const layout = cells[i];
          if (!layout) return null;
          const { cell } = layout;
          return (
            <div
              key={slot.id}
              className="bg-muted-foreground/10 absolute flex items-center justify-center overflow-hidden rounded-[2px]"
              style={{
                left: cell.left,
                top: cell.top,
                width: cell.width,
                height: cell.height,
              }}
            >
              {slot.asset ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slot.asset.file_url}
                  alt={slot.asset.name}
                  className="size-full"
                  style={{
                    // Mirror the slot's fit mode so a letterboxed ('fit') slot
                    // reads correctly in the thumbnail. Deliberately NO
                    // crop/zoom transform: crop_x/crop_y are slot-local px,
                    // meaningless at thumbnail scale — the mini identifies WHICH
                    // image is placed and its arrangement, not its framing.
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
          );
        })}
      </div>
    </div>
  );
}
