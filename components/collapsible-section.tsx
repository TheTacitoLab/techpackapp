"use client";

import * as React from "react";
import { Check, ChevronDown, Circle } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useUiStore } from "@/stores/ui-store";
import type { SectionStatus } from "@/types";

function StatusIndicator({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <span className="bg-brand text-brand-foreground flex size-5 items-center justify-center rounded-full">
        <Check className="size-3" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="border-input flex size-5 items-center justify-center rounded-full border">
        <span className="bg-brand size-2 rounded-full" />
      </span>
    );
  }
  return (
    <span className="border-input flex size-5 items-center justify-center rounded-full border">
      <Circle className="size-2 text-transparent" />
    </span>
  );
}

/**
 * The core "progression through the tech pack" component: a collapsible section
 * with a completion indicator (tick / dot / empty), icon, title, and an
 * animated chevron. Open/closed state is remembered per section_key.
 *
 * `status: null` marks a section that is a record rather than a task (the
 * Change Log): no completion indicator, just an aligning spacer. `action`
 * renders an interactive control (the "Mark complete" toggle) in the banner —
 * as a SIBLING of the collapse triggers, never nested inside them, so the
 * header stays valid HTML (no button-in-button) and clicking the control
 * doesn't toggle the section. Title and chevron are two separate triggers
 * wired to the same Radix state.
 */
export function CollapsibleSection({
  sectionKey,
  title,
  icon,
  status,
  action,
  defaultOpen = false,
  children,
}: {
  sectionKey: string;
  title: string;
  icon: React.ReactNode;
  status: SectionStatus | null;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const storedOpen = useUiStore((state) => state.openSections[sectionKey]);
  const setSectionOpen = useUiStore((state) => state.setSectionOpen);

  // Render the SSR/first-paint value (defaultOpen), then adopt the persisted
  // value after hydration. useSyncExternalStore returns the server snapshot
  // first, avoiding a hydration mismatch without setState-in-effect.
  const hydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const open = hydrated ? (storedOpen ?? defaultOpen) : defaultOpen;

  // No `overflow-hidden` on the root or the content: a clipping ancestor
  // would break the sticky toolbar inside Technical Details (sticky pins to
  // the nearest scroll container, which overflow:hidden creates). The
  // expand/collapse clip instead lives inside the animation keyframes
  // (globals.css), and the header row rounds its own corners to match the card.
  return (
    <Collapsible
      id={`section-${sectionKey}`}
      open={open}
      onOpenChange={(next) => setSectionOpen(sectionKey, next)}
      className="bg-card shadow-card group/section rounded-xl"
    >
      <div
        // The row-wide hover matches the old single-trigger affordance, so
        // its few own pixels (the gutters around the action and the right
        // padding) must toggle too — but only when the click target IS the
        // div, never bubbled from the triggers or the action button.
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSectionOpen(sectionKey, !open);
          }
        }}
        className="hover:bg-accent/50 flex h-14 items-center gap-3 rounded-t-xl pr-5 transition-colors group-data-[state=closed]/section:rounded-b-xl"
      >
        <CollapsibleTrigger className="focus-visible:ring-ring flex h-full min-w-0 flex-1 items-center gap-3 rounded-t-xl pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset">
          {status === null ? (
            <span aria-hidden className="size-5 shrink-0" />
          ) : (
            <StatusIndicator status={status} />
          )}
          <span className="text-muted-foreground flex size-5 items-center justify-center [&_svg]:size-4">
            {icon}
          </span>
          <span className="flex-1 truncate text-base font-semibold">
            {title}
          </span>
        </CollapsibleTrigger>
        {action}
        <CollapsibleTrigger
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="group hover:bg-accent focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2"
        >
          <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="data-[state=closed]:animate-section-up data-[state=open]:animate-section-down">
        <div className="border-border border-t px-5 py-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
