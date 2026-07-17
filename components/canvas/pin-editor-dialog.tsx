"use client";

import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The single centered container EVERY pin editor opens in — Fabrics & Trim and
 * Colourways today, Construction next. One shared pattern, deliberately a
 * `Dialog` and NOT a `Popover`.
 *
 * Why: an anchored popover renders next to the pin, so a pin placed near a slot
 * edge (especially the top) opens clipped/cut off with nowhere to expand. A
 * modal Dialog is centered in the viewport by design — no anchor/collision math,
 * fully visible at any pin position, any zoom, any slot.
 *
 * It keeps EXACTLY the contract the popover had, so nothing downstream changes:
 * fully controlled via `open`/`onOpenChange`, and its portal unmounts on close.
 * That last property is what the Colourways "Re-sample from image" flow depends
 * on — closing the editor (`open=false`) removes this overlay entirely so the
 * click lands on the canvas capture layer, then reopening (`open=true`) restores
 * it with the parent-held draft state intact. Same mechanics as before, just a
 * centered container instead of an anchored one.
 *
 * `title` is the accessible (screen-reader) name; `header` is the visible header
 * row (the reference-code chip in edit mode, the "New … pin" label in create
 * mode). The close (X) is intentionally hidden — every editor carries its own
 * Cancel/Save, exactly as under the popover; Escape and backdrop-click still
 * dismiss (routing through `onOpenChange`, same as the popover did).
 *
 * HEIGHT: capped at the viewport (minus a 1rem gutter top and bottom) with the
 * body scrolling INTERNALLY, so a tall editor — Fabrics & Trim is the worst
 * case — can never grow past the top or bottom edge and clip its own tabs or
 * Save button, at any zoom or screen height. The cap lives here, once, so
 * every editor that opens in this container inherits it. Select/Popover menus
 * inside portal to `document.body`, so the scroll container never clips them.
 */
export function PinEditorDialog({
  open,
  onOpenChange,
  title,
  header,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible dialog name for screen readers (visually hidden). */
  title: string;
  /** Visible header row rendered above the editor body. */
  header?: ReactNode;
  /** Width/spacing overrides (e.g. `w-64` for the generic label/notes editor). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "max-h-[calc(100dvh-2rem)] w-[27rem] gap-3 overflow-y-auto p-4",
          className,
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {header}
        {children}
      </DialogContent>
    </Dialog>
  );
}
