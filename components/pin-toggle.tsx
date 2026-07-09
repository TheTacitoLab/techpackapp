"use client";

import { Pin } from "lucide-react";

import { usePins } from "@/components/pins-context";
import { Button } from "@/components/ui/button";
import type { PinType } from "@/lib/pins";
import { cn } from "@/lib/utils";

/**
 * The one pin control, shared by every surface (collection cards + headers,
 * product cards + header). `card` appearance follows the grid-card action
 * pattern — hidden until hover — except a pinned item keeps its pin visible
 * so pinned state reads at a glance.
 */
export function PinToggle({
  type,
  id,
  appearance = "header",
  className,
}: {
  type: PinType;
  id: string;
  appearance?: "header" | "card";
  className?: string;
}) {
  const { isPinned, togglePin } = usePins();
  const pinned = isPinned(type, id);
  const label = pinned ? "Unpin" : "Pin";

  return (
    <Button
      variant={appearance === "header" ? "outline" : "ghost"}
      size="icon"
      className={cn(
        appearance === "header" && "size-8",
        appearance === "card" &&
          cn(
            "size-7 shrink-0 transition-opacity",
            pinned
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          ),
        className,
      )}
      onClick={(event) => {
        // Cards wrap the toggle in links — pinning must never navigate.
        event.preventDefault();
        event.stopPropagation();
        togglePin(type, id);
      }}
      aria-label={label}
      aria-pressed={pinned}
      title={label}
    >
      <Pin
        className={cn("size-4", pinned && "fill-current")}
        aria-hidden="true"
      />
    </Button>
  );
}
